from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import fitz

from source_provenance import DEFAULT_MANIFEST, inspect_multipart_source

ROOT = Path(__file__).resolve().parents[2]
REVIEW_PATH = ROOT / "data" / "traffic-signs" / "raw" / "manual-review.json"
RAW_ROOT = REVIEW_PATH.parent
CANDIDATES_PATH = RAW_ROOT / "official-candidates.json"
CANDIDATE_ROOT = RAW_ROOT / "image-candidates"
ASSETS_ROOT = ROOT / "data" / "traffic-signs" / "processed" / "assets" / "signs"
ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
CODE_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def load_json(path: Path, label: str) -> dict:
    if not path.is_file():
        raise ValueError(f"missing {label}: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def load_review() -> dict:
    value = load_json(REVIEW_PATH, "manual review")
    if not isinstance(value.get("records"), list):
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


def official_candidate_index(source_sha256: str) -> dict[str, dict]:
    document = load_json(CANDIDATES_PATH, "official candidates")
    if str(document.get("sourceSha256") or "").strip().lower() != source_sha256:
        raise ValueError("official image candidates do not match the currently verified QCVN source bundle")
    rows = document.get("candidates")
    if not isinstance(rows, list):
        raise ValueError("official-candidates.json must contain candidates")
    result: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        section = str(row.get("section") or "").strip()
        codes = [str(code).strip().upper() for code in row.get("codes", []) if isinstance(code, str) and code.strip()]
        for image in row.get("imageCandidates", []):
            if not isinstance(image, dict):
                continue
            filename = image.get("file")
            if not isinstance(filename, str) or not filename.strip():
                continue
            key = filename.strip().replace("\\", "/").removeprefix("./")
            if key in result:
                raise ValueError(f"duplicate official image candidate path: {key}")
            result[key] = {
                "section": section,
                "codes": codes,
                "page": image.get("page"),
                "crop": image.get("crop"),
                "status": image.get("status"),
            }
    return result


def valid_crop(value: object) -> list[float]:
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError("manualImageCrop.crop must be [x0,y0,x1,y1]")
    try:
        crop = [float(item) for item in value]
    except (TypeError, ValueError) as error:
        raise ValueError("manualImageCrop.crop must contain numbers") from error
    rect = fitz.Rect(*crop)
    if rect.is_empty or not rect.is_valid or rect.is_infinite or rect.width <= 0 or rect.height <= 0:
        raise ValueError("manualImageCrop.crop must describe a finite positive-area rectangle")
    return crop


def normalized_candidate_crop(value: object) -> list[float]:
    crop = valid_crop(value)
    return [round(number, 2) for number in crop]


def manual_crop_selection(record: dict, document: fitz.Document, destination: Path, source_sha256: str) -> dict:
    raw = record.get("manualImageCrop")
    if not isinstance(raw, dict):
        raise ValueError("manualImageCrop must be an object")
    page = raw.get("page")
    if not isinstance(page, int) or isinstance(page, bool) or page <= 0 or page > document.page_count:
        raise ValueError(f"{record.get('code')}: manualImageCrop.page must be between 1 and {document.page_count}")
    crop_values = valid_crop(raw.get("crop"))
    source_page = document[page - 1]
    crop = fitz.Rect(*crop_values)
    if not source_page.rect.contains(crop):
        raise ValueError(f"{record.get('code')}: manualImageCrop.crop must stay inside source page {page}")
    pixmap = source_page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=crop, alpha=False)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pixmap.save(destination)
    return {
        "method": "official-qcvn-manual-crop",
        "sourceSha256": source_sha256,
        "sourceSection": str(record.get("sourceSection") or "").strip(),
        "page": page,
        "crop": [round(number, 2) for number in crop_values],
        "processedAsset": f"signs/{destination.name}",
    }


