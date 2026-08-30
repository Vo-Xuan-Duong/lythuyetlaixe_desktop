#!/usr/bin/env python3
"""Fast CI check for source manifest and critical-question metadata."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads((ROOT / "data/source/source-manifest.json").read_text(encoding="utf-8"))
critical = json.loads((ROOT / "data/source/critical-question-ids.json").read_text(encoding="utf-8"))
ids = critical["questionIds"]

assert manifest["dataset"] == "VN_GPLX_600"
assert manifest["questionCount"] == 600
assert manifest["criticalQuestionCount"] == 60
assert len(ids) == 60, f"Expected 60 critical IDs, got {len(ids)}"
assert len(set(ids)) == 60, "Critical IDs must be unique"
assert all(isinstance(value, int) and 1 <= value <= 600 for value in ids)
assert any(source.get("type") == "question-bank" for source in manifest["sources"])
assert any(source.get("type") == "guidance" for source in manifest["sources"])

print("Source metadata validation passed.")
