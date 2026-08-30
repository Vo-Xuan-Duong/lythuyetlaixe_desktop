from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from promote_dataset import promote, promotion_errors  # noqa: E402


def question(question_id: int) -> dict:
    return {
        "id": question_id,
        "content": f"Câu {question_id}",
        "category": "GENERAL_RULES",
        "critical": False,
        "licenses": ["B"],
        "sourceVersion": "2025.06",
        "needsVerification": False,
        "parserWarnings": [],
        "answers": [
            {"key": "A", "content": "Đúng", "correct": True},
            {"key": "B", "content": "Sai", "correct": False},
        ],
    }


class PromoteDatasetTests(unittest.TestCase):
    def valid_dataset(self) -> dict:
        return {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "validFrom": "2025-06-01",
            "parserWarnings": [],
            "questions": [question(index) for index in range(1, 601)],
        }

    def test_promotes_fully_verified_dataset(self) -> None:
        result = promote(self.valid_dataset())

        self.assertEqual(result["stage"], "production")
        self.assertEqual(result["promotion"]["questionCount"], 600)
        self.assertEqual(result["promotion"]["unresolved"], 0)

    def test_rejects_unresolved_question(self) -> None:
        dataset = self.valid_dataset()
        dataset["questions"][0]["needsVerification"] = True

        errors = promotion_errors(dataset)

        self.assertTrue(any("still needs verification" in error for error in errors))

    def test_rejects_parser_warning(self) -> None:
        dataset = self.valid_dataset()
        dataset["questions"][0]["parserWarnings"] = ["Only 1 answer candidate was parsed"]

        errors = promotion_errors(dataset)

        self.assertTrue(any("parser warnings remain" in error for error in errors))

    def test_rejects_multiple_correct_answers(self) -> None:
        dataset = self.valid_dataset()
        dataset["questions"][0]["answers"][1]["correct"] = True

        errors = promotion_errors(dataset)

        self.assertTrue(any("expected exactly 1 correct answer" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
