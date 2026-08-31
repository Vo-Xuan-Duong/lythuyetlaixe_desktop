from __future__ import annotations

import argparse
import json
import unicodedata
from datetime import datetime, timezone

import fitz

from source_provenance import DEFAULT_MANIFEST, inspect_multipart_source

MIN_FULL_SOURCE_PAGES = 300
REQUIRED_MARKERS = (
    "QCVN 41:2024/BGTVT",
    "PHU LUC B",
    "PHU LUC C",
    "PHU LUC D",
    "PHU LUC E",
    "PHU LUC F",
    "P.101",
    "P.117",
    "P.118",
    "W.201",
    "R.301",
    "I.401",
    "S.501",
)


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character)).upper()


def inspect_pdf(path) -> tuple[int, list[str]]:  # type: ignore[no-untyped-def]
    try:
        document = fitz.open(path)
    except Exception as error:
        raise ValueError(f"cannot open combined technical source PDF: {error}") from error
    try:
        page_count = document.page_count
        if page_count < MIN_FULL_SOURCE_PAGES:
            raise ValueError(
                f"combined technical source has only {page_count} page(s); expected all 5 Government Gazette parts of QCVN 41:2024/BGTVT"
            )
        searchable = fold_text("\n".join(page.get_text("text") for page in document))
    finally:
        document.close()
    missing = [marker for marker in REQUIRED_MARKERS if fold_text(marker) not in searchable]
    return page_count, missing


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the five official Government Gazette parts of QCVN 41:2024/BGTVT and the combined local parsing PDF."
    )
    parser.add_argument("--reviewer", required=True, help="Human reviewer name/identifier recorded in provenance metadata")
    args = parser.parse_args()

    try:
        provenance = inspect_multipart_source(DEFAULT_MANIFEST, require_verified=False)
        page_count, missing_markers = inspect_pdf(provenance.combined_file)
        if missing_markers:
            raise ValueError(
                "combined official Gazette source is missing expected appendices/sign markers in extractable text: "
                + ", ".join(missing_markers)
            )

        technical = provenance.technical
        technical["pageCount"] = page_count
        technical["verificationStatus"] = "verified-official-full-source"
        technical["verifiedBy"] = args.reviewer.strip()
        technical["verifiedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        technical["verificationMarkers"] = list(REQUIRED_MARKERS)
        technical["verifiedPartCount"] = len(provenance.part_files)
        DEFAULT_MANIFEST.write_text(
            json.dumps(provenance.manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot verify traffic-sign technical source: {error}") from error

    print(f"[ok] verified official Gazette parts: {len(provenance.part_files)}")
    print(f"[ok] combined technical source: {provenance.combined_file}")
    print(f"[ok] combined pages: {page_count}")
    print(f"[ok] canonical bundle sha256: {provenance.source_sha256}")
    print(f"[ok] reviewer: {args.reviewer.strip()}")
    print(f"[ok] manifest updated: {DEFAULT_MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
