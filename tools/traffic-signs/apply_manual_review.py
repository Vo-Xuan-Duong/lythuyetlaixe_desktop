from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_MANIFEST = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
DEFAULT_REVIEW = ROOT / "data" / "traffic-signs" / "raw" / "manual-review.json"
DEFAULT_OUTPUT = ROOT / "data" / "traffic-signs" / "processed" / "traffic-signs.json"
GROUPS = {"PROHIBITION", "MANDATORY", "WARNING", "INDICATION", "SUPPLEMENTARY"}
CODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


def load_json(path: Path, label: str) -> dict:
    if not path.is_file():
        raise ValueError(f"missing {label}: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_sha(value: object) -> str:
    return str(value or "").strip().lower().removeprefix("sha256:")


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


def verified_source() -> tuple[dict, str]:
    manifest = load_json(SOURCE_MANIFEST, "traffic-sign source manifest")
    technical = manifest.get("technicalSource")
    if not isinstance(technical, dict):
        raise ValueError("traffic-sign source manifest is missing technicalSource")
    if technical.get("verificationStatus") != "verified-official-full-source":
        raise ValueError("technicalSource must be verified-official-full-source before applying manual review")

    filename = technical.get("localFile")
    if not isinstance(filename, str) or Path(filename).name != filename:
        raise ValueError("technicalSource.localFile must be a plain filename")
    source = SOURCE_MANIFEST.parent / filename
    if not source.is_file():
        raise ValueError(f"missing verified technical source: {source}")
    declared = normalize_sha(technical.get("sourceSha256"))
    if not SHA_RE.fullmatch(declared) or sha256_file(source) != declared:
        raise ValueError("technicalSource SHA-256 does not match the verified local file")
    return manifest, declared


def normalize_record(record: dict, source_document: str) -> dict:
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
    source_pages = sorted({page for page in source_pages_raw if isinstance(page, int) and page > 0})
    if not source_pages:
        raise ValueError(f"{code}: sourcePages must contain positive integers")

    image = optional_string(record.get("image"), f"{code}.image")
    if image and record.get("imageVerified") is not True:
        raise ValueError(f"{code}: image is set but imageVerified is not true")

    return {
        "code": code,
        "name": require_non_empty_string(record.get("name"), f"{code}.name"),
        "groupCode": group,
        "meaning": require_non_empty_string(record.get("meaning"), f"{code}.meaning"),
        "recognition": optional_string(record.get("recognition"), f"{code}.recognition"),
        "scope": optional_string(record.get("scope"), f"{code}.scope"),
        "exceptions": string_array(record.get("exceptions"), f"{code}.exceptions"),
        "notes": optional_string(record.get("notes"), f"{code}.notes"),
        "image": image,
        "keywords": string_array(record.get("keywords"), f"{code}.keywords"),
        "sourceVersion": source_version,
        "sourceSection": source_section,
        "sourcePages": source_pages,
        "verifiedBy": verified_by,
        "verifiedAt": verified_at,
        "imageVerified": True if image else False,
    }


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Build production traffic-signs.json from fully verified manual-review records")
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    try:
        source_manifest, source_sha = verified_source()
        review = load_json(args.review, "traffic-sign manual review")
        if review.get("dataset") != "VN_TRAFFIC_SIGNS_REVIEW" or review.get("stage") != "manual-review":
            raise ValueError("manual-review.json has an unsupported dataset/stage")
        source_document = require_non_empty_string(source_manifest.get("sourceDocument"), "sourceDocument")
        if review.get("sourceDocument") != source_document:
            raise ValueError("manual review sourceDocument does not match verified source manifest")

        records = review.get("records")
        if not isinstance(records, list) or not records:
            raise ValueError("manual review contains no records")

        signs: list[dict] = []
        seen: set[str] = set()
        for raw_record in records:
            if not isinstance(raw_record, dict):
                raise ValueError("manual review records must be JSON objects")
            sign = normalize_record(raw_record, source_document)
            if sign["code"] in seen:
                raise ValueError(f"duplicate reviewed code: {sign['code']}")
            seen.add(sign["code"])
            signs.append(sign)

        signs.sort(key=lambda item: item["code"])
        output = {
            "dataset": "VN_TRAFFIC_SIGNS",
            "version": require_non_empty_string(review.get("version"), "review.version"),
            "validFrom": require_non_empty_string(review.get("validFrom"), "review.validFrom"),
            "stage": "production",
            "sourceDocument": source_document,
            "sourceSha256": source_sha,
            "review": {
                "method": "manual-official-source-verification",
                "recordCount": len(signs),
                "sourceCandidate": review.get("candidateFile"),
            },
            "signs": signs,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot apply traffic-sign manual review: {error}") from error

    print(f"[ok] verified signs: {len(signs)}")
    print(f"[ok] production candidate: {args.output}")
    print("Next: pnpm signs:validate, then pnpm signs:publish.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
