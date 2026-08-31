from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import zipfile
from datetime import datetime
from pathlib import Path

from source_provenance import DEFAULT_MANIFEST, inspect_multipart_source

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "traffic-signs" / "processed" / "traffic-signs.json"
DEFAULT_ASSETS_ROOT = ROOT / "data" / "traffic-signs" / "processed" / "assets"
DEFAULT_SOURCE_MANIFEST = DEFAULT_MANIFEST
DEFAULT_OUTPUT = ROOT / "dist" / "traffic-signs"
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$")
SHA256_RE = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")
ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
IMAGE_SELECTION_METHODS = {"official-qcvn-candidate", "official-qcvn-manual-crop"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(source: Path, label: str) -> dict:
    if not source.is_file():
        raise FileNotFoundError(f"missing {label}: {source}")
    with source.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def normalize_version(value: object) -> str:
    if not isinstance(value, str) or not VERSION_RE.fullmatch(value.strip()):
        raise ValueError("traffic signs version must be a safe release identifier")
    return value.strip()


def normalize_sha256(value: object) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value.strip()):
        raise ValueError("traffic signs sourceSha256 must be a valid source document SHA-256")
    return value.strip().lower().removeprefix("sha256:")


def verify_source_provenance(dataset: dict, source_manifest_path: Path) -> tuple[str, int]:
    provenance = inspect_multipart_source(source_manifest_path, require_verified=True)
    if dataset.get("sourceDocument") != provenance.manifest.get("sourceDocument"):
        raise ValueError("traffic-signs.json sourceDocument does not match verified source manifest")
    if normalize_sha256(dataset.get("sourceSha256")) != provenance.source_sha256:
        raise ValueError("traffic-signs.json sourceSha256 does not match verified canonical multipart bundle")
    return provenance.source_sha256, len(provenance.part_files)


def safe_relative_path(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} is required")
    raw = value.strip().replace("\\", "/")
    if raw.startswith("./"):
        raw = raw[2:]
    if raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        raise ValueError(f"unsafe {label}: {value}")
    segments = [segment for segment in raw.split("/") if segment]
    if not segments or any(segment in {".", ".."} for segment in segments):
        raise ValueError(f"unsafe {label}: {value}")
    return "/".join(segments)


def safe_relative_asset_path(value: str) -> str:
    normalized = safe_relative_path(value, "traffic sign asset path")
    if Path(normalized).suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise ValueError(f"unsupported traffic sign asset type: {value}")
    return normalized


def validate_crop(value: object, code: str) -> None:
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError(f"{code}: imageSelection.crop must be [x0,y0,x1,y1]")
    numbers: list[float] = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)):
            raise ValueError(f"{code}: imageSelection.crop must contain finite numbers")
        numbers.append(float(item))
    if numbers[2] <= numbers[0] or numbers[3] <= numbers[1]:
        raise ValueError(f"{code}: imageSelection.crop must have positive area")


