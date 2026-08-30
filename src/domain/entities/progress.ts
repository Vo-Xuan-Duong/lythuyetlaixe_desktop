export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

export interface QuestionProgress {
  questionId: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  mastery: MasteryLevel;
  lastAnsweredAt?: string;
  nextReviewAt?: string;
}

export interface LearningSummary {
  totalQuestions: number;
  learnedQuestions: number;
  criticalMastered: number;
  criticalTotal: number;
  wrongQuestions: number;
  bookmarkedQuestions: number;
}
