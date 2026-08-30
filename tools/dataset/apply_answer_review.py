#!/usr/bin/env python3
"""Apply manually verified answers to unresolved questions.

Manual review input is explicit and versioned. The script records who/what verified
an override and never silently overwrites a geometry-resolved answer unless
--allow-overwrite is provided.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "raw" / "questions.resolved.json"
DEFAULT_REVIEW = ROOT / "data" / "source" / "manual-answer-review.json"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "questions.reviewed.json"
VALID_KEYS = {"A", "B", "C", "D"}


def apply_reviews(
    dataset: dict[str, Any],
    review: dict[str, Any],
    *,
    allow_overwrite: bool = False,
) -> dict[str, Any]:
    if dataset.get("dataset") != review.get("dataset"):
        raise ValueError("review dataset identifier does not match source dataset")
    if dataset.get("version") != review.get("version"):
        raise ValueError("review version does not match source dataset")

    result = deepcopy(dataset)
    questions = {int(question["id"]): question for question in result.get("questions", [])}
    review_items = review.get("answers", [])
    if not isinstance(review_items, list):
        raise ValueError("review.answers must be an array")

    applied = 0
    seen_ids: set[int] = set()
    for item in review_items:
        question_id = int(item["questionId"])
        selected = str(item["answerKey"]).upper()
        if selected not in VALID_KEYS:
            raise ValueError(f"question {question_id}: invalid answer key {selected}")
        if question_id in seen_ids:
            raise ValueError(f"question {question_id}: duplicate manual review entry")
        seen_ids.add(question_id)

        question = questions.get(question_id)
        if not question:
            raise ValueError(f"question {question_id}: not found in dataset")

        existing = question.get("answerResolution", {}).get("selected")
        if existing and existing != selected and not allow_overwrite:
            raise ValueError(
                f"question {question_id}: geometry selected {existing}; use --allow-overwrite only after source verification"
            )

        available = {str(answer.get("key")) for answer in question.get("answers", [])}
        if selected not in available:
            raise ValueError(f"question {question_id}: answer {selected} does not exist")

        for answer in question.get("answers", []):
            answer["correct"] = str(answer.get("key")) == selected

        previous_resolution = deepcopy(question.get("answerResolution"))
        question["answerResolution"] = {
            "method": "manual-source-review",
            "selected": selected,
            "confidence": 1.0,
            "reason": str(item.get("note") or "verified against official source"),
            "reviewer": item.get("reviewer"),
            "verifiedAt": item.get("verifiedAt"),
            "sourcePage": item.get("sourcePage", question.get("sourcePage")),
            "previous": previous_resolution,
        }
        question["needsVerification"] = False
        applied += 1

    unresolved = sum(1 for question in result.get("questions", []) if question.get("needsVerification") is True)
    result["stage"] = "reviewed" if unresolved == 0 else "partially-reviewed"
    result["manualReviewSummary"] = {
        "applied": applied,
        "unresolved": unresolved,
        "reviewFileVersion": review.get("reviewVersion"),
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--allow-overwrite", action="store_true")
    args = parser.parse_args()

    if not args.review.exists():
        raise SystemExit(
            f"Review file not found: {args.review}. Create it from data/source/manual-answer-review.example.json."
        )

    dataset = json.loads(args.input.read_text(encoding="utf-8"))
    review = json.loads(args.review.read_text(encoding="utf-8"))
    try:
        result = apply_reviews(dataset, review, allow_overwrite=args.allow_overwrite)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = result["manualReviewSummary"]
    print(f"[ok] manual reviews applied: {summary['applied']}")
    print(f"[review] unresolved questions: {summary['unresolved']}")
    print(f"[ok] output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
