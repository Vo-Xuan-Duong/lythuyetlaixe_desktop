import type { QuestionProgress } from "../entities/progress";

export interface ProgressRepository {
  get(questionId: number): Promise<QuestionProgress | null>;
  save(progress: QuestionProgress): Promise<void>;
  listWeak(limit?: number): Promise<QuestionProgress[]>;
  addBookmark(questionId: number): Promise<void>;
  removeBookmark(questionId: number): Promise<void>;
  listBookmarkIds(): Promise<number[]>;
}
