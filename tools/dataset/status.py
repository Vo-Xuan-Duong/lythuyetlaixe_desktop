#!/usr/bin/env python3
"""Print a concise checkpoint report for the local 600-question dataset pipeline.

This command is read-only. It does not download, modify, promote or publish data.
It is intended to make manual answer/image review progress explicit between stages.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
DIST = ROOT / "dist" / "dataset"
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")

FILES = {
    "parsed": RAW / "questions.unverified.json",
    "resolved": RAW / "questions.resolved.json",
    "answer_review": RAW / "answer-review.json",
    "answers_verified": RAW / "questions.reviewed.json",
    "image_candidates": RAW / "questions.with-images.json",
    "image_review": RAW / "image-review.json",
    "images_verified": RAW / "questions.images-reviewed.json",
    "production": PROCESSED / "questions.json",
    "manifest": DIST / "dataset-manifest.json",
}


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def questions(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not payload:
        return []
    rows = payload.get("questions")
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def unresolved_answers(rows: list[dict[str, Any]]) -> list[int]:
    unresolved: list[int] = []
    for row in rows:
        answer_rows = row.get("answers")
        if not isinstance(answer_rows, list):
            unresolved.append(int(row.get("id", 0) or 0))
            continue
        correct = [answer for answer in answer_rows if isinstance(answer, dict) and answer.get("correct") is True]
        has_null = any(not isinstance(answer.get("correct"), bool) for answer in answer_rows if isinstance(answer, dict))
        if row.get("needsVerification") is True or has_null or len(correct) != 1:
            unresolved.append(int(row.get("id", 0) or 0))
    return [item for item in unresolved if item > 0]


def parser_warning_count(rows: list[dict[str, Any]], payload: dict[str, Any] | None) -> int:
    count = len(payload.get("parserWarnings") or []) if payload else 0
    for row in rows:
        warnings = row.get("parserWarnings")
        if isinstance(warnings, list):
            count += len(warnings)
    return count


def image_unresolved(rows: list[dict[str, Any]], payload: dict[str, Any] | None) -> list[int]:
    unresolved = [
        int(row.get("id", 0) or 0)
        for row in rows
        if row.get("imageNeedsVerification") is True
    ]
    if payload:
        verification = payload.get("imageVerification")
        if isinstance(verification, dict) and verification.get("unresolved") == 0:
            return []
    return [item for item in unresolved if item > 0]


def review_reason_counts(payload: dict[str, Any] | None) -> Counter[str]:
    result: Counter[str] = Counter()
    if not payload:
        return result
    for key in ("items", "questions", "unresolved"):
        rows = payload.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            reason = row.get("reason")
            if isinstance(reason, str) and reason:
                result[reason] += 1
    return result


def ids_preview(values: list[int], limit: int = 20) -> str:
    if not values:
        return "—"
    head = ", ".join(str(value) for value in values[:limit])
    return head if len(values) <= limit else f"{head}, … (+{len(values) - limit})"


def marker(ok: bool) -> str:
    return "OK" if ok else "--"


def short_hash(value: object) -> str:
    if not isinstance(value, str):
        return "—"
    normalized = value.strip().lower().removeprefix("sha256:")
    if not SHA256_RE.fullmatch(normalized):
        return f"INVALID ({value})" if value else "—"
    return f"{normalized[:12]}…{normalized[-8:]}"


def main() -> int:
    payloads = {name: read_json(path) for name, path in FILES.items()}

    print("Dataset pipeline status")
    print("=" * 72)
    for name, path in FILES.items():
        print(f"[{marker(payloads[name] is not None)}] {name:18} {path.relative_to(ROOT)}")

    parsed_rows = questions(payloads["parsed"])
    resolved_rows = questions(payloads["resolved"])
    answer_verified_rows = questions(payloads["answers_verified"])
    image_candidate_rows = questions(payloads["image_candidates"])
    image_verified_rows = questions(payloads["images_verified"])
    production_rows = questions(payloads["production"])

    best_answer_payload = payloads["answers_verified"] or payloads["resolved"] or payloads["parsed"]
    best_answer_rows = answer_verified_rows or resolved_rows or parsed_rows
    best_image_payload = payloads["images_verified"] or payloads["image_candidates"]
    best_image_rows = image_verified_rows or image_candidate_rows

    unresolved = unresolved_answers(best_answer_rows)
    warnings = parser_warning_count(best_answer_rows, best_answer_payload)
    image_pending = image_unresolved(best_image_rows, best_image_payload)

    print("\nCurrent data")
    print("-" * 72)
    print(f"Parsed questions       : {len(parsed_rows)}")
    print(f"Best answer-stage rows : {len(best_answer_rows)}")
    print(f"Answer unresolved      : {len(unresolved)}")
    print(f"Answer unresolved IDs  : {ids_preview(unresolved)}")
    print(f"Parser warnings        : {warnings}")
    print(f"Best image-stage rows  : {len(best_image_rows)}")
    print(f"Image unresolved       : {len(image_pending)}")
    print(f"Image unresolved IDs   : {ids_preview(image_pending)}")
    print(f"Production questions   : {len(production_rows)}")
    print(f"Source PDF SHA-256     : {short_hash((best_image_payload or best_answer_payload or {}).get('sourceSha256'))}")

    answer_reasons = review_reason_counts(payloads["answer_review"])
    image_reasons = review_reason_counts(payloads["image_review"])
    if answer_reasons:
        print("\nAnswer review reasons")
        for reason, count in answer_reasons.most_common():
            print(f"- {count:3}  {reason}")
    if image_reasons:
        print("\nImage review reasons")
        for reason, count in image_reasons.most_common():
            print(f"- {count:3}  {reason}")

    manifest = payloads["manifest"] or {}
    if manifest:
        print("\nDistribution integrity")
        print("-" * 72)
        print(f"Version                : {manifest.get('version', '—')}")
        print(f"questions.json SHA-256 : {short_hash(manifest.get('sha256'))}")
        print(f"Source PDF SHA-256     : {short_hash(manifest.get('sourceSha256'))}")
        assets = manifest.get("assets")
        print(
            f"assets.zip SHA-256     : {short_hash(assets.get('sha256')) if isinstance(assets, dict) else '—'}"
        )

    print("\nNext checkpoint")
    print("-" * 72)
    if len(parsed_rows) != 600:
        print("Run/repair extract + parse until exactly 600 unique questions are present.")
    elif unresolved:
        print("Complete manual answer review, then run: pnpm dataset:review")
    elif not payloads["image_candidates"]:
        print("Answers are resolved. Run: pnpm dataset:images")
    elif image_pending or not payloads["images_verified"]:
        print("Complete manual image review, then run: pnpm dataset:image-review")
    elif len(production_rows) != 600:
        print("Answer/image gates are resolved. Run: pnpm dataset:promote")
    elif not payloads["manifest"]:
        print("Production data exists. Run local validator, then: pnpm dataset:publish")
    else:
        print(
            "Distribution package exists: "
            f"version={manifest.get('version', '?')} stage={manifest.get('stage', '?')}."
        )
        print("Next: upload payload to the fixed HTTPS endpoint and verify first-run import.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
