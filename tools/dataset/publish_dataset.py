#!/usr/bin/env python3
"""Build the remote distribution package for the validated production dataset.

The application does not bundle production questions or question images. This
publisher writes questions.json, an optional assets.zip containing every image
referenced by the dataset, and dataset-manifest.json with integrity metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "processed" / "questions.json"
DEFAULT_ASSETS_ROOT = ROOT / "data" / "processed" / "assets"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "dataset"
EXPECTED_COUNT = 600
ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SHA256_RE = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_sha256(value: object) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value.strip()):
        raise ValueError("dataset sourceSha256 must contain the official source PDF SHA-256")
    return value.strip().lower().removeprefix("sha256:")


def normalize_asset_path(value: str) -> str:
    normalized = value.replace("\\", "/").removeprefix("./")
    path = PurePosixPath(normalized)
    if (
        not normalized
        or normalized.startswith("/")
        or ":" in path.parts[0]
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ValueError(f"unsafe image path: {value}")
    if path.suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise ValueError(f"unsupported image type: {value}")
    return path.as_posix()


def referenced_assets(questions: list[dict]) -> list[str]:
    paths: set[str] = set()
    for question in questions:
        image = question.get("image")
        if image is None or image == "":
            continue
        if not isinstance(image, str):
            raise ValueError(f"question {question.get('id')} image must be a string or null")
        paths.add(normalize_asset_path(image))
    return sorted(paths)


def build_asset_archive(asset_paths: list[str], assets_root: Path, destination: Path) -> None:
    with zipfile.ZipFile(
        destination,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for relative in asset_paths:
            source = assets_root / Path(relative)
            if not source.is_file():
                raise ValueError(f"missing referenced image: {source}")
            archive.write(source, arcname=relative)


def publish(source: Path, assets_root: Path, output_dir: Path) -> tuple[Path, Path, Path | None]:
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

    source_checksum = normalize_sha256(dataset.get("sourceSha256"))
    dataset["sourceSha256"] = source_checksum

    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_path = output_dir / "questions.json"
    manifest_path = output_dir / "dataset-manifest.json"
    asset_archive_path = output_dir / "assets.zip"

    # Write the normalized production payload instead of byte-copying an input
    # that could contain a prefixed/mixed-case provenance hash.
    dataset_path.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    dataset_checksum = sha256_file(dataset_path)
    asset_paths = referenced_assets(questions)

    manifest: dict[str, object] = {
        "dataset": dataset["dataset"],
        "version": dataset["version"],
        "validFrom": dataset["validFrom"],
        "stage": dataset["stage"],
        "datasetUrl": "questions.json",
        "sha256": dataset_checksum,
        "sizeBytes": dataset_path.stat().st_size,
        "sourceSha256": source_checksum,
    }

    if asset_paths:
        build_asset_archive(asset_paths, assets_root, asset_archive_path)
        manifest["assets"] = {
            "url": "assets.zip",
            "format": "zip",
            "sha256": sha256_file(asset_archive_path),
            "sizeBytes": asset_archive_path.stat().st_size,
            "fileCount": len(asset_paths),
        }
    elif asset_archive_path.exists():
        asset_archive_path.unlink()

    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return dataset_path, manifest_path, asset_archive_path if asset_paths else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--assets-root", type=Path, default=DEFAULT_ASSETS_ROOT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    try:
        dataset_path, manifest_path, asset_path = publish(
            args.input,
            args.assets_root,
            args.output_dir,
        )
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Cannot publish dataset: {error}") from error

    print(f"[ok] dataset package: {dataset_path}")
    if asset_path:
        print(f"[ok] asset package: {asset_path}")
    print(f"[ok] dataset manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
