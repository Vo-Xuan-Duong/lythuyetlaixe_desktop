#!/usr/bin/env python3
"""Parse extracted PDF text into an UNVERIFIED question candidate dataset.

This script deliberately leaves `correct` as null. Correct answers in the official
PDF are indicated by underlining and must be resolved from the geometry layer or
manual verification before the production validator can pass.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "raw" / "extracted" / "pages.json"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "questions.unverified.json"
MANIFEST = ROOT / "data" / "source" / "source-manifest.json"
CRITICAL_IDS = ROOT / "data" / "source" / "critical-question-ids.json"

QUESTION_RE = re.compile(r"(?mi)^\s*Câu\s+(\d{1,3})\s*[\.:]\s*(.*)$")
ANSWER_RE = re.compile(r"^\s*([1-4])\s*[\.)]\s*(.*)$")
ANSWER_KEYS = {"1": "A", "2": "B", "3": "C", "4": "D"}
AUTO_LICENSES = ["B", "C1", "C", "D1", "D2", "D", "BE", "C1E", "CE", "D1E", "D2E", "DE"]

CATEGORY_RULES = [
    (1, 180, "GENERAL_RULES"),
    (181, 205, "CULTURE"),
    (206, 263, "DRIVING_TECHNIQUE"),
    (264, 300, "VEHICLE"),
    (301, 485, "ROAD_SIGNS"),
    (486, 600, "SITUATIONS"),
]


def category_for(question_id: int) -> str:
    for start, end, code in CATEGORY_RULES:
        if start <= question_id <= end:
            return code
    return "UNKNOWN"


def normalize(parts: list[str]) -> str:
    return " ".join(part.strip() for part in parts if part.strip()).strip()


def page_for_offset(boundaries: list[tuple[int, int]], offset: int) -> int | None:
    for end_offset, page_number in boundaries:
        if offset < end_offset:
            return page_number
    return None


def parse_segment(header: str, body: str) -> tuple[str, list[dict[str, Any]], list[str]]:
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    question_parts = [header.strip()] if header.strip() else []
    answers: list[dict[str, Any]] = []
    warnings: list[str] = []
    current_answer: dict[str, Any] | None = None
    found_first_answer = False

    for line in lines:
        match = ANSWER_RE.match(line)
        if match:
            found_first_answer = True
            if current_answer:
                current_answer["content"] = normalize(current_answer.pop("parts"))
                answers.append(current_answer)
            current_answer = {
                "key": ANSWER_KEYS[match.group(1)],
                "parts": [match.group(2)],
                "correct": None,
            }
            continue

        if current_answer:
            current_answer["parts"].append(line)
        elif not found_first_answer:
            question_parts.append(line)

    if current_answer:
        current_answer["content"] = normalize(current_answer.pop("parts"))
        answers.append(current_answer)

    if len(answers) < 2:
        warnings.append(f"Only {len(answers)} answer candidates were parsed")

    return normalize(question_parts), answers, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    extracted = json.loads(args.input.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    critical = set(json.loads(CRITICAL_IDS.read_text(encoding="utf-8"))["questionIds"])

    text_parts: list[str] = []
    boundaries: list[tuple[int, int]] = []
    cursor = 0
    for page in extracted.get("pages", []):
        text = str(page.get("plainText", ""))
        text_parts.append(text)
        cursor += len(text) + 2
        boundaries.append((cursor, int(page["page"])))

    document_text = "\n\n".join(text_parts)
    matches = list(QUESTION_RE.finditer(document_text))
    questions: list[dict[str, Any]] = []
    global_warnings: list[str] = []

    for index, match in enumerate(matches):
        question_id = int(match.group(1))
        if not 1 <= question_id <= 600:
            continue

        segment_end = matches[index + 1].start() if index + 1 < len(matches) else len(document_text)
        body = document_text[match.end():segment_end]
        content, answers, warnings = parse_segment(match.group(2), body)

        questions.append(
            {
                "id": question_id,
                "category": category_for(question_id),
                "content": content,
                "image": None,
                "critical": question_id in critical,
                "licenses": AUTO_LICENSES,
                "sourceVersion": manifest["version"],
                "sourcePage": page_for_offset(boundaries, match.start()),
                "answers": answers,
                "needsVerification": True,
                "parserWarnings": warnings,
            }
        )

    ids = [question["id"] for question in questions]
    duplicates = sorted({question_id for question_id in ids if ids.count(question_id) > 1})
    if duplicates:
        global_warnings.append(f"Duplicate parsed question IDs: {duplicates}")

    missing = [question_id for question_id in range(1, 601) if question_id not in ids]
    if missing:
        global_warnings.append(f"Missing parsed question IDs: {missing}")

    output = {
        "dataset": manifest["dataset"],
        "version": manifest["version"],
        "validFrom": manifest["validFrom"],
        "stage": "parsed-unverified",
        "sourceSha256": extracted.get("sourceSha256"),
        "questions": questions,
        "parserWarnings": global_warnings,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] parsed candidate questions: {len(questions)}")
    print(f"[ok] output: {args.output}")
    if global_warnings:
        print("[warning] structural issues remain; do not promote this file to production")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