def validate_record_release_contract(dataset: dict) -> list[str]:
    dataset_source_sha = normalize_sha256(dataset.get("sourceSha256"))
    source_document = str(dataset.get("sourceDocument") or "").strip()
    paths: set[str] = set()
    for sign in dataset.get("signs", []):
        if not isinstance(sign, dict):
            raise ValueError("traffic-sign records must be objects")
        code = str(sign.get("code") or "<unknown>").strip()
        if str(sign.get("sourceVersion") or "").strip() != source_document:
            raise ValueError(f"{code}: sourceVersion must match dataset sourceDocument")
        if not isinstance(sign.get("sourceSection"), str) or not sign["sourceSection"].strip():
            raise ValueError(f"{code}: sourceSection is required")
        pages = sign.get("sourcePages")
        if not isinstance(pages, list) or not pages or any(isinstance(page, bool) or not isinstance(page, int) or page <= 0 for page in pages):
            raise ValueError(f"{code}: sourcePages must contain positive integers")
        if not isinstance(sign.get("verifiedBy"), str) or not sign["verifiedBy"].strip():
            raise ValueError(f"{code}: verifiedBy is required")
        verified_at = sign.get("verifiedAt")
        if not isinstance(verified_at, str) or not verified_at.strip():
            raise ValueError(f"{code}: verifiedAt is required")
        try:
            datetime.fromisoformat(verified_at.strip().replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError(f"{code}: verifiedAt must be an ISO-8601 timestamp") from error

        image = sign.get("image")
        if image in (None, ""):
            if sign.get("imageSelection") is not None or sign.get("imageVerified") is True:
                raise ValueError(f"{code}: image provenance exists without image")
            continue
        if not isinstance(image, str):
            raise ValueError(f"{code}: image must be a string")
        image_path = safe_relative_asset_path(image)
        if sign.get("imageVerified") is not True:
            raise ValueError(f"{code}: image is present but imageVerified is not true")
        selection = sign.get("imageSelection")
        if not isinstance(selection, dict):
            raise ValueError(f"{code}: verified image requires imageSelection provenance")
        method = selection.get("method")
        if method not in IMAGE_SELECTION_METHODS:
            raise ValueError(f"{code}: unsupported imageSelection method {method}")
        if normalize_sha256(selection.get("sourceSha256")) != dataset_source_sha:
            raise ValueError(f"{code}: imageSelection sourceSha256 does not match dataset source")
        if str(selection.get("sourceSection") or "").strip() != sign["sourceSection"].strip():
            raise ValueError(f"{code}: imageSelection sourceSection does not match record")
        page = selection.get("page")
        if isinstance(page, bool) or not isinstance(page, int) or page <= 0:
            raise ValueError(f"{code}: imageSelection.page must be a positive integer")
        validate_crop(selection.get("crop"), code)
        processed_asset = safe_relative_asset_path(selection.get("processedAsset"))
        if processed_asset != image_path:
            raise ValueError(f"{code}: imageSelection.processedAsset does not match image")
        if method == "official-qcvn-candidate":
            candidate = safe_relative_path(selection.get("candidateFile"), f"{code} imageSelection.candidateFile")
            if not candidate.startswith("image-candidates/"):
                raise ValueError(f"{code}: candidateFile must be inside image-candidates/")
        paths.add(image_path)
    return sorted(paths)


def build_assets_zip(paths: list[str], assets_root: Path, destination: Path) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in paths:
            source = assets_root.joinpath(*relative.split("/"))
            if not source.is_file():
                raise FileNotFoundError(f"missing traffic sign asset: {source}")
            archive.write(source, arcname=relative)


def write_immutable_payload(path: Path, content: bytes, label: str) -> None:
    if path.exists():
        if path.read_bytes() != content:
            raise ValueError(f"{label} for this version already exists with different content; bump traffic-sign dataset version")
        return
    path.write_bytes(content)


def publish(
    source: Path,
    assets_root: Path,
    output_dir: Path,
    source_manifest: Path = DEFAULT_SOURCE_MANIFEST,
) -> tuple[Path, Path, Path | None]:
    dataset = load_json(source, "traffic signs dataset")
    if dataset.get("dataset") != "VN_TRAFFIC_SIGNS" or dataset.get("stage") != "production":
        raise ValueError("traffic-signs.json must be a production VN_TRAFFIC_SIGNS dataset")
    signs = dataset.get("signs")
    if not isinstance(signs, list) or not signs:
        raise ValueError("traffic-signs.json must contain at least one verified sign")

    version = normalize_version(dataset.get("version"))
    source_sha256, source_part_count = verify_source_provenance(dataset, source_manifest)
    if not isinstance(dataset.get("validFrom"), str) or not dataset["validFrom"].strip():
        raise ValueError("traffic-signs.json validFrom is required")
    if not isinstance(dataset.get("sourceDocument"), str) or not dataset["sourceDocument"].strip():
        raise ValueError("traffic-signs.json sourceDocument is required")
    dataset["version"] = version
    dataset["sourceSha256"] = source_sha256
    asset_paths = validate_record_release_contract(dataset)

    output_dir.mkdir(parents=True, exist_ok=True)
    release_dir = output_dir / "releases" / version
    release_dir.mkdir(parents=True, exist_ok=True)
    output_dataset = release_dir / "traffic-signs.json"
    dataset_bytes = (json.dumps(dataset, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    write_immutable_payload(output_dataset, dataset_bytes, "traffic-signs.json")

    archive_path = release_dir / "traffic-sign-assets.zip"
    published_archive: Path | None = None
    if asset_paths:
        temporary_archive = release_dir / ".traffic-sign-assets.zip.tmp"
        temporary_archive.unlink(missing_ok=True)
        build_assets_zip(asset_paths, assets_root, temporary_archive)
        archive_bytes = temporary_archive.read_bytes()
        temporary_archive.unlink()
        write_immutable_payload(archive_path, archive_bytes, "traffic-sign-assets.zip")
        published_archive = archive_path
    elif archive_path.exists():
        raise ValueError("traffic-sign-assets.zip already exists for this version but current dataset references no assets; bump traffic-sign dataset version")

    manifest = {
        "dataset": "VN_TRAFFIC_SIGNS",
        "version": version,
        "validFrom": dataset["validFrom"],
        "stage": "production",
        "datasetUrl": f"releases/{version}/traffic-signs.json",
        "sha256": sha256(output_dataset),
        "sourceDocument": dataset["sourceDocument"],
        "sourceSha256": source_sha256,
        "sourcePartCount": source_part_count,
        "signCount": len(signs),
        "sizeBytes": output_dataset.stat().st_size,
    }
    if published_archive is not None:
        manifest["assets"] = {
            "url": f"releases/{version}/traffic-sign-assets.zip",
            "format": "zip",
            "sha256": sha256(published_archive),
            "sizeBytes": published_archive.stat().st_size,
            "fileCount": len(asset_paths),
        }

    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return output_dataset, manifest_path, published_archive


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish the verified traffic-sign catalog")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--assets-root", type=Path, default=DEFAULT_ASSETS_ROOT)
    parser.add_argument("--source-manifest", type=Path, default=DEFAULT_SOURCE_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        dataset_path, manifest_path, asset_path = publish(args.input, args.assets_root, args.output_dir, args.source_manifest)
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Cannot publish traffic signs: {error}") from error
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    print(f"Published traffic signs dataset {dataset['version']} ({len(dataset['signs'])} signs)")
    print(f"  {dataset_path}")
    if asset_path:
        print(f"  {asset_path}")
    print(f"  {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
