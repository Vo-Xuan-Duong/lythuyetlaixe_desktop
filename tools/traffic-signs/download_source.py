from __future__ import annotations

import html
import json
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote_plus, urljoin, urlparse

import fitz

from source_provenance import EXPECTED_GAZETTE_ISSUES, canonical_bundle_sha256, sha256_file

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
SOURCE_DIR = MANIFEST_PATH.parent
MAX_SOURCE_BYTES = 128 * 1024 * 1024
MAX_REGISTRY_BYTES = 4 * 1024 * 1024
GOVERNMENT_HOST_SUFFIX = "chinhphu.vn"


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.current_href: str | None = None
        self.current_text: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[no-untyped-def]
        if tag != "a":
            return
        self.current_href = next((value for key, value in attrs if key == "href"), None)
        self.current_text = []

    def handle_data(self, data: str) -> None:
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or self.current_href is None:
            return
        text = " ".join("".join(self.current_text).split())
        self.links.append((self.current_href, text))
        self.current_href = None
        self.current_text = []


def validate_local_filename(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}.localFile is required")
    filename = value.strip()
    if Path(filename).name != filename or filename in {".", ".."}:
        raise ValueError(f"{label}.localFile must be a plain filename inside data/traffic-signs/source")
    return filename


def validate_https_url(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} URL is missing")
    url = value.strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"{label} URL must use HTTPS")
    if parsed.username or parsed.password:
        raise ValueError(f"{label} URL must not contain credentials")
    return url


def validate_government_host(url: str, label: str) -> str:
    parsed = urlparse(validate_https_url(url, label))
    hostname = (parsed.hostname or "").lower()
    if hostname != GOVERNMENT_HOST_SUFFIX and not hostname.endswith(f".{GOVERNMENT_HOST_SUFFIX}"):
        raise ValueError(f"{label} must stay on official *.chinhphu.vn infrastructure, found: {hostname or '<missing>'}")
    return url


def request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={"User-Agent": "lythuyetlaixe-dataset-tool/1.0"},
        method="GET",
    )


def download_file(
    url: str,
    destination: Path,
    label: str,
    *,
    require_government_host: bool = False,
) -> tuple[str, int, str]:
    temporary = destination.with_suffix(destination.suffix + ".download")
    temporary.unlink(missing_ok=True)
    try:
        with urllib.request.urlopen(request(url), timeout=90) as response, temporary.open("wb") as output:
            final_url = response.geturl()
            validate_https_url(final_url, label)
            if require_government_host:
                validate_government_host(final_url, label)
            declared_length = response.headers.get("Content-Length")
            if declared_length:
                try:
                    length = int(declared_length)
                except ValueError:
                    length = None
                if length is not None and length > MAX_SOURCE_BYTES:
                    raise ValueError(f"{label} exceeds the 128 MiB safety limit")

            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise ValueError(f"{label} exceeds the 128 MiB safety limit")
                output.write(chunk)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    temporary.replace(destination)
    return sha256_file(destination), destination.stat().st_size, final_url


def process_legal_basis(entry: dict) -> None:
    url = validate_https_url(entry.get("officialUrl"), "legalBasis")
    filename = validate_local_filename(entry.get("localFile"), "legalBasis")
    destination = SOURCE_DIR / filename
    checksum, size_bytes, final_url = download_file(url, destination, "legalBasis")
    entry.update(
        sourceSha256=checksum,
        sourceSizeBytes=size_bytes,
        downloadedFrom=final_url,
        verificationStatus="downloaded-and-sha256-recorded",
    )
    print(f"[ok] legalBasis: {destination}")


def fetch_registry_links(registry_url: str) -> list[tuple[str, str]]:
    validate_government_host(registry_url, "technicalSource.registryUrl")
    with urllib.request.urlopen(request(registry_url), timeout=60) as response:
        final_url = response.geturl()
        validate_government_host(final_url, "technicalSource.registryUrl")
        raw = response.read(MAX_REGISTRY_BYTES + 1)
        if len(raw) > MAX_REGISTRY_BYTES:
            raise ValueError("Government Gazette registry HTML exceeds 4 MiB")
        charset = response.headers.get_content_charset() or "utf-8"
        text = raw.decode(charset, errors="replace")
        parser = LinkCollector()
        parser.feed(text)
        return [(urljoin(final_url, href), html.unescape(label)) for href, label in parser.links]


