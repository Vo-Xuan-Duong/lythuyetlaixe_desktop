from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/traffic-signs/processed/traffic-signs.json")
ASSETS_ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/traffic-signs/processed/assets")
OUTPUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("dist/traffic-signs")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_dataset() -> dict:
    with INPUT.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def safe_relative_asset_path(value: str) -> str:
    raw = value.replace("\\", "/")
    if raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        raise ValueError(f"unsafe traffic sign asset path: {value}")

    if raw.startswith("./"):
        raw = raw[2:]

    segments = [segment for segment in raw.split("/") if segment]
    if not segments or any(segment in {".", ".."} for segment in segments):
        raise ValueError(f"unsafe traffic sign asset path: {value}")

    return "/".join(segments)


def referenced_assets(dataset: dict) -> list[str]:
    paths: set[str] = set()
    for sign in dataset.get("signs", []):
        image = sign.get("image")
        if isinstance(image, str) and image.strip():
            paths.add(safe_relative_asset_path(image.strip()))
    return sorted(paths)


def build_assets_zip(paths: list[str]) -> tuple[Path | None, int]:
    if not paths:
        return None, 0

    archive_path = OUTPUT / "traffic-sign-assets.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in paths:
            source = ASSETS_ROOT.joinpath(*relative.split("/"))
            if not source.is_file():
                raise FileNotFoundError(f"missing traffic sign asset: {source}")
            archive.write(source, arcname=relative)
    return archive_path, len(paths)


def main() -> None:
    if not INPUT.is_file():
        raise FileNotFoundError(f"missing traffic signs dataset: {INPUT}")

    dataset = load_dataset()
    if dataset.get("dataset") != "VN_TRAFFIC_SIGNS" or dataset.get("stage") != "production":
        raise ValueError("traffic-signs.json must be a production VN_TRAFFIC_SIGNS dataset")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    output_dataset = OUTPUT / "traffic-signs.json"
    shutil.copyfile(INPUT, output_dataset)

    asset_paths = referenced_assets(dataset)
    archive_path, file_count = build_assets_zip(asset_paths)

    manifest = {
        "dataset": "VN_TRAFFIC_SIGNS",
        "version": dataset["version"],
        "validFrom": dataset["validFrom"],
        "stage": "production",
        "datasetUrl": "traffic-signs.json",
        "sha256": sha256(output_dataset),
        "sourceDocument": dataset["sourceDocument"],
        "sourceSha256": str(dataset["sourceSha256"]).lower().removeprefix("sha256:"),
        "sizeBytes": output_dataset.stat().st_size,
    }

    if archive_path is not None:
        manifest["assets"] = {
            "url": "traffic-sign-assets.zip",
            "format": "zip",
            "sha256": sha256(archive_path),
            "sizeBytes": archive_path.stat().st_size,
            "fileCount": file_count,
        }

    manifest_path = OUTPUT / "manifest.json"
    with manifest_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"Published traffic signs dataset {dataset['version']}")
    print(f"  {output_dataset}")
    if archive_path:
        print(f"  {archive_path} ({file_count} files)")
    print(f"  {manifest_path}")


if __name__ == "__main__":
    main()
