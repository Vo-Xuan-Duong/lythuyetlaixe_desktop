#!/usr/bin/env python3
"""Promote a fully verified dataset candidate to data/processed/questions.json.

Promotion is intentionally strict. It refuses candidates with parser warnings,
unresolved questions, null answers, or anything other than exactly one correct
answer per question. The Node production validator remains the final release gate.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "raw" / "questions.reviewed.json"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "questions.json"


def promotion_errors(dataset: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    questions = dataset.get("questions")
    if not isinstance(questions, list):
        return ["questions must be an array"]

    if len(questions) != 600:
        errors.append(f"expected 600 questions, found {len(questions)}")

    global_warnings = dataset.get("parserWarnings") or []
    if global_warnings:
        errors.append(f"global parser warnings remain: {len(global_warnings)}")

    ids: set[int] = set()
    for question in questions:
        question_id = question.get("id")
        prefix = f"question {question_id}"
        if not isinstance(question_id, int):
            errors.append(f"{prefix}: invalid id")
            continue
        if question_id in ids:
            errors.append(f"{prefix}: duplicate id")
        ids.add(question_id)

        if question.get("needsVerification") is True:
            errors.append(f"{prefix}: still needs verification")

        warnings = question.get("parserWarnings") or []
        if warnings:
            errors.append(f"{prefix}: parser warnings remain: {warnings}")

        answers = question.get("answers")
        if not isinstance(answers, list) or len(answers) < 2:
            errors.append(f"{prefix}: invalid answers")
            continue

        non_boolean = [answer.get("key") for answer in answers if not isinstance(answer.get("correct"), bool)]
        if non_boolean:
            errors.append(f"{prefix}: non-boolean correct flags: {non_boolean}")

        correct_count = sum(1 for answer in answers if answer.get("correct") is True)
        if correct_count != 1:
            errors.append(f"{prefix}: expected exactly 1 correct answer, found {correct_count}")

    missing = sorted(set(range(1, 601)) - ids)
    if missing:
        errors.append(f"missing question ids: {missing}")
    return errors


def promote(dataset: dict[str, Any]) -> dict[str, Any]:
    errors = promotion_errors(dataset)
    if errors:
        raise ValueError("dataset cannot be promoted:\n- " + "\n- ".join(errors))

    result = deepcopy(dataset)
    result["stage"] = "production"
    result["promotedAt"] = datetime.now(timezone.utc).isoformat()
    result["promotion"] = {
        "method": "verified-dataset-pipeline",
        "questionCount": len(result["questions"]),
        "unresolved": 0,
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    dataset = json.loads(args.input.read_text(encoding="utf-8"))
    try:
        result = promote(dataset)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] production candidate promoted: {args.output}")
    print("[next] run pnpm dataset:validate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
