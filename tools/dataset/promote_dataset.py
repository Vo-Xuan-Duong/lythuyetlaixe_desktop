#!/usr/bin/env python3
"""Promote a fully verified dataset candidate to data/processed/questions.json.

Promotion is intentionally strict. It refuses candidates with parser warnings,
unresolved answers/images, missing source provenance, null answers, or anything
other than exactly one correct answer per question. The Node production validator
remains the final release gate.
"""

from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "raw" / "questions.images-reviewed.json"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "questions.json"
SHA256_RE = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")


def promotion_errors(dataset: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    questions = dataset.get("questions")
    if not isinstance(questions, list):
        return ["questions must be an array"]

    source_sha256 = dataset.get("sourceSha256")
    if not isinstance(source_sha256, str) or not SHA256_RE.fullmatch(source_sha256.strip()):
        errors.append("sourceSha256 must contain the official source PDF SHA-256")

    if len(questions) != 600:
        errors.append(f"expected 600 questions, found {len(questions)}")

    global_warnings = dataset.get("parserWarnings") or []
    if global_warnings:
        errors.append(f"global parser warnings remain: {len(global_warnings)}")

    image_verification = dataset.get("imageVerification")
    if not isinstance(image_verification, dict):
        errors.append("image verification stage has not been applied")
    else:
        unresolved_images = image_verification.get("unresolved")
        if not isinstance(unresolved_images, int):
            errors.append("image verification unresolved count is missing")
        elif unresolved_images != 0:
            errors.append(f"image verification still has {unresolved_images} unresolved questions")

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
            errors.append(f"{prefix}: answer still needs verification")

        image_needs_verification = question.get("imageNeedsVerification")
        if not isinstance(image_needs_verification, bool):
            errors.append(f"{prefix}: image verification status is missing")
        elif image_needs_verification:
            errors.append(f"{prefix}: image still needs verification")

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
    result["sourceSha256"] = str(result["sourceSha256"]).strip().lower().removeprefix("sha256:")
    result["stage"] = "production"
    result["promotedAt"] = datetime.now(timezone.utc).isoformat()
    result["promotion"] = {
        "method": "verified-dataset-pipeline",
        "questionCount": len(result["questions"]),
        "unresolvedAnswers": 0,
        "unresolvedImages": 0,
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
    print("[next] run pnpm dataset:validate locally when you are ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
