#!/usr/bin/env python3
"""Extract question illustration assets without cropping answer text/underlines.

The official PDF indicates correct answers with underlines. This stage therefore
never renders the full question block. It only considers embedded-image/vector
bounding boxes located between the question header and the first answer line.
Ambiguous or missing graphics are reported for manual review instead of guessed.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterable

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = ROOT / "data" / "raw" / "bo-600-cau-hoi.pdf"
DEFAULT_PAGES = ROOT / "data" / "raw" / "extracted" / "pages.json"
DEFAULT_INPUT = ROOT / "data" / "raw" / "questions.reviewed.json"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "questions.with-images.json"
DEFAULT_ASSETS_ROOT = ROOT / "data" / "processed" / "assets"
DEFAULT_REPORT = ROOT / "data" / "raw" / "image-review.json"

QUESTION_RE = re.compile(r"^\s*Câu\s+(\d{1,3})\s*[\.:]", re.IGNORECASE)
ANSWER_RE = re.compile(r"^\s*[1-4]\s*[\.)]\s*")

MIN_IMAGE_WIDTH = 20.0
MIN_IMAGE_HEIGHT = 16.0
MIN_DRAWING_AREA = 45.0
CROP_PADDING = 6.0
MAX_PAGE_LOOKAHEAD = 1


def rect_from(value: Any) -> fitz.Rect | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    try:
        rect = fitz.Rect(*(float(item) for item in value))
    except (TypeError, ValueError):
        return None
    if rect.is_empty or not rect.is_finite:
        return None
    return rect


def union_rects(rects: Iterable[fitz.Rect]) -> fitz.Rect | None:
    items = list(rects)
    if not items:
        return None
    result = fitz.Rect(items[0])
    for rect in items[1:]:
        result.include_rect(rect)
    return result


def overlap_height(rect: fitz.Rect, top: float, bottom: float) -> float:
    return max(0.0, min(rect.y1, bottom) - max(rect.y0, top))


def in_vertical_region(rect: fitz.Rect, top: float, bottom: float) -> bool:
    if bottom <= top:
        return False
    overlap = overlap_height(rect, top, bottom)
    return overlap >= min(rect.height, max(3.0, rect.height * 0.5))


def line_groups(spans: list[dict[str, Any]], tolerance: float = 2.0) -> list[dict[str, Any]]:
    prepared: list[tuple[float, float, str, fitz.Rect]] = []
    for span in spans:
        rect = rect_from(span.get("bbox"))
        text = str(span.get("text", "")).strip()
        if rect is None or not text:
            continue
        prepared.append(((rect.y0 + rect.y1) / 2.0, rect.x0, text, rect))
    prepared.sort(key=lambda item: (item[0], item[1]))

    groups: list[list[tuple[float, float, str, fitz.Rect]]] = []
    for item in prepared:
        if not groups:
            groups.append([item])
            continue
        previous_y = sum(part[0] for part in groups[-1]) / len(groups[-1])
        if abs(item[0] - previous_y) <= tolerance:
            groups[-1].append(item)
        else:
            groups.append([item])

    result: list[dict[str, Any]] = []
    for group in groups:
        ordered = sorted(group, key=lambda item: item[1])
        text = " ".join(item[2] for item in ordered).strip()
        bbox = union_rects(item[3] for item in ordered)
        if bbox is not None:
            result.append({"text": text, "bbox": bbox})
    return result


def page_question_regions(page: dict[str, Any]) -> dict[int, tuple[float, float]]:
    lines = line_groups(page.get("spans", []))
    starts: list[tuple[int, int]] = []
    for index, line in enumerate(lines):
        match = QUESTION_RE.match(line["text"])
        if match:
            starts.append((int(match.group(1)), index))

    regions: dict[int, tuple[float, float]] = {}
    for position, (question_id, line_index) in enumerate(starts):
        question_line = lines[line_index]
        next_question_y = math.inf
        if position + 1 < len(starts):
            next_question_y = lines[starts[position + 1][1]]["bbox"].y0

        answer_y = math.inf
        for line in lines[line_index + 1 :]:
            if line["bbox"].y0 >= next_question_y:
                break
            if ANSWER_RE.match(line["text"]):
                answer_y = line["bbox"].y0
                break

        bottom = min(answer_y, next_question_y, float(page.get("height", 0) or 0))
        top = question_line["bbox"].y1
        if bottom > top:
            regions[question_id] = (top, bottom)
    return regions


def image_rects(page: dict[str, Any], top: float, bottom: float) -> list[fitz.Rect]:
    rects: list[fitz.Rect] = []
    for image in page.get("images", []):
        rect = rect_from(image.get("bbox"))
        if rect is None:
            continue
        if rect.width < MIN_IMAGE_WIDTH or rect.height < MIN_IMAGE_HEIGHT:
            continue
        if in_vertical_region(rect, top, bottom):
            rects.append(rect)
    return rects


def drawing_rects(page: dict[str, Any], top: float, bottom: float) -> list[fitz.Rect]:
    rects: list[fitz.Rect] = []
    for drawing in page.get("drawings", []):
        rect = rect_from(drawing.get("rect"))
        if rect is None:
            continue
        area = max(rect.width, 0.0) * max(rect.height, 0.0)
        # Answer underlines and page separators are extremely thin. Ignore them.
        if area < MIN_DRAWING_AREA:
            continue
        if rect.height < 2.0 and rect.width > 20.0:
            continue
        if in_vertical_region(rect, top, bottom):
            rects.append(rect)
    return rects


def padded_crop(rect: fitz.Rect, page_width: float, page_height: float) -> fitz.Rect:
    return fitz.Rect(
        max(0.0, rect.x0 - CROP_PADDING),
        max(0.0, rect.y0 - CROP_PADDING),
        min(page_width, rect.x1 + CROP_PADDING),
        min(page_height, rect.y1 + CROP_PADDING),
    )


def render_crop(document: fitz.Document, page_number: int, crop: fitz.Rect, destination: Path) -> None:
    page = document[page_number - 1]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=crop, alpha=False)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pixmap.save(destination)


def candidate_for_question(
    question_id: int,
    source_page: int | None,
    pages_by_number: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    if source_page is None:
        return {"status": "review", "reason": "missing sourcePage", "candidates": []}

    collected: list[dict[str, Any]] = []
    for page_number in range(source_page, source_page + MAX_PAGE_LOOKAHEAD + 1):
        page = pages_by_number.get(page_number)
        if page is None:
            continue
        regions = page_question_regions(page)
        region = regions.get(question_id)
        if region is None:
            continue
        top, bottom = region
        raster = image_rects(page, top, bottom)
        vectors = drawing_rects(page, top, bottom)
        combined = union_rects([*raster, *vectors])
        if combined is None:
            continue
        crop = padded_crop(combined, float(page["width"]), float(page["height"]))
        collected.append(
            {
                "page": page_number,
                "crop": [round(crop.x0, 3), round(crop.y0, 3), round(crop.x1, 3), round(crop.y1, 3)],
                "rasterObjects": len(raster),
                "vectorObjects": len(vectors),
            }
        )

    if not collected:
        return {"status": "none", "reason": "no graphic object found before first answer", "candidates": []}
    if len(collected) > 1:
        return {"status": "review", "reason": "graphics found on multiple pages", "candidates": collected}

    candidate = collected[0]
    crop = fitz.Rect(*candidate["crop"])
    if crop.width < MIN_IMAGE_WIDTH or crop.height < MIN_IMAGE_HEIGHT:
        return {"status": "review", "reason": "candidate crop too small", "candidates": collected}

    return {"status": "accepted", "reason": "single graphic region before first answer", "candidates": collected}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--pages", type=Path, default=DEFAULT_PAGES)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--assets-root", type=Path, default=DEFAULT_ASSETS_ROOT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise SystemExit(f"PDF not found: {args.pdf}")
    if not args.pages.is_file():
        raise SystemExit(f"Extracted pages not found: {args.pages}")
    if not args.input.is_file():
        raise SystemExit(f"Reviewed dataset not found: {args.input}")

    extracted = json.loads(args.pages.read_text(encoding="utf-8"))
    dataset = deepcopy(json.loads(args.input.read_text(encoding="utf-8")))
    pages_by_number = {int(page["page"]): page for page in extracted.get("pages", [])}
    document = fitz.open(args.pdf)

    report_rows: list[dict[str, Any]] = []
    accepted = 0
    review = 0

    for question in dataset.get("questions", []):
        question_id = int(question["id"])
        source_page = question.get("sourcePage")
        result = candidate_for_question(question_id, int(source_page) if source_page else None, pages_by_number)

        if result["status"] == "accepted":
            candidate = result["candidates"][0]
            relative = f"images/q{question_id:03d}.png"
            destination = args.assets_root / relative
            render_crop(document, int(candidate["page"]), fitz.Rect(*candidate["crop"]), destination)
            question["image"] = relative
            accepted += 1
        elif result["status"] == "review":
            review += 1

        report_rows.append(
            {
                "questionId": question_id,
                "sourcePage": source_page,
                **result,
                "image": question.get("image"),
            }
        )

    dataset["imageExtraction"] = {
        "method": "graphics-before-first-answer",
        "accepted": accepted,
        "needsReview": review,
        "report": args.report.name,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(
            {
                "source": args.pdf.name,
                "accepted": accepted,
                "needsReview": review,
                "questions": report_rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"[ok] image-enriched dataset: {args.output}")
    print(f"[ok] image review report: {args.report}")
    print(f"[summary] accepted={accepted} needsReview={review}")
    print("[warning] visually review generated assets before promotion; this stage never infers official answers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
