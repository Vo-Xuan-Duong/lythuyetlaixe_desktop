#!/usr/bin/env python3
"""Build the remote distribution package for the validated production dataset.

The application does not bundle production questions or question images. This
publisher keeps the mutable manifest at the package root and writes immutable
versioned payloads below releases/<version>/ for safe object-storage publishing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "processed" / "questions.json"
DEFAULT_ASSETS_ROOT = ROOT / "data" / "processed" / "assets"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "dataset"
EXPECTED_COUNT = 600
ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SHA256_RE = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$")


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


def normalize_version(value: object) -> str:
    if not isinstance(value, str) or not VERSION_RE.fullmatch(value.strip()):
        raise ValueError("dataset version must be a safe release identifier")
    return value.strip()


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


def write_immutable_payload(path: Path, content: bytes, label: str) -> None:
    if path.exists():
        current = path.read_bytes()
        if current != content:
            raise ValueError(
                f"{label} for this version already exists with different content; bump dataset version"
            )
        return
    path.write_bytes(content)


def publish(source: Path, assets_root: Path, output_dir: Path) -> tuple[Path, Path, Path | None]:
    dataset = json.loads(source.read_text(encoding="utf-8"))
    if dataset.get("dataset") != "VN_GPLX_600":
        raise ValueError("unsupported dataset identifier")
    if dataset.get("stage") != "production":
        raise ValueError("only stage=production can be published")
    questions = dataset.get("questions")
    if not isinstance(questions, list) or len(questions) != EXPECTED_COUNT:
        raise ValueError(f"expected {EXPECTED_COUNT} questions before publish")

    version = normalize_version(dataset.get("version"))
    if not dataset.get("validFrom"):
        raise ValueError("dataset validFrom is required")

    source_checksum = normalize_sha256(dataset.get("sourceSha256"))
    dataset["version"] = version
    dataset["sourceSha256"] = source_checksum

    output_dir.mkdir(parents=True, exist_ok=True)
    release_dir = output_dir / "releases" / version
    release_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = release_dir / "questions.json"
    manifest_path = output_dir / "dataset-manifest.json"
    asset_archive_path = release_dir / "assets.zip"

    normalized_dataset_bytes = (
        json.dumps(dataset, ensure_ascii=False, indent=2) + "\n"
    ).encode("utf-8")
    write_immutable_payload(dataset_path, normalized_dataset_bytes, "questions.json")

    dataset_checksum = sha256_file(dataset_path)
    asset_paths = referenced_assets(questions)

    manifest: dict[str, object] = {
        "dataset": dataset["dataset"],
        "version": version,
        "validFrom": dataset["validFrom"],
        "stage": dataset["stage"],
        "datasetUrl": f"releases/{version}/questions.json",
        "sha256": dataset_checksum,
        "sizeBytes": dataset_path.stat().st_size,
        "sourceSha256": source_checksum,
    }

    if asset_paths:
        temporary_archive = release_dir / ".assets.zip.tmp"
        if temporary_archive.exists():
            temporary_archive.unlink()
        build_asset_archive(asset_paths, assets_root, temporary_archive)
        archive_bytes = temporary_archive.read_bytes()
        temporary_archive.unlink()
        write_immutable_payload(asset_archive_path, archive_bytes, "assets.zip")
        manifest["assets"] = {
            "url": f"releases/{version}/assets.zip",
            "format": "zip",
            "sha256": sha256_file(asset_archive_path),
            "sizeBytes": asset_archive_path.stat().st_size,
            "fileCount": len(asset_paths),
        }
    elif asset_archive_path.exists():
        raise ValueError(
            "assets.zip already exists for this version but current dataset references no assets; bump dataset version"
        )

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

    print(f"[ok] dataset payload: {dataset_path}")
    if asset_path:
        print(f"[ok] asset payload: {asset_path}")
    print(f"[ok] dataset manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
