from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW_PATH = ROOT / "data" / "traffic-signs" / "raw" / "manual-review.json"
RAW_ROOT = REVIEW_PATH.parent
CANDIDATE_ROOT = RAW_ROOT / "image-candidates"
ASSETS_ROOT = ROOT / "data" / "traffic-signs" / "processed" / "assets" / "signs"
ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
CODE_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def load_review() -> dict:
    if not REVIEW_PATH.is_file():
        raise ValueError(f"missing manual review: {REVIEW_PATH}")
    value = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("records"), list):
        raise ValueError("manual-review.json must contain a records array")
    return value


def safe_candidate_path(value: object) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("selectedImageCandidate must be a non-empty string")
    normalized = value.strip().replace("\\", "/").removeprefix("./")
    parts = normalized.split("/")
    if normalized.startswith("/") or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"unsafe selectedImageCandidate: {value}")
    if parts[0] != "image-candidates":
        raise ValueError("selectedImageCandidate must point inside raw/image-candidates")
    candidate = RAW_ROOT.joinpath(*parts).resolve()
    root = CANDIDATE_ROOT.resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"selectedImageCandidate escapes candidate root: {value}")
    if candidate.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ValueError(f"unsupported selected image type: {candidate.suffix}")
    if not candidate.is_file():
        raise ValueError(f"selected image candidate does not exist: {candidate}")
    return candidate


def destination_name(code: str, suffix: str) -> str:
    safe_code = CODE_SAFE_RE.sub("-", code.strip()).strip("-._").lower()
    if not safe_code:
        raise ValueError(f"cannot derive image filename from code: {code}")
    return f"{safe_code}{suffix.lower()}"


def main() -> int:
    try:
        review = load_review()
        ASSETS_ROOT.mkdir(parents=True, exist_ok=True)
        applied = 0

        for record in review["records"]:
            if not isinstance(record, dict):
                raise ValueError("manual-review records must be JSON objects")
            selected = record.get("selectedImageCandidate")
            if selected in (None, ""):
                continue
            code = record.get("code")
            if not isinstance(code, str) or not code.strip():
                raise ValueError("record with selected image is missing code")

            source = safe_candidate_path(selected)
            destination = ASSETS_ROOT / destination_name(code, source.suffix)
            if destination.exists() and destination.read_bytes() != source.read_bytes():
                raise ValueError(
                    f"processed image already exists with different bytes for {code}: {destination}; remove it or change dataset version/review selection deliberately"
                )
            if not destination.exists():
                shutil.copyfile(source, destination)

            record["image"] = f"signs/{destination.name}"
            # Selection/copy is not verification. Preserve reviewer-controlled
            # imageVerified and require it later in apply_manual_review.py.
            record["imageSelection"] = {
                "candidate": str(selected).replace("\\", "/"),
                "processedAsset": record["image"],
            }
            applied += 1

        REVIEW_PATH.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot apply traffic-sign image selections: {error}") from error

    print(f"[ok] applied image selections: {applied}")
    print(f"[ok] processed assets: {ASSETS_ROOT}")
    print(f"[ok] review updated: {REVIEW_PATH}")
    print("Review copied images, set imageVerified=true explicitly, then export/save manual-review.json before production apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
