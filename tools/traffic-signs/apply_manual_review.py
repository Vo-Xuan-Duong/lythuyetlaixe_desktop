from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from source_provenance import DEFAULT_MANIFEST, inspect_multipart_source

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REVIEW = ROOT / "data" / "traffic-signs" / "raw" / "manual-review.json"
DEFAULT_OUTPUT = ROOT / "data" / "traffic-signs" / "processed" / "traffic-signs.json"
OFFICIAL_CANDIDATES = ROOT / "data" / "traffic-signs" / "raw" / "official-candidates.json"
GROUPS = {"PROHIBITION", "MANDATORY", "WARNING", "INDICATION", "SUPPLEMENTARY"}
IMAGE_SELECTION_METHODS = {"official-qcvn-candidate", "official-qcvn-manual-crop"}
CODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.,_-]{0,31}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


def load_json(path: Path, label: str) -> dict:
    if not path.is_file():
        raise ValueError(f"missing {label}: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def require_non_empty_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} is required")
    return value.strip()


def optional_string(value: object, label: str) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string when provided")
    return value.strip() or None


def string_array(value: object, label: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be an array")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{label} must contain only non-empty strings")
        result.append(item.strip())
    return result


def safe_relative_path(value: object, label: str) -> str:
    path_value = require_non_empty_string(value, label).replace("\\", "/").removeprefix("./")
    parts = path_value.split("/")
    if path_value.startswith("/") or re.match(r"^[A-Za-z]:", path_value) or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"{label} is unsafe: {value}")
    return "/".join(parts)


def normalize_crop(value: object, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError(f"{label} must be [x0,y0,x1,y1]")
    result: list[float] = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)):
            raise ValueError(f"{label} must contain finite numbers")
        result.append(round(float(item), 2))
    if result[2] <= result[0] or result[3] <= result[1]:
        raise ValueError(f"{label} must have positive area")
    return result


def official_candidate_codes(source_sha256: str) -> set[str]:
    candidates = load_json(OFFICIAL_CANDIDATES, "official traffic-sign candidates")
    if candidates.get("stage") != "review-candidate":
        raise ValueError("official-candidates.json has an unsupported stage")
    if str(candidates.get("sourceSha256") or "").strip().lower() != source_sha256:
        raise ValueError("official candidates were not generated from the currently verified source bundle")
    rows = candidates.get("candidates")
    if not isinstance(rows, list) or not rows:
        raise ValueError("official candidates contain no sections")
    result: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("official candidate rows must be objects")
        codes = row.get("codes")
        if not isinstance(codes, list) or not codes:
            raise ValueError(f"official candidate section {row.get('section')} has no detected codes; fix extraction/manual candidate metadata first")
        for code in codes:
            if not isinstance(code, str) or not CODE_RE.fullmatch(code.strip()):
                raise ValueError(f"invalid official candidate code: {code}")
            result.add(code.strip().upper())
    return result


def normalize_image_selection(
    value: object,
    *,
    code: str,
    image: str,
    source_sha256: str,
    source_section: str,
) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{code}: verified image requires imageSelection provenance")
    method = require_non_empty_string(value.get("method"), f"{code}.imageSelection.method")
    if method not in IMAGE_SELECTION_METHODS:
        raise ValueError(f"{code}: unsupported imageSelection method {method}")
    selection_sha = require_non_empty_string(value.get("sourceSha256"), f"{code}.imageSelection.sourceSha256").lower().removeprefix("sha256:")
    if not SHA_RE.fullmatch(selection_sha) or selection_sha != source_sha256:
        raise ValueError(f"{code}: imageSelection sourceSha256 does not match verified QCVN bundle")
    selection_section = require_non_empty_string(value.get("sourceSection"), f"{code}.imageSelection.sourceSection")
    if selection_section != source_section:
        raise ValueError(f"{code}: imageSelection sourceSection does not match record sourceSection")
    page = value.get("page")
    if isinstance(page, bool) or not isinstance(page, int) or page <= 0:
        raise ValueError(f"{code}: imageSelection.page must be a positive integer")
    crop = normalize_crop(value.get("crop"), f"{code}.imageSelection.crop")
    processed_asset = safe_relative_path(value.get("processedAsset"), f"{code}.imageSelection.processedAsset")
    if processed_asset != image:
        raise ValueError(f"{code}: imageSelection.processedAsset must match image")

    result = {
        "method": method,
        "sourceSha256": source_sha256,
        "sourceSection": source_section,
        "page": page,
        "crop": crop,
        "processedAsset": processed_asset,
    }
    if method == "official-qcvn-candidate":
        candidate = safe_relative_path(value.get("candidateFile"), f"{code}.imageSelection.candidateFile")
        if not candidate.startswith("image-candidates/"):
            raise ValueError(f"{code}: imageSelection.candidateFile must be inside image-candidates/")
        result["candidateFile"] = candidate
    return result


