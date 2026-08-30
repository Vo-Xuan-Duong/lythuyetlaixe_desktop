#!/usr/bin/env python3
"""Resolve correct answers from underline geometry in the official PDF.

The official 600-question document marks the correct answer by underlining it.
This resolver works only from extracted PDF geometry; it never guesses from the
question meaning. Low-confidence cases remain unresolved and are written to a
manual-review report.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PAGES = ROOT / "data" / "raw" / "extracted" / "pages.json"
DEFAULT_QUESTIONS = ROOT / "data" / "raw" / "questions.unverified.json"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "questions.resolved.json"
DEFAULT_REVIEW = ROOT / "data" / "raw" / "answer-review.json"

QUESTION_RE = re.compile(r"^\s*Câu\s+(\d{1,3})\s*[\.:]", re.IGNORECASE)
ANSWER_RE = re.compile(r"^\s*([1-4])\s*[\.)]\s*")
ANSWER_KEYS = {"1": "A", "2": "B", "3": "C", "4": "D"}

MIN_SCORE = 0.12
MIN_MARGIN = 0.05
MAX_BASELINE_DISTANCE = 4.5
MAX_HORIZONTAL_DELTA = 1.5
MIN_SEGMENT_LENGTH = 4.0
LINE_Y_TOLERANCE = 2.0


@dataclass(frozen=True)
class TextLine:
    page: int
    order: int
    text: str
    bbox: tuple[float, float, float, float]
    baseline: float


@dataclass(frozen=True)
class Segment:
    page: int
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def length(self) -> float:
        return abs(self.x1 - self.x0)

    @property
    def y(self) -> float:
        return (self.y0 + self.y1) / 2.0


def _bbox_union(boxes: list[list[float]]) -> tuple[float, float, float, float]:
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def _reading_order_key(line: TextLine) -> tuple[int, int, float, float]:
    """Sort lines by page then visual row/column, independent of PDF block order."""
    y0 = line.bbox[1]
    x0 = line.bbox[0]
    row = round(y0 / LINE_Y_TOLERANCE)
    return (line.page, row, y0, x0)


def build_lines(extracted: dict[str, Any]) -> list[TextLine]:
    unsorted_lines: list[TextLine] = []

    for page in extracted.get("pages", []):
        grouped: dict[tuple[int, int], list[dict[str, Any]]] = {}
        for span in page.get("spans", []):
            grouped.setdefault((int(span["block"]), int(span["line"])), []).append(span)

        for spans in grouped.values():
            spans = sorted(spans, key=lambda item: (float(item["bbox"][0]), int(item.get("span", 0))))
            text = " ".join(str(span.get("text", "")).strip() for span in spans if str(span.get("text", "")).strip())
            boxes = [span["bbox"] for span in spans if span.get("bbox")]
            origins = [span.get("origin") for span in spans if span.get("origin")]
            if not text or not boxes:
                continue
            bbox = _bbox_union(boxes)
            baseline = max(float(origin[1]) for origin in origins) if origins else bbox[3]
            unsorted_lines.append(
                TextLine(
                    page=int(page["page"]),
                    order=-1,
                    text=text,
                    bbox=bbox,
                    baseline=baseline,
                )
            )

    ordered = sorted(unsorted_lines, key=_reading_order_key)
    return [
        TextLine(
            page=line.page,
            order=order,
            text=line.text,
            bbox=line.bbox,
            baseline=line.baseline,
        )
        for order, line in enumerate(ordered)
    ]


def _append_segment(result: list[Segment], page: int, p0: list[float], p1: list[float]) -> None:
    x0, y0 = float(p0[0]), float(p0[1])
    x1, y1 = float(p1[0]), float(p1[1])
    if abs(y1 - y0) > MAX_HORIZONTAL_DELTA:
        return
    if abs(x1 - x0) < MIN_SEGMENT_LENGTH:
        return
    if x1 < x0:
        x0, x1 = x1, x0
        y0, y1 = y1, y0
    result.append(Segment(page=page, x0=x0, y0=y0, x1=x1, y1=y1))


def build_segments(extracted: dict[str, Any]) -> dict[int, list[Segment]]:
    by_page: dict[int, list[Segment]] = {}

    for page in extracted.get("pages", []):
        page_number = int(page["page"])
        result: list[Segment] = []
        for drawing in page.get("drawings", []):
            width = float(drawing.get("width") or 1.0)
            if width > 3.0:
                continue
            for item in drawing.get("items", []):
                if not item:
                    continue
                kind = item[0]
                if kind == "l" and len(item) >= 3:
                    _append_segment(result, page_number, item[1], item[2])
                elif kind == "re" and len(item) >= 2 and isinstance(item[1], list) and len(item[1]) >= 4:
                    x0, y0, x1, y1 = map(float, item[1][:4])
                    if abs(y1 - y0) <= 3.0:
                        _append_segment(result, page_number, [x0, y0], [x1, y0])
        by_page[page_number] = result

    return by_page


def question_ranges(lines: list[TextLine]) -> dict[int, tuple[int, int]]:
    anchors: list[tuple[int, int]] = []
    seen: set[int] = set()
    for index, line in enumerate(lines):
        match = QUESTION_RE.match(line.text)
        if not match:
            continue
        question_id = int(match.group(1))
        if 1 <= question_id <= 600 and question_id not in seen:
            anchors.append((question_id, index))
            seen.add(question_id)

    ranges: dict[int, tuple[int, int]] = {}
    for position, (question_id, start) in enumerate(anchors):
        end = anchors[position + 1][1] if position + 1 < len(anchors) else len(lines)
        ranges[question_id] = (start, end)
    return ranges


def answer_line_groups(lines: list[TextLine]) -> dict[str, list[TextLine]]:
    starts: list[tuple[str, int]] = []
    for index, line in enumerate(lines):
        match = ANSWER_RE.match(line.text)
        if match:
            starts.append((ANSWER_KEYS[match.group(1)], index))

    groups: dict[str, list[TextLine]] = {}
    for position, (key, start) in enumerate(starts):
        end = starts[position + 1][1] if position + 1 < len(starts) else len(lines)
        groups[key] = lines[start:end]
    return groups


def line_overlap(line: TextLine, segment: Segment) -> float:
    if line.page != segment.page:
        return 0.0

    x0, y0, x1, y1 = line.bbox
    baseline_distance = segment.y - line.baseline
    if baseline_distance < -0.8 or baseline_distance > MAX_BASELINE_DISTANCE:
        return 0.0

    # Prevent nearby rules/borders from being treated as underline evidence.
    if segment.y < y0 + (y1 - y0) * 0.45:
        return 0.0

    overlap = max(0.0, min(x1, segment.x1) - max(x0, segment.x0))
    if overlap <= 0:
        return 0.0
    return overlap


def score_answer(lines: list[TextLine], segments_by_page: dict[int, list[Segment]]) -> tuple[float, list[dict[str, Any]]]:
    if not lines:
        return 0.0, []

    total_text_width = sum(max(1.0, line.bbox[2] - line.bbox[0]) for line in lines)
    total_overlap = 0.0
    evidence: list[dict[str, Any]] = []

    for line in lines:
        best_overlap = 0.0
        best_segment: Segment | None = None
        for segment in segments_by_page.get(line.page, []):
            overlap = line_overlap(line, segment)
            if overlap > best_overlap:
                best_overlap = overlap
                best_segment = segment
        if best_overlap > 0 and best_segment:
            total_overlap += min(best_overlap, max(1.0, line.bbox[2] - line.bbox[0]))
            evidence.append(
                {
                    "page": line.page,
                    "text": line.text,
                    "lineBbox": [round(value, 3) for value in line.bbox],
                    "baseline": round(line.baseline, 3),
                    "underline": [
                        round(best_segment.x0, 3),
                        round(best_segment.y0, 3),
                        round(best_segment.x1, 3),
                        round(best_segment.y1, 3),
                    ],
                    "overlap": round(best_overlap, 3),
                }
            )

    return min(1.0, total_overlap / total_text_width), evidence


def choose_answer(scores: dict[str, float]) -> tuple[str | None, float, str]:
    if not scores:
        return None, 0.0, "no-answer-geometry"

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_key, best_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    margin = best_score - second_score

    if best_score < MIN_SCORE:
        return None, best_score, "underline-score-below-threshold"
    if margin < MIN_MARGIN:
        return None, best_score, "ambiguous-underline-score"
    return best_key, best_score, "resolved"


def resolve_dataset(extracted: dict[str, Any], dataset: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    lines = build_lines(extracted)
    segments_by_page = build_segments(extracted)
    ranges = question_ranges(lines)

    resolved_count = 0
    review_items: list[dict[str, Any]] = []

    for question in dataset.get("questions", []):
        question_id = int(question["id"])
        item_range = ranges.get(question_id)
        scores: dict[str, float] = {}
        evidence: dict[str, list[dict[str, Any]]] = {}

        if item_range:
            question_lines = lines[item_range[0] : item_range[1]]
            groups = answer_line_groups(question_lines)
            for answer in question.get("answers", []):
                key = str(answer.get("key"))
                score, answer_evidence = score_answer(groups.get(key, []), segments_by_page)
                scores[key] = round(score, 6)
                evidence[key] = answer_evidence
        else:
            groups = {}

        selected, confidence, reason = choose_answer(scores)
        if selected:
            for answer in question.get("answers", []):
                answer["correct"] = str(answer.get("key")) == selected
            question["needsVerification"] = False
            resolved_count += 1
        else:
            for answer in question.get("answers", []):
                answer["correct"] = None
            question["needsVerification"] = True

        question["answerResolution"] = {
            "method": "underline-geometry",
            "selected": selected,
            "confidence": round(confidence, 6),
            "scores": scores,
            "reason": reason if item_range else "question-geometry-not-found",
        }

        if not selected:
            review_items.append(
                {
                    "id": question_id,
                    "sourcePage": question.get("sourcePage"),
                    "reason": question["answerResolution"]["reason"],
                    "scores": scores,
                    "evidence": evidence,
                    "parsedAnswers": [
                        {"key": answer.get("key"), "content": answer.get("content")}
                        for answer in question.get("answers", [])
                    ],
                }
            )

    result = dict(dataset)
    result["stage"] = "answers-resolved" if not review_items else "answers-partially-resolved"
    result["questions"] = dataset.get("questions", [])
    result["answerResolutionSummary"] = {
        "resolved": resolved_count,
        "unresolved": len(review_items),
        "total": len(dataset.get("questions", [])),
        "minScore": MIN_SCORE,
        "minMargin": MIN_MARGIN,
    }

    review = {
        "dataset": dataset.get("dataset"),
        "version": dataset.get("version"),
        "unresolvedCount": len(review_items),
        "items": review_items,
    }
    return result, review


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=Path, default=DEFAULT_PAGES)
    parser.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    args = parser.parse_args()

    extracted = json.loads(args.pages.read_text(encoding="utf-8"))
    dataset = json.loads(args.questions.read_text(encoding="utf-8"))
    resolved, review = resolve_dataset(extracted, dataset)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.review.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(resolved, ensure_ascii=False, indent=2), encoding="utf-8")
    args.review.write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = resolved["answerResolutionSummary"]
    print(f"[ok] resolved answers: {summary['resolved']}/{summary['total']}")
    print(f"[review] unresolved: {summary['unresolved']}")
    print(f"[ok] output: {args.output}")
    print(f"[ok] review: {args.review}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
