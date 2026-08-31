import type { MasteryLevel } from "./progress";
import type { LicenseType } from "./question";

export type ReviewQueueMode = "due" | "weak" | "wrong";

export interface ReviewQueueItem {
  questionId: number;
  content: string;
  categoryCode: string;
  categoryName: string;
  critical: boolean;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  mastery: MasteryLevel;
  nextReviewAt?: string;
  bookmarked: boolean;
}

export interface LearningOverviewStatistics {
  totalQuestions: number;
  learnedQuestions: number;
  masteredQuestions: number;
  dueQuestions: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  accuracyPercent: number;
}

export interface CategoryStatistics {
  code: string;
  name: string;
  questionCount: number;
  learnedQuestions: number;
  masteredQuestions: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  accuracyPercent: number;
}

export interface CriticalStatistics {
  questionCount: number;
  learnedQuestions: number;
  masteredQuestions: number;
  wrongQuestions: number;
}

export interface ExamStatistics {
  totalExams: number;
  passedExams: number;
  failedExams: number;
  passRatePercent: number;
  averageScorePercent: number;
}

export interface RecentExamStatistics {
  id: number;
  licenseType: LicenseType;
  questionCount: number;
  score?: number;
  passed?: boolean;
  criticalFailed: boolean;
  completedAt?: string;
}

export interface StatisticsSnapshot {
  learning: LearningOverviewStatistics;
  categories: CategoryStatistics[];
  critical: CriticalStatistics;
  exams: ExamStatistics;
  recentExams: RecentExamStatistics[];
  weakestQuestions: ReviewQueueItem[];
}
