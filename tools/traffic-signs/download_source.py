from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
SOURCE_DIR = MANIFEST_PATH.parent
MAX_SOURCE_BYTES = 128 * 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_local_filename(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}.localFile is required")
    filename = value.strip()
    if Path(filename).name != filename or filename in {".", ".."}:
        raise ValueError(f"{label}.localFile must be a plain filename inside data/traffic-signs/source")
    return filename


def validate_https_url(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}.officialUrl is missing")
    url = value.strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"{label}.officialUrl must use HTTPS")
    if parsed.username or parsed.password:
        raise ValueError(f"{label}.officialUrl must not contain credentials")
    return url


def download_file(url: str, destination: Path, label: str) -> tuple[str, int, str]:
    temporary = destination.with_suffix(destination.suffix + ".download")
    temporary.unlink(missing_ok=True)

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "lythuyetlaixe-dataset-tool/1.0"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            final_url = response.geturl()
            parsed_final = urlparse(final_url)
            if parsed_final.scheme != "https" or not parsed_final.netloc:
                raise RuntimeError(f"{label} redirected to a non-HTTPS URL: {final_url}")

            declared_length = response.headers.get("Content-Length")
            if declared_length:
                try:
                    if int(declared_length) > MAX_SOURCE_BYTES:
                        raise RuntimeError(f"{label} exceeds the 128 MiB safety limit")
                except ValueError:
                    pass

            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise RuntimeError(f"{label} exceeds the 128 MiB safety limit")
                output.write(chunk)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    temporary.replace(destination)
    return sha256_file(destination), destination.stat().st_size, final_url


def process_downloaded_entry(entry: dict, label: str) -> None:
    url = validate_https_url(entry.get("officialUrl"), label)
    filename = validate_local_filename(entry.get("localFile"), label)
    destination = SOURCE_DIR / filename
    checksum, size_bytes, final_url = download_file(url, destination, label)
    entry["sourceSha256"] = checksum
    entry["sourceSizeBytes"] = size_bytes
    entry["downloadedFrom"] = final_url
    entry["verificationStatus"] = "downloaded-and-sha256-recorded"
    print(f"[ok] {label}: {destination}")
    print(f"[ok] {label} sha256: {checksum}")


def process_existing_technical_source(entry: dict) -> bool:
    filename = validate_local_filename(entry.get("localFile"), "technicalSource")
    source = SOURCE_DIR / filename
    if not source.is_file():
        return False

    checksum = sha256_file(source)
    entry["sourceSha256"] = checksum
    entry["sourceSizeBytes"] = source.stat().st_size
    if entry.get("verificationStatus") != "verified-official-full-source":
        entry["verificationStatus"] = "local-file-sha256-recorded-pending-content-review"
    print(f"[ok] technicalSource local file: {source}")
    print(f"[ok] technicalSource sha256: {checksum}")
    return True


def main() -> int:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"Missing source manifest: {MANIFEST_PATH}")

    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        legal_basis = manifest.get("legalBasis")
        technical_source = manifest.get("technicalSource")
        if not isinstance(legal_basis, dict):
            raise ValueError("source-manifest.json is missing legalBasis")
        if not isinstance(technical_source, dict):
            raise ValueError("source-manifest.json is missing technicalSource")

        process_downloaded_entry(legal_basis, "legalBasis")

        technical_url = technical_source.get("officialUrl")
        if isinstance(technical_url, str) and technical_url.strip():
            process_downloaded_entry(technical_source, "technicalSource")
            technical_source["verificationStatus"] = "downloaded-and-sha256-recorded-pending-content-review"
        elif not process_existing_technical_source(technical_source):
            print(
                "[pending] technicalSource: chưa có officialUrl và chưa có file local "
                f"{technical_source.get('localFile', 'qcvn-41-2024-bgvt-full.pdf')}."
            )
            print(
                "          Cần bản đầy đủ QCVN 41:2024/BGTVT có các phụ lục kỹ thuật; "
                "PDF Thông tư một trang không đủ làm source of truth cho từng biển."
            )

        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot prepare traffic-sign sources: {error}") from error

    print(f"[ok] manifest updated: {MANIFEST_PATH}")
    print("Next: verify the full technical source before building a production catalog.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
