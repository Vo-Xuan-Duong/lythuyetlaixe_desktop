from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from publish_dataset import publish  # noqa: E402

SOURCE_SHA256 = "c" * 64


def question(question_id: int, image: str | None = None) -> dict:
    return {
        "id": question_id,
        "content": f"Câu {question_id}",
        "category": "GENERAL_RULES",
        "critical": False,
        "licenses": ["B"],
        "sourceVersion": "2025.06",
        "image": image,
        "answers": [
            {"key": "A", "content": "Đúng", "correct": True},
            {"key": "B", "content": "Sai", "correct": False},
        ],
    }


def dataset(questions: list[dict]) -> dict:
    return {
        "dataset": "VN_GPLX_600",
        "version": "2025.06",
        "validFrom": "2025-06-01",
        "stage": "production",
        "sourceSha256": SOURCE_SHA256,
        "questions": questions,
    }


class PublishDatasetTests(unittest.TestCase):
    def test_builds_manifest_and_zip_for_referenced_images(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "questions.json"
            assets_root = root / "assets"
            output_dir = root / "dist"
            image_path = assets_root / "images" / "q301.webp"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"image-bytes")

            payload = dataset([
                question(index, "images/q301.webp" if index == 301 else None)
                for index in range(1, 601)
            ])
            source.write_text(json.dumps(payload), encoding="utf-8")

            dataset_path, manifest_path, asset_path = publish(source, assets_root, output_dir)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            published_dataset = json.loads(dataset_path.read_text(encoding="utf-8"))

            self.assertIsNotNone(asset_path)
            self.assertEqual(manifest["sourceSha256"], SOURCE_SHA256)
            self.assertEqual(published_dataset["sourceSha256"], SOURCE_SHA256)
            self.assertEqual(manifest["assets"]["url"], "assets.zip")
            self.assertEqual(manifest["assets"]["format"], "zip")
            self.assertEqual(manifest["assets"]["fileCount"], 1)
            self.assertEqual(len(manifest["assets"]["sha256"]), 64)

            with zipfile.ZipFile(asset_path) as archive:
                self.assertEqual(archive.namelist(), ["images/q301.webp"])
                self.assertEqual(archive.read("images/q301.webp"), b"image-bytes")

    def test_rejects_missing_referenced_image(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "questions.json"
            payload = dataset([
                question(index, "images/missing.webp" if index == 301 else None)
                for index in range(1, 601)
            ])
            source.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "missing referenced image"):
                publish(source, root / "assets", root / "dist")

    def test_rejects_missing_source_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "questions.json"
            payload = dataset([question(index) for index in range(1, 601)])
            payload.pop("sourceSha256")
            source.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "sourceSha256"):
                publish(source, root / "assets", root / "dist")


if __name__ == "__main__":
    unittest.main()
