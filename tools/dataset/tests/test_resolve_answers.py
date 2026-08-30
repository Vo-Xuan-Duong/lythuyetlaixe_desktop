from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from resolve_answers import (  # noqa: E402
    Segment,
    TextLine,
    answer_line_groups,
    choose_answer,
    line_overlap,
    resolve_dataset,
)


class ResolveAnswersTests(unittest.TestCase):
    def test_answer_line_groups_splits_numbered_answers(self) -> None:
        lines = [
            TextLine(1, 0, "Câu 1: Nội dung", (10, 10, 100, 20), 18),
            TextLine(1, 1, "1. Đáp án thứ nhất", (10, 30, 120, 40), 38),
            TextLine(1, 2, "dòng tiếp theo", (20, 42, 110, 52), 50),
            TextLine(1, 3, "2. Đáp án thứ hai", (10, 60, 120, 70), 68),
        ]

        groups = answer_line_groups(lines)

        self.assertEqual([line.text for line in groups["A"]], ["1. Đáp án thứ nhất", "dòng tiếp theo"])
        self.assertEqual([line.text for line in groups["B"]], ["2. Đáp án thứ hai"])

    def test_line_overlap_accepts_underline_below_baseline(self) -> None:
        line = TextLine(1, 0, "1. Đáp án", (10, 10, 110, 24), 20)
        underline = Segment(1, 15, 21.5, 95, 21.5)

        self.assertGreater(line_overlap(line, underline), 0)

    def test_line_overlap_rejects_rule_far_from_text(self) -> None:
        line = TextLine(1, 0, "1. Đáp án", (10, 10, 110, 24), 20)
        far_rule = Segment(1, 10, 35, 110, 35)

        self.assertEqual(line_overlap(line, far_rule), 0)

    def test_choose_answer_requires_margin(self) -> None:
        selected, _, reason = choose_answer({"A": 0.40, "B": 0.38, "C": 0.01})

        self.assertIsNone(selected)
        self.assertEqual(reason, "ambiguous-underline-score")

    def test_choose_answer_resolves_clear_winner(self) -> None:
        selected, confidence, reason = choose_answer({"A": 0.03, "B": 0.55, "C": 0.01})

        self.assertEqual(selected, "B")
        self.assertEqual(confidence, 0.55)
        self.assertEqual(reason, "resolved")

    def test_resolve_dataset_marks_only_selected_answer_correct(self) -> None:
        extracted = {
            "pages": [
                {
                    "page": 1,
                    "spans": [
                        {"block": 0, "line": 0, "span": 0, "text": "Câu 1: Nội dung", "bbox": [10, 10, 130, 24], "origin": [10, 20]},
                        {"block": 0, "line": 1, "span": 0, "text": "1. Sai", "bbox": [10, 30, 100, 44], "origin": [10, 40]},
                        {"block": 0, "line": 2, "span": 0, "text": "2. Đúng", "bbox": [10, 50, 110, 64], "origin": [10, 60]},
                        {"block": 0, "line": 3, "span": 0, "text": "3. Sai", "bbox": [10, 70, 100, 84], "origin": [10, 80]},
                        {"block": 0, "line": 4, "span": 0, "text": "Câu 2: Kế tiếp", "bbox": [10, 100, 130, 114], "origin": [10, 110]},
                    ],
                    "drawings": [
                        {"width": 1, "items": [["l", [12, 61.5], [100, 61.5]]]},
                    ],
                }
            ]
        }
        dataset = {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "questions": [
                {
                    "id": 1,
                    "sourcePage": 1,
                    "answers": [
                        {"key": "A", "content": "Sai", "correct": None},
                        {"key": "B", "content": "Đúng", "correct": None},
                        {"key": "C", "content": "Sai", "correct": None},
                    ],
                }
            ],
        }

        resolved, review = resolve_dataset(extracted, dataset)
        question = resolved["questions"][0]

        self.assertFalse(question["needsVerification"])
        self.assertEqual(question["answerResolution"]["selected"], "B")
        self.assertEqual([answer["correct"] for answer in question["answers"]], [False, True, False])
        self.assertEqual(review["unresolvedCount"], 0)

    def test_resolve_dataset_keeps_ambiguous_question_for_review(self) -> None:
        extracted = {
            "pages": [
                {
                    "page": 1,
                    "spans": [
                        {"block": 0, "line": 0, "span": 0, "text": "Câu 1: Nội dung", "bbox": [10, 10, 130, 24], "origin": [10, 20]},
                        {"block": 0, "line": 1, "span": 0, "text": "1. Một", "bbox": [10, 30, 110, 44], "origin": [10, 40]},
                        {"block": 0, "line": 2, "span": 0, "text": "2. Hai", "bbox": [10, 50, 110, 64], "origin": [10, 60]},
                    ],
                    "drawings": [],
                }
            ]
        }
        dataset = {
            "dataset": "VN_GPLX_600",
            "version": "2025.06",
            "questions": [
                {
                    "id": 1,
                    "sourcePage": 1,
                    "answers": [
                        {"key": "A", "content": "Một", "correct": None},
                        {"key": "B", "content": "Hai", "correct": None},
                    ],
                }
            ],
        }

        resolved, review = resolve_dataset(extracted, dataset)
        question = resolved["questions"][0]

        self.assertTrue(question["needsVerification"])
        self.assertIsNone(question["answerResolution"]["selected"])
        self.assertEqual(review["unresolvedCount"], 1)
        self.assertTrue(all(answer["correct"] is None for answer in question["answers"]))


if __name__ == "__main__":
    unittest.main()
