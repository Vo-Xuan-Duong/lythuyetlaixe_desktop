import type { MasteryLevel } from "./progress";

export type LearningQuestionFilter =
  | "all"
  | "unlearned"
  | "learned"
  | "wrong"
  | "bookmarked";

export interface LearningCatalogQuery {
  categoryCode?: string;
  filter?: LearningQuestionFilter;
  criticalOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface LearningQuestionSummary {
  id: number;
  categoryCode: string;
  content: string;
  critical: boolean;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  mastery: MasteryLevel;
  bookmarked: boolean;
}

export interface LearningCategorySummary {
  id: number;
  code: string;
  name: string;
  questionCount: number;
  learnedCount: number;
  wrongCount: number;
  masteredCount: number;
}

export interface LearningCatalogResult {
  items: LearningQuestionSummary[];
  total: number;
}
