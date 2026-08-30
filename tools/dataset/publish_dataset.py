#!/usr/bin/env python3
"""Publish the validated production dataset into Vite's public bundle.

Run the production validator before this script. The publisher performs a small
second guard so a non-production or incomplete file is never copied into the app.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "processed" / "questions.json"
DEFAULT_OUTPUT = ROOT / "public" / "data" / "questions.json"
EXPECTED_COUNT = 600


def publish(source: Path, destination: Path) -> None:
    dataset = json.loads(source.read_text(encoding="utf-8"))
    if dataset.get("dataset") != "VN_GPLX_600":
        raise ValueError("unsupported dataset identifier")
    if dataset.get("stage") != "production":
        raise ValueError("only stage=production can be published")
    questions = dataset.get("questions")
    if not isinstance(questions, list) or len(questions) != EXPECTED_COUNT:
        raise ValueError(f"expected {EXPECTED_COUNT} questions before publish")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    try:
        publish(args.input, args.output)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot publish dataset: {error}") from error

    print(f"[ok] published dataset: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
