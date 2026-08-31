from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from publish import publish  # noqa: E402

VERSION = "2025.01"
SOURCE_DOCUMENT = "QCVN 41:2024/BGTVT"


def sample_dataset(source_sha256: str, image: str | None = None) -> dict:
    return {
        "dataset": "VN_TRAFFIC_SIGNS",
        "version": VERSION,
        "validFrom": "2025-01-01",
        "stage": "production",
        "sourceDocument": SOURCE_DOCUMENT,
        "sourceSha256": source_sha256,
        "signs": [
            {
                "code": "P.TEST",
                "name": "Fixture only",
                "groupCode": "PROHIBITION",
                "meaning": "Test fixture, not production data",
                "recognition": None,
                "scope": None,
                "exceptions": [],
                "notes": None,
                "image": image,
                "keywords": ["fixture"],
                "sourceVersion": SOURCE_DOCUMENT,
            }
        ],
    }


def write_verified_source(root: Path) -> tuple[Path, str]:
    source_dir = root / "source"
    source_dir.mkdir(parents=True)
    source_file = source_dir / "qcvn-full.pdf"
    source_file.write_bytes(b"verified fixture technical source")
    checksum = hashlib.sha256(source_file.read_bytes()).hexdigest()
    manifest_path = source_dir / "source-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "dataset": "VN_TRAFFIC_SIGNS",
                "sourceDocument": SOURCE_DOCUMENT,
                "technicalSource": {
                    "localFile": source_file.name,
                    "sourceSha256": checksum,
                    "verificationStatus": "verified-official-full-source",
                    "verifiedBy": "unit-test",
                    "verifiedAt": "2026-08-31T00:00:00Z",
                },
            }
        ),
        encoding="utf-8",
    )
    return manifest_path, checksum


class TrafficSignsPublishTests(unittest.TestCase):
    def test_publishes_versioned_payload_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_manifest, source_sha = write_verified_source(root)
            source = root / "traffic-signs.json"
            assets_root = root / "assets"
            output = root / "dist"
            image = assets_root / "signs" / "p-test.svg"
            image.parent.mkdir(parents=True)
            image.write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
            source.write_text(json.dumps(sample_dataset(source_sha, "signs/p-test.svg")), encoding="utf-8")

            dataset_path, manifest_path, asset_path = publish(source, assets_root, output, source_manifest)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(dataset_path, output / "releases" / VERSION / "traffic-signs.json")
            self.assertEqual(manifest_path, output / "manifest.json")
            self.assertEqual(asset_path, output / "releases" / VERSION / "traffic-sign-assets.zip")
            self.assertEqual(manifest["datasetUrl"], f"releases/{VERSION}/traffic-signs.json")
            self.assertEqual(manifest["assets"]["url"], f"releases/{VERSION}/traffic-sign-assets.zip")
            self.assertEqual(manifest["signCount"], 1)
            self.assertEqual(manifest["sourceSha256"], source_sha)

            with zipfile.ZipFile(asset_path) as archive:
                self.assertEqual(archive.namelist(), ["signs/p-test.svg"])

    def test_rejects_changed_payload_for_existing_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_manifest, source_sha = write_verified_source(root)
            source = root / "traffic-signs.json"
            output = root / "dist"
            source.write_text(json.dumps(sample_dataset(source_sha)), encoding="utf-8")
            publish(source, root / "assets", output, source_manifest)

            changed = sample_dataset(source_sha)
            changed["signs"][0]["meaning"] = "Changed fixture"
            source.write_text(json.dumps(changed), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "bump traffic-sign dataset version"):
                publish(source, root / "assets", output, source_manifest)

    def test_rejects_unsafe_asset_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_manifest, source_sha = write_verified_source(root)
            source = root / "traffic-signs.json"
            source.write_text(json.dumps(sample_dataset(source_sha, "../escape.svg")), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "unsafe traffic sign asset path"):
                publish(source, root / "assets", root / "dist", source_manifest)

    def test_rejects_unverified_technical_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_manifest, source_sha = write_verified_source(root)
            manifest = json.loads(source_manifest.read_text(encoding="utf-8"))
            manifest["technicalSource"]["verificationStatus"] = "pending"
            source_manifest.write_text(json.dumps(manifest), encoding="utf-8")
            source = root / "traffic-signs.json"
            source.write_text(json.dumps(sample_dataset(source_sha)), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "verified-official-full-source"):
                publish(source, root / "assets", root / "dist", source_manifest)


if __name__ == "__main__":
    unittest.main()
