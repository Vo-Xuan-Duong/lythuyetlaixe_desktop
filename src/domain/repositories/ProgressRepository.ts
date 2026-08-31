import type { QuestionProgress } from "../entities/progress";

export interface ProgressAnswerRecord {
  questionId: number;
  correct: boolean;
}

export interface ProgressRepository {
  get(questionId: number): Promise<QuestionProgress | null>;
  save(progress: QuestionProgress): Promise<void>;
  recordAnswers(records: ProgressAnswerRecord[], answeredAt?: Date): Promise<void>;
  listWeak(limit?: number): Promise<QuestionProgress[]>;
  isBookmarked(questionId: number): Promise<boolean>;
  addBookmark(questionId: number): Promise<void>;
  removeBookmark(questionId: number): Promise<void>;
  listBookmarkIds(): Promise<number[]>;
}
