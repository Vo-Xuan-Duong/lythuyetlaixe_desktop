from __future__ import annotations

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
SOURCE_SHA256 = "a" * 64


def sample_dataset(image: str | None = None) -> dict:
    return {
        "dataset": "VN_TRAFFIC_SIGNS",
        "version": VERSION,
        "validFrom": "2025-01-01",
        "stage": "production",
        "sourceDocument": "QCVN 41:2024/BGTVT",
        "sourceSha256": SOURCE_SHA256,
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
                "sourceVersion": "QCVN 41:2024/BGTVT",
            }
        ],
    }


class TrafficSignsPublishTests(unittest.TestCase):
    def test_publishes_versioned_payload_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "traffic-signs.json"
            assets_root = root / "assets"
            output = root / "dist"
            image = assets_root / "signs" / "p-test.svg"
            image.parent.mkdir(parents=True)
            image.write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
            source.write_text(json.dumps(sample_dataset("signs/p-test.svg")), encoding="utf-8")

            dataset_path, manifest_path, asset_path = publish(source, assets_root, output)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(dataset_path, output / "releases" / VERSION / "traffic-signs.json")
            self.assertEqual(manifest_path, output / "manifest.json")
            self.assertEqual(asset_path, output / "releases" / VERSION / "traffic-sign-assets.zip")
            self.assertEqual(manifest["datasetUrl"], f"releases/{VERSION}/traffic-signs.json")
            self.assertEqual(manifest["assets"]["url"], f"releases/{VERSION}/traffic-sign-assets.zip")
            self.assertEqual(manifest["signCount"], 1)
            self.assertEqual(manifest["sourceSha256"], SOURCE_SHA256)

            with zipfile.ZipFile(asset_path) as archive:
                self.assertEqual(archive.namelist(), ["signs/p-test.svg"])

    def test_rejects_changed_payload_for_existing_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "traffic-signs.json"
            output = root / "dist"
            source.write_text(json.dumps(sample_dataset()), encoding="utf-8")
            publish(source, root / "assets", output)

            changed = sample_dataset()
            changed["signs"][0]["meaning"] = "Changed fixture"
            source.write_text(json.dumps(changed), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "bump traffic-sign dataset version"):
                publish(source, root / "assets", output)

    def test_rejects_unsafe_asset_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "traffic-signs.json"
            source.write_text(json.dumps(sample_dataset("../escape.svg")), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "unsafe traffic sign asset path"):
                publish(source, root / "assets", root / "dist")


if __name__ == "__main__":
    unittest.main()