def href_filename(url: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if query.get("file_name"):
        return unquote_plus(query["file_name"][0]).strip()
    return unquote_plus(Path(parsed.path).name).strip()


def normalized_filename(value: str) -> str:
    return " ".join(value.replace("+", " ").split()).casefold()


def resolve_part_url(links: list[tuple[str, str]], expected_filename: str) -> str:
    expected = normalized_filename(expected_filename)
    for href, label in links:
        if normalized_filename(label) == expected or normalized_filename(href_filename(href)) == expected:
            return validate_government_host(href, f"technical part {expected_filename}")
    raise ValueError(f"Government Gazette registry does not expose expected PDF: {expected_filename}")


def merge_pdf_parts(part_files: list[Path], destination: Path) -> tuple[int, str]:
    temporary = destination.with_suffix(destination.suffix + ".merge")
    temporary.unlink(missing_ok=True)
    combined = fitz.open()
    try:
        for source in part_files:
            part = fitz.open(source)
            try:
                if part.page_count <= 0:
                    raise ValueError(f"official Gazette PDF has no pages: {source}")
                combined.insert_pdf(part)
            finally:
                part.close()
        combined.set_metadata({})
        combined.save(temporary, garbage=4, deflate=True, clean=True)
        page_count = combined.page_count
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    finally:
        combined.close()
    temporary.replace(destination)
    return page_count, sha256_file(destination)


def process_technical_source(entry: dict) -> None:
    if entry.get("acquisitionMethod") != "official-gazette-multipart":
        raise ValueError("technicalSource.acquisitionMethod must be official-gazette-multipart")
    registry_url = validate_government_host(entry.get("registryUrl"), "technicalSource.registryUrl")
    parts = entry.get("parts")
    if not isinstance(parts, list) or len(parts) != len(EXPECTED_GAZETTE_ISSUES):
        raise ValueError("technicalSource.parts must contain exactly the 5 published Gazette PDF parts")

    links = fetch_registry_links(registry_url)
    local_parts: list[Path] = []
    for index, (part, expected_issue) in enumerate(zip(parts, EXPECTED_GAZETTE_ISSUES), start=1):
        if not isinstance(part, dict):
            raise ValueError(f"technicalSource.parts[{index}] must be an object")
        if str(part.get("issue") or "").strip() != expected_issue:
            raise ValueError(f"technicalSource.parts[{index}].issue must be {expected_issue}")
        expected_filename = part.get("fileName")
        if not isinstance(expected_filename, str) or not expected_filename.strip():
            raise ValueError(f"technicalSource.parts[{index}].fileName is required")
        local_filename = validate_local_filename(part.get("localFile"), f"technicalSource.parts[{index}]")
        url = resolve_part_url(links, expected_filename)
        destination = SOURCE_DIR / local_filename
        checksum, size_bytes, final_url = download_file(
            url,
            destination,
            f"technicalSource part {index}",
            require_government_host=True,
        )
        part.update(sourceSha256=checksum, sourceSizeBytes=size_bytes, downloadedFrom=final_url)
        local_parts.append(destination)
        print(f"[ok] technical part {index}/5: {destination} ({checksum})")

    combined_filename = validate_local_filename(entry.get("localFile"), "technicalSource")
    combined_path = SOURCE_DIR / combined_filename
    page_count, combined_sha = merge_pdf_parts(local_parts, combined_path)
    entry["sourceSha256"] = canonical_bundle_sha256(parts)
    entry["combinedSha256"] = combined_sha
    entry["pageCount"] = page_count
    entry["downloadedFrom"] = registry_url
    entry["verificationStatus"] = "downloaded-official-parts-pending-content-review"
    for key in ("verifiedBy", "verifiedAt", "verificationMarkers", "verifiedPartCount"):
        entry.pop(key, None)
    print(f"[ok] combined technical source: {combined_path}")
    print(f"[ok] combined pages: {page_count}")
    print(f"[ok] canonical bundle sha256: {entry['sourceSha256']}")


def main() -> int:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"Missing source manifest: {MANIFEST_PATH}")
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        legal_basis = manifest.get("legalBasis")
        technical = manifest.get("technicalSource")
        if not isinstance(legal_basis, dict) or not isinstance(technical, dict):
            raise ValueError("source-manifest.json must contain legalBasis and technicalSource")
        process_legal_basis(legal_basis)
        process_technical_source(technical)
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError, fitz.FileDataError) as error:
        raise SystemExit(f"Cannot prepare traffic-sign sources: {error}") from error

    print(f"[ok] manifest updated: {MANIFEST_PATH}")
    print("Next: pnpm signs:source:verify -- --reviewer <name>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
