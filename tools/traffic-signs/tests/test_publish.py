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
from source_provenance import canonical_bundle_sha256  # noqa: E402

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
                "code": "S.H,3",
                "name": "Fixture only",
                "groupCode": "SUPPLEMENTARY",
                "meaning": "Test fixture, not production data",
                "recognition": None,
                "scope": None,
                "exceptions": [],
                "notes": None,
                "image": image,
                "imageVerified": True if image else False,
                "keywords": ["fixture"],
                "sourceVersion": SOURCE_DOCUMENT,
            }
        ],
    }


def write_verified_source(root: Path) -> tuple[Path, str]:
    source_dir = root / "source"
    source_dir.mkdir(parents=True)
    parts: list[dict] = []
    for index, issue in enumerate(("1359+1360", "1361+1362", "1363+1364"), start=1):
        filename = f"part-{index:02d}.pdf"
        source_file = source_dir / filename
        source_file.write_bytes(f"verified fixture source part {index}".encode("utf-8"))
        checksum = hashlib.sha256(source_file.read_bytes()).hexdigest()
        parts.append(
            {
                "issue": issue,
                "localFile": filename,
                "sourceSha256": checksum,
            }
        )

    combined = source_dir / "qcvn-full.pdf"
    combined.write_bytes(b"combined fixture source")
    combined_sha = hashlib.sha256(combined.read_bytes()).hexdigest()
    bundle_sha = canonical_bundle_sha256(parts)
    manifest_path = source_dir / "source-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "dataset": "VN_TRAFFIC_SIGNS",
                "sourceDocument": SOURCE_DOCUMENT,
                "technicalSource": {
                    "acquisitionMethod": "official-gazette-multipart",
                    "localFile": combined.name,
                    "combinedSha256": combined_sha,
                    "sourceSha256": bundle_sha,
                    "verificationStatus": "verified-official-full-source",
                    "verifiedBy": "unit-test",
                    "verifiedAt": "2026-08-31T00:00:00Z",
                    "parts": parts,
                },
            }
        ),
        encoding="utf-8",
    )
    return manifest_path, bundle_sha


class TrafficSignsPublishTests(unittest.TestCase):
    def test_publishes_versioned_payload_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_manifest, source_sha = write_verified_source(root)
            source = root / "traffic-signs.json"
            assets_root = root / "assets"
            output = root / "dist"
            image = assets_root / "signs" / "s-h-3.svg"
            image.parent.mkdir(parents=True)
            image.write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
            source.write_text(json.dumps(sample_dataset(source_sha, "signs/s-h-3.svg")), encoding="utf-8")

            dataset_path, manifest_path, asset_path = publish(source, assets_root, output, source_manifest)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(dataset_path, output / "releases" / VERSION / "traffic-signs.json")
            self.assertEqual(manifest_path, output / "manifest.json")
            self.assertEqual(asset_path, output / "releases" / VERSION / "traffic-sign-assets.zip")
            self.assertEqual(manifest["datasetUrl"], f"releases/{VERSION}/traffic-signs.json")
            self.assertEqual(manifest["assets"]["url"], f"releases/{VERSION}/traffic-sign-assets.zip")
            self.assertEqual(manifest["signCount"], 1)
            self.assertEqual(manifest["sourceSha256"], source_sha)
            self.assertEqual(manifest["sourcePartCount"], 3)

            with zipfile.ZipFile(asset_path) as archive:
                self.assertEqual(archive.namelist(), ["signs/s-h-3.svg"])

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

    def test_rejects_modified_official_part(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_manifest, source_sha = write_verified_source(root)
            manifest = json.loads(source_manifest.read_text(encoding="utf-8"))
            source_dir = source_manifest.parent
            (source_dir / manifest["technicalSource"]["parts"][1]["localFile"]).write_bytes(b"tampered")
            source = root / "traffic-signs.json"
            source.write_text(json.dumps(sample_dataset(source_sha)), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "part SHA-256 mismatch"):
                publish(source, root / "assets", root / "dist", source_manifest)


if __name__ == "__main__":
    unittest.main()
