from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from apply_answer_review import apply_reviews  # noqa: E402


class ApplyAnswerReviewTests(unittest.TestCase):
    def source_dataset(self):
        return {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "questions": [
                {
                    "id": 1,
                    "sourcePage": 1,
                    "needsVerification": True,
                    "answerResolution": {
                        "method": "underline-geometry",
                        "selected": None,
                        "confidence": 0.02,
                    },
                    "answers": [
                        {"key": "A", "content": "Một", "correct": None},
                        {"key": "B", "content": "Hai", "correct": None},
                    ],
                }
            ],
        }

    def test_applies_review_and_records_provenance(self) -> None:
        review = {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "reviewVersion": "1",
            "answers": [
                {
                    "questionId": 1,
                    "answerKey": "B",
                    "sourcePage": 1,
                    "reviewer": "tester",
                    "verifiedAt": "2026-08-30",
                    "note": "checked source",
                }
            ],
        }

        result = apply_reviews(self.source_dataset(), review)
        question = result["questions"][0]

        self.assertEqual([answer["correct"] for answer in question["answers"]], [False, True])
        self.assertFalse(question["needsVerification"])
        self.assertEqual(question["answerResolution"]["method"], "manual-source-review")
        self.assertEqual(question["answerResolution"]["reviewer"], "tester")
        self.assertEqual(result["stage"], "reviewed")

    def test_rejects_dataset_version_mismatch(self) -> None:
        review = {
            "dataset": "VN_GPLX_600",
            "version": "different",
            "answers": [],
        }
        with self.assertRaises(ValueError):
            apply_reviews(self.source_dataset(), review)

    def test_rejects_conflicting_geometry_without_override(self) -> None:
        dataset = self.source_dataset()
        dataset["questions"][0]["answerResolution"]["selected"] = "A"
        dataset["questions"][0]["needsVerification"] = False
        review = {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "answers": [{"questionId": 1, "answerKey": "B"}],
        }

        with self.assertRaises(ValueError):
            apply_reviews(dataset, review)

    def test_allows_explicit_conflict_override(self) -> None:
        dataset = self.source_dataset()
        dataset["questions"][0]["answerResolution"]["selected"] = "A"
        dataset["questions"][0]["needsVerification"] = False
        review = {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "answers": [{"questionId": 1, "answerKey": "B", "note": "source recheck"}],
        }

        result = apply_reviews(dataset, review, allow_overwrite=True)
        self.assertEqual(result["questions"][0]["answerResolution"]["selected"], "B")


if __name__ == "__main__":
    unittest.main()
