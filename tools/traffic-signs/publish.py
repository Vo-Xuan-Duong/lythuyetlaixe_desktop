from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "traffic-signs" / "processed" / "traffic-signs.json"
DEFAULT_ASSETS_ROOT = ROOT / "data" / "traffic-signs" / "processed" / "assets"
DEFAULT_SOURCE_MANIFEST = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
DEFAULT_OUTPUT = ROOT / "dist" / "traffic-signs"
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$")
SHA256_RE = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")
ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}


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


def verify_source_provenance(dataset: dict, source_manifest_path: Path) -> str:
    manifest = load_json(source_manifest_path, "traffic-sign source manifest")
    technical = manifest.get("technicalSource")
    if not isinstance(technical, dict):
        raise ValueError("traffic-sign source manifest is missing technicalSource")
    if technical.get("verificationStatus") != "verified-official-full-source":
        raise ValueError("traffic-sign technicalSource must be verified-official-full-source before publish")
    if not isinstance(technical.get("verifiedBy"), str) or not technical["verifiedBy"].strip():
        raise ValueError("traffic-sign technicalSource is missing verifiedBy")
    if not isinstance(technical.get("verifiedAt"), str) or not technical["verifiedAt"].strip():
        raise ValueError("traffic-sign technicalSource is missing verifiedAt")

    filename = technical.get("localFile")
    if not isinstance(filename, str) or not filename.strip() or Path(filename).name != filename:
        raise ValueError("traffic-sign technicalSource.localFile must be a plain filename")
    source_file = source_manifest_path.parent / filename
    if not source_file.is_file():
        raise FileNotFoundError(f"verified traffic-sign technical source file is missing: {source_file}")

    technical_sha = normalize_sha256(technical.get("sourceSha256"))
    if sha256(source_file) != technical_sha:
        raise ValueError("traffic-sign technicalSource SHA-256 does not match the verified local file")

    if dataset.get("sourceDocument") != manifest.get("sourceDocument"):
        raise ValueError("traffic-signs.json sourceDocument does not match verified source manifest")
    if normalize_sha256(dataset.get("sourceSha256")) != technical_sha:
        raise ValueError("traffic-signs.json sourceSha256 does not match verified technicalSource")
    return technical_sha


def safe_relative_asset_path(value: str) -> str:
    raw = value.replace("\\", "/")
    if raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        raise ValueError(f"unsafe traffic sign asset path: {value}")

    if raw.startswith("./"):
        raw = raw[2:]

    segments = [segment for segment in raw.split("/") if segment]
    if not segments or any(segment in {".", ".."} for segment in segments):
        raise ValueError(f"unsafe traffic sign asset path: {value}")

    normalized = "/".join(segments)
    if Path(normalized).suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise ValueError(f"unsupported traffic sign asset type: {value}")
    return normalized


def referenced_assets(dataset: dict) -> list[str]:
    paths: set[str] = set()
    for sign in dataset.get("signs", []):
        image = sign.get("image")
        if isinstance(image, str) and image.strip():
            paths.add(safe_relative_asset_path(image.strip()))
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
            raise ValueError(
                f"{label} for this version already exists with different content; bump traffic-sign dataset version"
            )
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
    source_sha256 = verify_source_provenance(dataset, source_manifest)
    if not isinstance(dataset.get("validFrom"), str) or not dataset["validFrom"].strip():
        raise ValueError("traffic-signs.json validFrom is required")
    if not isinstance(dataset.get("sourceDocument"), str) or not dataset["sourceDocument"].strip():
        raise ValueError("traffic-signs.json sourceDocument is required")

    dataset["version"] = version
    dataset["sourceSha256"] = source_sha256

    output_dir.mkdir(parents=True, exist_ok=True)
    release_dir = output_dir / "releases" / version
    release_dir.mkdir(parents=True, exist_ok=True)

    output_dataset = release_dir / "traffic-signs.json"
    dataset_bytes = (json.dumps(dataset, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    write_immutable_payload(output_dataset, dataset_bytes, "traffic-signs.json")

    asset_paths = referenced_assets(dataset)
    archive_path = release_dir / "traffic-sign-assets.zip"
    published_archive: Path | None = None
    if asset_paths:
        temporary_archive = release_dir / ".traffic-sign-assets.zip.tmp"
        if temporary_archive.exists():
            temporary_archive.unlink()
        build_assets_zip(asset_paths, assets_root, temporary_archive)
        archive_bytes = temporary_archive.read_bytes()
        temporary_archive.unlink()
        write_immutable_payload(archive_path, archive_bytes, "traffic-sign-assets.zip")
        published_archive = archive_path
    elif archive_path.exists():
        raise ValueError(
            "traffic-sign-assets.zip already exists for this version but current dataset references no assets; bump traffic-sign dataset version"
        )

    manifest = {
        "dataset": "VN_TRAFFIC_SIGNS",
        "version": version,
        "validFrom": dataset["validFrom"],
        "stage": "production",
        "datasetUrl": f"releases/{version}/traffic-signs.json",
        "sha256": sha256(output_dataset),
        "sourceDocument": dataset["sourceDocument"],
        "sourceSha256": source_sha256,
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
        dataset_path, manifest_path, asset_path = publish(
            args.input,
            args.assets_root,
            args.output_dir,
            args.source_manifest,
        )
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
