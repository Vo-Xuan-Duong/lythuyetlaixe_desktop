from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_CANDIDATES = ROOT / "data" / "traffic-signs" / "raw" / "official-candidates.json"
REFERENCE_CANDIDATES = ROOT / "data" / "traffic-signs" / "raw" / "reference-candidates.json"
SOURCE_MANIFEST = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
DEFAULT_OUTPUT = ROOT / "data" / "traffic-signs" / "raw" / "manual-review.json"
QUOTED_RE = re.compile(r"[\"“”']([^\"“”']{2,160})[\"“”']")


def load_json(path: Path, label: str) -> dict:
    if not path.is_file():
        raise ValueError(f"missing {label}: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def choose_candidates(allow_reference: bool) -> tuple[Path, dict, bool]:
    if OFFICIAL_CANDIDATES.is_file():
        return OFFICIAL_CANDIDATES, load_json(OFFICIAL_CANDIDATES, "official candidates"), True
    if allow_reference and REFERENCE_CANDIDATES.is_file():
        return REFERENCE_CANDIDATES, load_json(REFERENCE_CANDIDATES, "reference candidates"), False
    raise ValueError(
        "no official candidates found; run signs:candidates:official after source verification"
        + (" or generate reference candidates" if allow_reference else "")
    )


def name_seed(heading: str, codes: list[str]) -> str:
    quoted = [match.strip() for match in QUOTED_RE.findall(heading) if match.strip()]
    if len(codes) == 1 and quoted:
        return quoted[0]
    return ""


def normalized_image_candidates(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    result: list[dict] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        file = item.get("file")
        if not isinstance(file, str) or not file.strip():
            continue
        result.append(
            {
                "file": file.strip(),
                "page": item.get("page"),
                "crop": item.get("crop"),
                "status": item.get("status"),
            }
        )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a manual-review JSON file from extracted traffic-sign candidate sections")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--allow-reference-seed",
        action="store_true",
        help="Allow non-production reference candidates only as a typing aid. Records still require official verification before apply.",
    )
    args = parser.parse_args()

    try:
        source_manifest = load_json(SOURCE_MANIFEST, "traffic-sign source manifest")
        candidate_path, candidate_doc, from_official = choose_candidates(args.allow_reference_seed)
        candidates = candidate_doc.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("candidate file contains no sections")

        technical = source_manifest.get("technicalSource")
        technical_sha = technical.get("sourceSha256") if isinstance(technical, dict) else None
        records: list[dict] = []
        sections_without_codes: list[dict] = []
        seen: set[str] = set()

        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            codes = candidate.get("codes")
            if not isinstance(codes, list) or not codes:
                sections_without_codes.append(
                    {
                        "section": candidate.get("section"),
                        "heading": candidate.get("heading"),
                        "sourcePages": [candidate.get("startPage"), candidate.get("endPage")],
                    }
                )
                continue

            image_candidates = normalized_image_candidates(candidate.get("imageCandidates")) if from_official else []
            for raw_code in codes:
                if not isinstance(raw_code, str) or not raw_code.strip():
                    continue
                code = raw_code.strip().upper()
                if code in seen:
                    continue
                seen.add(code)
                start_page = candidate.get("startPage")
                end_page = candidate.get("endPage")
                source_pages = sorted({page for page in (start_page, end_page) if isinstance(page, int) and page > 0})
                records.append(
                    {
                        "code": code,
                        "groupCode": candidate.get("groupCode"),
                        "name": name_seed(str(candidate.get("heading") or ""), codes),
                        "meaning": "",
                        "recognition": "",
                        "scope": "",
                        "exceptions": [],
                        "notes": "",
                        "image": None,
                        "imageVerified": False,
                        "candidateImages": image_candidates,
                        "keywords": [],
                        "sourceVersion": source_manifest.get("sourceDocument"),
                        "sourceSection": candidate.get("section"),
                        "sourcePages": source_pages,
                        "candidateHeading": candidate.get("heading"),
                        "candidateText": candidate.get("body"),
                        "verified": False,
                        "verifiedBy": "",
                        "verifiedAt": "",
                    }
                )

        output = {
            "dataset": "VN_TRAFFIC_SIGNS_REVIEW",
            "stage": "manual-review",
            "version": "2025.01",
            "validFrom": source_manifest.get("effectiveFrom"),
            "sourceDocument": source_manifest.get("sourceDocument"),
            "sourceSha256": technical_sha if from_official else None,
            "candidateSource": "official-technical-source" if from_official else "reference-only",
            "candidateFile": str(candidate_path.relative_to(ROOT)).replace("\\", "/"),
            "notes": "Fill final fields from the verified official technical source. candidateText/candidateImages are context only and are never promoted automatically. If image is set, imageVerified must be true before apply.",
            "records": records,
            "sectionsWithoutCodes": sections_without_codes,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot prepare traffic-sign manual review: {error}") from error

    print(f"[ok] candidate source: {candidate_path}")
    print(f"[ok] review records: {len(records)}")
    print(f"[ok] sections without detected codes: {len(sections_without_codes)}")
    print(f"[ok] output: {args.output}")
    if not from_official:
        print("WARNING: reference-only seed. Do not mark records verified until checked against verified official technicalSource.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