def candidate_selection(record: dict, candidate_index: dict[str, dict], destination: Path, source_sha256: str) -> dict:
    selected = str(record.get("selectedImageCandidate") or "").strip().replace("\\", "/").removeprefix("./")
    source = safe_candidate_path(selected)
    metadata = candidate_index.get(selected)
    if metadata is None:
        raise ValueError(f"{record.get('code')}: selected image is not present in official candidate metadata: {selected}")
    code = str(record.get("code") or "").strip().upper()
    if code not in metadata["codes"]:
        raise ValueError(f"{code}: selected image candidate does not belong to this official sign section")
    record_section = str(record.get("sourceSection") or "").strip()
    if not record_section or metadata["section"] != record_section:
        raise ValueError(f"{code}: selected image candidate sourceSection does not match record")
    page = metadata.get("page")
    if not isinstance(page, int) or page <= 0:
        raise ValueError(f"{code}: candidate image page is invalid")
    crop = normalized_candidate_crop(metadata.get("crop"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    return {
        "method": "official-qcvn-candidate",
        "sourceSha256": source_sha256,
        "sourceSection": record_section,
        "page": page,
        "crop": crop,
        "candidateFile": selected,
        "processedAsset": f"signs/{destination.name}",
    }


def remove_old_processed_asset(record: dict, next_asset: str) -> None:
    previous = record.get("image")
    if not isinstance(previous, str) or not previous.strip() or previous == next_asset:
        return
    normalized = previous.strip().replace("\\", "/")
    if not normalized.startswith("signs/"):
        return
    relative = normalized.removeprefix("signs/")
    if "/" in relative or relative in {"", ".", ".."}:
        return
    old = (ASSETS_ROOT / relative).resolve()
    root = ASSETS_ROOT.resolve()
    if root in old.parents and old.is_file():
        old.unlink()


def main() -> int:
    try:
        provenance = inspect_multipart_source(DEFAULT_MANIFEST, require_verified=True)
        review = load_review()
        if str(review.get("sourceSha256") or "").strip().lower() != provenance.source_sha256:
            raise ValueError("manual review sourceSha256 does not match the currently verified QCVN source bundle")
        candidate_index = official_candidate_index(provenance.source_sha256)
        ASSETS_ROOT.mkdir(parents=True, exist_ok=True)
        applied = 0
        document: fitz.Document | None = None
        try:
            for record in review["records"]:
                if not isinstance(record, dict):
                    raise ValueError("manual-review records must be JSON objects")
                selected = record.get("selectedImageCandidate")
                manual = record.get("manualImageCrop")
                has_candidate = isinstance(selected, str) and bool(selected.strip())
                has_manual_crop = isinstance(manual, dict)
                if has_candidate and has_manual_crop:
                    raise ValueError(f"{record.get('code')}: choose selectedImageCandidate or manualImageCrop, not both")
                if not has_candidate and not has_manual_crop:
                    continue

                code = record.get("code")
                if not isinstance(code, str) or not code.strip():
                    raise ValueError("record with selected image is missing code")
                suffix = safe_candidate_path(selected).suffix if has_candidate else ".png"
                destination = ASSETS_ROOT / destination_name(code, suffix)
                if has_candidate:
                    selection = candidate_selection(record, candidate_index, destination, provenance.source_sha256)
                else:
                    if document is None:
                        document = fitz.open(provenance.combined_file)
                    selection = manual_crop_selection(record, document, destination, provenance.source_sha256)

                next_asset = selection["processedAsset"]
                changed = record.get("image") != next_asset or record.get("imageSelection") != selection
                remove_old_processed_asset(record, next_asset)
                record["image"] = next_asset
                record["imageSelection"] = selection
                if changed:
                    record["imageVerified"] = False
                applied += 1
        finally:
            if document is not None:
                document.close()

        REVIEW_PATH.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError, fitz.FileDataError) as error:
        raise SystemExit(f"Cannot apply traffic-sign image selections: {error}") from error

    print(f"[ok] applied image selections/crops: {applied}")
    print(f"[ok] processed assets: {ASSETS_ROOT}")
    print(f"[ok] review updated: {REVIEW_PATH}")
    print("Rebuild the review workspace, inspect processed assets, then set imageVerified=true explicitly before production apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
