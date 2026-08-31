from __future__ import annotations

import argparse
import hashlib
import json
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import fitz

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
SOURCE_DIR = MANIFEST_PATH.parent
MIN_FULL_SOURCE_PAGES = 20
REQUIRED_MARKERS = (
    "QCVN 41:2024/BGTVT",
    "PHU LUC B",
    "PHU LUC C",
    "PHU LUC D",
    "PHU LUC E",
    "PHU LUC F",
    "P.101",
    "W.201",
    "R.301",
    "I.401",
    "S.501",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character)).upper()


def validate_https_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("official technical source URL must be an HTTPS URL without credentials")
    return value


def inspect_pdf(path: Path) -> tuple[int, list[str]]:
    try:
        document = fitz.open(path)
    except Exception as error:
        raise ValueError(f"cannot open technical source PDF: {error}") from error

    try:
        page_count = document.page_count
        if page_count < MIN_FULL_SOURCE_PAGES:
            raise ValueError(
                f"technical source has only {page_count} page(s); expected a full QCVN document, not the one-page promulgation circular"
            )

        chunks: list[str] = []
        for page in document:
            chunks.append(page.get_text("text"))
        searchable = fold_text("\n".join(chunks))
    finally:
        document.close()

    missing = [marker for marker in REQUIRED_MARKERS if fold_text(marker) not in searchable]
    return page_count, missing


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify that the local traffic-sign technical source is a full QCVN 41:2024/BGTVT document before production use."
    )
    parser.add_argument("--reviewer", required=True, help="Human reviewer name/identifier recorded in provenance metadata")
    parser.add_argument(
        "--official-url",
        help="HTTPS URL from which the full technical source was obtained. Overrides technicalSource.officialUrl.",
    )
    args = parser.parse_args()

    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"Missing source manifest: {MANIFEST_PATH}")

    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        technical = manifest.get("technicalSource")
        if not isinstance(technical, dict):
            raise ValueError("source-manifest.json is missing technicalSource")

        filename = technical.get("localFile")
        if not isinstance(filename, str) or not filename.strip() or Path(filename).name != filename:
            raise ValueError("technicalSource.localFile must be a plain filename")
        source = SOURCE_DIR / filename
        if not source.is_file():
            raise ValueError(f"missing full technical source: {source}")

        official_url = args.official_url or technical.get("officialUrl")
        if not isinstance(official_url, str) or not official_url.strip():
            raise ValueError(
                "the full technical source needs an official HTTPS origin; pass --official-url or set technicalSource.officialUrl"
            )
        official_url = validate_https_url(official_url.strip())

        page_count, missing_markers = inspect_pdf(source)
        if missing_markers:
            raise ValueError(
                "technical source does not expose expected QCVN/sign appendices in extractable text; missing markers: "
                + ", ".join(missing_markers)
            )

        checksum = sha256_file(source)
        technical["officialUrl"] = official_url
        technical["sourceSha256"] = checksum
        technical["sourceSizeBytes"] = source.stat().st_size
        technical["pageCount"] = page_count
        technical["verificationStatus"] = "verified-official-full-source"
        technical["verifiedBy"] = args.reviewer.strip()
        technical["verifiedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        technical["verificationMarkers"] = list(REQUIRED_MARKERS)

        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot verify traffic-sign technical source: {error}") from error

    print(f"[ok] verified technical source: {source}")
    print(f"[ok] pages: {page_count}")
    print(f"[ok] sha256: {checksum}")
    print(f"[ok] reviewer: {args.reviewer.strip()}")
    print(f"[ok] manifest updated: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
