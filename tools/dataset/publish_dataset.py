#!/usr/bin/env python3
"""Build a remote distribution package for the validated production dataset.

The application no longer bundles the 600-question dataset. This publisher writes
`questions.json` plus a small `dataset-manifest.json` into a distribution folder.
Upload both files to the same stable HTTP(S) location. The application downloads
only the manifest on startup and downloads questions.json when the version changes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "processed" / "questions.json"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "dataset"
EXPECTED_COUNT = 600


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def publish(source: Path, output_dir: Path) -> tuple[Path, Path]:
    dataset = json.loads(source.read_text(encoding="utf-8"))
    if dataset.get("dataset") != "VN_GPLX_600":
        raise ValueError("unsupported dataset identifier")
    if dataset.get("stage") != "production":
        raise ValueError("only stage=production can be published")
    questions = dataset.get("questions")
    if not isinstance(questions, list) or len(questions) != EXPECTED_COUNT:
        raise ValueError(f"expected {EXPECTED_COUNT} questions before publish")
    if not dataset.get("version"):
        raise ValueError("dataset version is required")
    if not dataset.get("validFrom"):
        raise ValueError("dataset validFrom is required")

    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_path = output_dir / "questions.json"
    manifest_path = output_dir / "dataset-manifest.json"

    shutil.copyfile(source, dataset_path)
    checksum = sha256_file(dataset_path)

    manifest = {
        "dataset": dataset["dataset"],
        "version": dataset["version"],
        "validFrom": dataset["validFrom"],
        "stage": dataset["stage"],
        # Relative URL keeps deployment provider-independent. The app resolves it
        # relative to the final manifest URL after HTTP redirects.
        "datasetUrl": "questions.json",
        "sha256": checksum,
        "sizeBytes": dataset_path.stat().st_size,
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return dataset_path, manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    try:
        dataset_path, manifest_path = publish(args.input, args.output_dir)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot publish dataset: {error}") from error

    print(f"[ok] dataset package: {dataset_path}")
    print(f"[ok] dataset manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
