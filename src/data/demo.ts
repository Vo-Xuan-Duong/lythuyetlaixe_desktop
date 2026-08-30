import type { Category, Question } from "../domain/entities/question";
import type { LearningSummary } from "../domain/entities/progress";

export const demoSummary: LearningSummary = {
  totalQuestions: 600,
  learnedQuestions: 0,
  criticalMastered: 0,
  criticalTotal: 60,
  wrongQuestions: 0,
  bookmarkedQuestions: 0,
};

export const demoCategories: Category[] = [
  { id: 1, code: "GENERAL_RULES", name: "Quy định và quy tắc giao thông", questionCount: 180 },
  { id: 2, code: "CULTURE", name: "Văn hóa, đạo đức và cứu hộ", questionCount: 25 },
  { id: 3, code: "DRIVING_TECHNIQUE", name: "Kỹ thuật lái xe", questionCount: 58 },
  { id: 4, code: "VEHICLE", name: "Cấu tạo và sửa chữa", questionCount: 37 },
  { id: 5, code: "ROAD_SIGNS", name: "Báo hiệu đường bộ", questionCount: 185 },
  { id: 6, code: "SITUATIONS", name: "Sa hình và xử lý tình huống", questionCount: 115 },
];

export const demoQuestion: Question = {
  id: 1,
  categoryCode: "GENERAL_RULES",
  content: "Đây là câu hỏi minh họa để phát triển giao diện. Dataset 600 câu chính thức chưa được import ở phase này.",
  critical: false,
  licenses: ["B", "C1", "C"],
  sourceVersion: "demo",
  answers: [
    { key: "A", content: "Đáp án minh họa A", correct: false },
    { key: "B", content: "Đáp án minh họa B", correct: true },
    { key: "C", content: "Đáp án minh họa C", correct: false },
  ],
  explanation: "Nội dung hiện tại chỉ dùng để kiểm thử UI và luồng chọn/chấm đáp án.",
};