def normalize_record(record: dict, source_document: str, source_sha256: str) -> dict:
    code = require_non_empty_string(record.get("code"), "record.code").upper()
    if not CODE_RE.fullmatch(code):
        raise ValueError(f"{code}: invalid code")
    if record.get("verified") is not True:
        raise ValueError(f"{code}: record is not verified")
    verified_by = require_non_empty_string(record.get("verifiedBy"), f"{code}.verifiedBy")
    verified_at = require_non_empty_string(record.get("verifiedAt"), f"{code}.verifiedAt")
    group = require_non_empty_string(record.get("groupCode"), f"{code}.groupCode")
    if group not in GROUPS:
        raise ValueError(f"{code}: unsupported groupCode {group}")
    source_version = require_non_empty_string(record.get("sourceVersion"), f"{code}.sourceVersion")
    if source_version != source_document:
        raise ValueError(f"{code}: sourceVersion must match {source_document}")
    source_section = require_non_empty_string(record.get("sourceSection"), f"{code}.sourceSection")

    source_pages_raw = record.get("sourcePages")
    if not isinstance(source_pages_raw, list) or not source_pages_raw:
        raise ValueError(f"{code}: sourcePages must contain at least one page number")
    source_pages = sorted({page for page in source_pages_raw if isinstance(page, int) and not isinstance(page, bool) and page > 0})
    if not source_pages:
        raise ValueError(f"{code}: sourcePages must contain positive integers")

    image_raw = optional_string(record.get("image"), f"{code}.image")
    image = safe_relative_path(image_raw, f"{code}.image") if image_raw else None
    image_selection = None
    if image:
        if record.get("imageVerified") is not True:
            raise ValueError(f"{code}: image is set but imageVerified is not true")
        image_selection = normalize_image_selection(
            record.get("imageSelection"),
            code=code,
            image=image,
            source_sha256=source_sha256,
            source_section=source_section,
        )
    elif record.get("imageSelection") is not None or record.get("imageVerified") is True:
        raise ValueError(f"{code}: image verification/provenance is present without image")

    result = {
        "code": code,
        "name": require_non_empty_string(record.get("name"), f"{code}.name"),
        "groupCode": group,
        "meaning": require_non_empty_string(record.get("meaning"), f"{code}.meaning"),
        "recognition": optional_string(record.get("recognition"), f"{code}.recognition"),
        "scope": optional_string(record.get("scope"), f"{code}.scope"),
        "exceptions": string_array(record.get("exceptions"), f"{code}.exceptions"),
        "notes": optional_string(record.get("notes"), f"{code}.notes"),
        "image": image,
        "imageVerified": True if image else False,
        "keywords": string_array(record.get("keywords"), f"{code}.keywords"),
        "sourceVersion": source_version,
        "sourceSection": source_section,
        "sourcePages": source_pages,
        "verifiedBy": verified_by,
        "verifiedAt": verified_at,
    }
    if image_selection is not None:
        result["imageSelection"] = image_selection
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Build production traffic-signs.json from fully verified official manual-review records")
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    try:
        provenance = inspect_multipart_source(DEFAULT_MANIFEST, require_verified=True)
        review = load_json(args.review, "traffic-sign manual review")
        if review.get("dataset") != "VN_TRAFFIC_SIGNS_REVIEW" or review.get("stage") != "manual-review":
            raise ValueError("manual-review.json has an unsupported dataset/stage")
        if review.get("candidateSource") != "official-technical-source":
            raise ValueError("reference-only review files cannot be promoted; regenerate review from official candidates")
        if str(review.get("sourceSha256") or "").strip().lower() != provenance.source_sha256:
            raise ValueError("manual review sourceSha256 does not match the currently verified official bundle")
        unresolved_sections = review.get("sectionsWithoutCodes")
        if isinstance(unresolved_sections, list) and unresolved_sections:
            raise ValueError(f"manual review has {len(unresolved_sections)} source section(s) without detected codes")

        source_document = require_non_empty_string(provenance.manifest.get("sourceDocument"), "sourceDocument")
        if review.get("sourceDocument") != source_document:
            raise ValueError("manual review sourceDocument does not match verified source manifest")

        records = review.get("records")
        if not isinstance(records, list) or not records:
            raise ValueError("manual review contains no records")

        expected_codes = official_candidate_codes(provenance.source_sha256)
        signs: list[dict] = []
        seen: set[str] = set()
        for raw_record in records:
            if not isinstance(raw_record, dict):
                raise ValueError("manual review records must be JSON objects")
            sign = normalize_record(raw_record, source_document, provenance.source_sha256)
            if sign["code"] in seen:
                raise ValueError(f"duplicate reviewed code: {sign['code']}")
            seen.add(sign["code"])
            signs.append(sign)

        missing = sorted(expected_codes - seen)
        unexpected = sorted(seen - expected_codes)
        if missing or unexpected:
            raise ValueError(
                f"manual review code set does not match official candidates: missing={missing[:20]}, unexpected={unexpected[:20]}"
            )

        signs.sort(key=lambda item: item["code"])
        output = {
            "dataset": "VN_TRAFFIC_SIGNS",
            "version": require_non_empty_string(review.get("version"), "review.version"),
            "validFrom": require_non_empty_string(review.get("validFrom"), "review.validFrom"),
            "stage": "production",
            "sourceDocument": source_document,
            "sourceSha256": provenance.source_sha256,
            "review": {
                "method": "manual-official-gazette-verification",
                "recordCount": len(signs),
                "sourceCandidate": review.get("candidateFile"),
                "sourcePartCount": len(provenance.part_files),
            },
            "signs": signs,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot apply traffic-sign manual review: {error}") from error

    print(f"[ok] verified signs: {len(signs)}")
    print(f"[ok] official candidate codes covered: {len(expected_codes)}")
    print(f"[ok] production candidate: {args.output}")
    print("Next: pnpm signs:validate, then pnpm signs:publish.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
