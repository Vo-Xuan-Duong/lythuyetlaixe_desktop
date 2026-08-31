from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/traffic-signs/processed/traffic-signs.json")
ASSETS_ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/traffic-signs/processed/assets")
OUTPUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("dist/traffic-signs")
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$")
SHA256_RE = re.compile(r"^(?:sha256:)?[0-9a-fA-F]{64}$")
ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_dataset() -> dict:
    with INPUT.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_version(value: object) -> str:
    if not isinstance(value, str) or not VERSION_RE.fullmatch(value.strip()):
        raise ValueError("traffic signs version must be a safe release identifier")
    return value.strip()


def normalize_sha256(value: object) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value.strip()):
        raise ValueError("traffic signs sourceSha256 must be a valid source document SHA-256")
    return value.strip().lower().removeprefix("sha256:")


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


def build_assets_zip(paths: list[str], destination: Path) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in paths:
            source = ASSETS_ROOT.joinpath(*relative.split("/"))
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


def main() -> None:
    if not INPUT.is_file():
        raise FileNotFoundError(f"missing traffic signs dataset: {INPUT}")

    dataset = load_dataset()
    if dataset.get("dataset") != "VN_TRAFFIC_SIGNS" or dataset.get("stage") != "production":
        raise ValueError("traffic-signs.json must be a production VN_TRAFFIC_SIGNS dataset")

    signs = dataset.get("signs")
    if not isinstance(signs, list) or not signs:
        raise ValueError("traffic-signs.json must contain at least one verified sign")

    version = normalize_version(dataset.get("version"))
    source_sha256 = normalize_sha256(dataset.get("sourceSha256"))
    if not isinstance(dataset.get("validFrom"), str) or not dataset["validFrom"].strip():
        raise ValueError("traffic-signs.json validFrom is required")
    if not isinstance(dataset.get("sourceDocument"), str) or not dataset["sourceDocument"].strip():
        raise ValueError("traffic-signs.json sourceDocument is required")

    dataset["version"] = version
    dataset["sourceSha256"] = source_sha256

    OUTPUT.mkdir(parents=True, exist_ok=True)
    release_dir = OUTPUT / "releases" / version
    release_dir.mkdir(parents=True, exist_ok=True)

    output_dataset = release_dir / "traffic-signs.json"
    dataset_bytes = (json.dumps(dataset, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    write_immutable_payload(output_dataset, dataset_bytes, "traffic-signs.json")

    asset_paths = referenced_assets(dataset)
    archive_path = release_dir / "traffic-sign-assets.zip"
    if asset_paths:
        temporary_archive = release_dir / ".traffic-sign-assets.zip.tmp"
        if temporary_archive.exists():
            temporary_archive.unlink()
        build_assets_zip(asset_paths, temporary_archive)
        archive_bytes = temporary_archive.read_bytes()
        temporary_archive.unlink()
        write_immutable_payload(archive_path, archive_bytes, "traffic-sign-assets.zip")
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

    if asset_paths:
        manifest["assets"] = {
            "url": f"releases/{version}/traffic-sign-assets.zip",
            "format": "zip",
            "sha256": sha256(archive_path),
            "sizeBytes": archive_path.stat().st_size,
            "fileCount": len(asset_paths),
        }

    manifest_path = OUTPUT / "manifest.json"
    with manifest_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"Published traffic signs dataset {version} ({len(signs)} signs)")
    print(f"  {output_dataset}")
    if asset_paths:
        print(f"  {archive_path} ({len(asset_paths)} files)")
    print(f"  {manifest_path}")


if __name__ == "__main__":
    main()
