#!/usr/bin/env python3
"""Apply provenance-backed manual review to question image candidates.

The image extractor only produces geometry candidates. This stage marks every
visual-sensitive question as pending until a reviewer explicitly approves an
existing candidate, selects one candidate, supplies a crop, or verifies that the
question intentionally has no image.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path, PurePosixPath
from typing import Any

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = ROOT / "data" / "raw" / "bo-600-cau-hoi.pdf"
DEFAULT_INPUT = ROOT / "data" / "raw" / "questions.with-images.json"
DEFAULT_REPORT = ROOT / "data" / "raw" / "image-review.json"
DEFAULT_REVIEW = ROOT / "data" / "source" / "manual-image-review.json"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "questions.images-reviewed.json"
DEFAULT_ASSETS_ROOT = ROOT / "data" / "processed" / "assets"

VISUAL_SENSITIVE_CATEGORIES = {"ROAD_SIGNS", "SITUATIONS"}
ALLOWED_ACTIONS = {"accept-existing", "accept-candidate", "crop", "none"}


def safe_asset_path(question_id: int) -> str:
    return f"images/q{question_id:03d}.png"


def asset_file(assets_root: Path, relative: str) -> Path:
    posix = PurePosixPath(relative.replace("\\", "/"))
    if posix.is_absolute() or any(part in {"", ".", ".."} for part in posix.parts):
        raise ValueError(f"unsafe asset path: {relative}")
    destination = assets_root.joinpath(*posix.parts)
    root = assets_root.resolve()
    resolved = destination.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"asset escapes assets root: {relative}")
    return destination


def parse_crop(value: Any) -> fitz.Rect:
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError("crop must be [x0, y0, x1, y1]")
    try:
        rect = fitz.Rect(*(float(item) for item in value))
    except (TypeError, ValueError) as error:
        raise ValueError("crop coordinates must be numeric") from error
    if rect.is_empty or not rect.is_valid or rect.is_infinite:
        raise ValueError(f"invalid crop: {value}")
    return rect


def render_crop(
    document: fitz.Document,
    page_number: int,
    crop: fitz.Rect,
    destination: Path,
) -> None:
    if page_number < 1 or page_number > document.page_count:
        raise ValueError(f"page out of range: {page_number}")
    page = document[page_number - 1]
    page_rect = page.rect
    if (
        crop.x0 < page_rect.x0
        or crop.y0 < page_rect.y0
        or crop.x1 > page_rect.x1
        or crop.y1 > page_rect.y1
    ):
        raise ValueError(f"crop outside page {page_number}: {list(crop)}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=crop, alpha=False)
    pixmap.save(destination)


def load_reviews(path: Path) -> dict[int, dict[str, Any]]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    reviews = payload.get("reviews")
    if not isinstance(reviews, list):
        raise ValueError("manual image review must contain a reviews array")

    result: dict[int, dict[str, Any]] = {}
    for review in reviews:
        if not isinstance(review, dict):
            raise ValueError("every image review entry must be an object")
        question_id = review.get("questionId")
        if not isinstance(question_id, int) or not 1 <= question_id <= 600:
            raise ValueError(f"invalid image review questionId: {question_id}")
        if question_id in result:
            raise ValueError(f"duplicate image review for question {question_id}")
        action = review.get("action")
        if action not in ALLOWED_ACTIONS:
            raise ValueError(f"question {question_id}: unsupported action {action}")
        if not str(review.get("reviewer", "")).strip():
            raise ValueError(f"question {question_id}: reviewer is required")
        if not str(review.get("verifiedAt", "")).strip():
            raise ValueError(f"question {question_id}: verifiedAt is required")
        result[question_id] = review
    return result


def candidate_crop(
    report: dict[str, Any] | None,
    candidate_index: int,
) -> tuple[int, fitz.Rect]:
    if not report:
        raise ValueError("no extraction report available for candidate selection")
    candidates = report.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("question has no geometry candidate")
    if candidate_index < 0 or candidate_index >= len(candidates):
        raise ValueError(f"candidateIndex {candidate_index} out of range")
    candidate = candidates[candidate_index]
    if not isinstance(candidate, dict):
        raise ValueError("invalid candidate object")
    page = candidate.get("page")
    if not isinstance(page, int):
        raise ValueError("candidate page is invalid")
    return page, parse_crop(candidate.get("crop"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--assets-root", type=Path, default=DEFAULT_ASSETS_ROOT)
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"Image candidate dataset not found: {args.input}")
    if not args.report.is_file():
        raise SystemExit(f"Image review report not found: {args.report}")

    dataset = deepcopy(json.loads(args.input.read_text(encoding="utf-8")))
    report_payload = json.loads(args.report.read_text(encoding="utf-8"))
    report_by_id = {
        int(row["questionId"]): row
        for row in report_payload.get("questions", [])
        if isinstance(row, dict) and isinstance(row.get("questionId"), int)
    }

    try:
        reviews = load_reviews(args.review)
    except (ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot read manual image review: {error}") from error

    needs_pdf = any(review.get("action") in {"accept-candidate", "crop"} for review in reviews.values())
    if needs_pdf and not args.pdf.is_file():
        raise SystemExit(f"PDF required for reviewed crop rendering: {args.pdf}")
    document = fitz.open(args.pdf) if needs_pdf else None

    unresolved = 0
    applied = 0

    for question in dataset.get("questions", []):
        question_id = int(question["id"])
        extraction = report_by_id.get(question_id)
        has_image = isinstance(question.get("image"), str) and bool(question.get("image"))
        sensitive = question.get("category") in VISUAL_SENSITIVE_CATEGORIES
        extraction_status = extraction.get("status") if extraction else None
        requires_review = has_image or sensitive or extraction_status == "review"

        question["imageNeedsVerification"] = bool(requires_review)
        question["imageResolution"] = {
            "method": "graphics-before-first-answer",
            "extractionStatus": extraction_status,
            "reason": extraction.get("reason") if extraction else "missing extraction report",
            "candidates": extraction.get("candidates", []) if extraction else [],
        }

        review = reviews.get(question_id)
        if review is not None:
            action = str(review["action"])
            relative = safe_asset_path(question_id)
            destination = asset_file(args.assets_root, relative)

            try:
                if action == "accept-existing":
                    existing = question.get("image")
                    if not isinstance(existing, str) or not existing:
                        raise ValueError("no existing candidate image to approve")
                    existing_file = asset_file(args.assets_root, existing)
                    if not existing_file.is_file():
                        raise ValueError(f"existing candidate asset is missing: {existing_file}")

                elif action == "accept-candidate":
                    if document is None:
                        raise ValueError("PDF is required for candidate rendering")
                    candidate_index = review.get("candidateIndex")
                    if not isinstance(candidate_index, int):
                        raise ValueError("candidateIndex is required")
                    page, crop = candidate_crop(extraction, candidate_index)
                    render_crop(document, page, crop, destination)
                    question["image"] = relative

                elif action == "crop":
                    if document is None:
                        raise ValueError("PDF is required for custom crop rendering")
                    page = review.get("page")
                    if not isinstance(page, int):
                        raise ValueError("page is required for crop action")
                    crop = parse_crop(review.get("crop"))
                    render_crop(document, page, crop, destination)
                    question["image"] = relative

                elif action == "none":
                    current = question.get("image")
                    if isinstance(current, str) and current:
                        current_file = asset_file(args.assets_root, current)
                        if current_file.is_file():
                            current_file.unlink()
                    question["image"] = None

            except (OSError, ValueError) as error:
                raise SystemExit(f"question {question_id} image review failed: {error}") from error

            question["imageNeedsVerification"] = False
            question["imageResolution"]["manualReview"] = {
                "action": action,
                "reviewer": review["reviewer"],
                "verifiedAt": review["verifiedAt"],
                "note": review.get("note"),
                "candidateIndex": review.get("candidateIndex"),
                "page": review.get("page"),
                "crop": review.get("crop"),
            }
            applied += 1

        if question.get("imageNeedsVerification") is True:
            unresolved += 1

    dataset["imageVerification"] = {
        "method": "manual-provenance-gate",
        "reviewFile": args.review.name,
        "applied": applied,
        "unresolved": unresolved,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[ok] image-reviewed dataset: {args.output}")
    print(f"[summary] manual reviews applied={applied} unresolved={unresolved}")
    if unresolved:
        print("[warning] unresolved image verification remains; promotion must reject this dataset")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
