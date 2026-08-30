import type { LicenseType, Question } from "./question";

export type ExamCategoryCode =
  | "GENERAL_RULES"
  | "CULTURE"
  | "DRIVING_TECHNIQUE"
  | "VEHICLE"
  | "ROAD_SIGNS"
  | "SITUATIONS";

export interface ExamCategoryQuota {
  categoryCode: ExamCategoryCode;
  count: number;
}

export interface ExamConfig {
  id: string;
  licenseType: LicenseType;
  datasetVersion: string;
  questionCount: number;
  durationSeconds: number;
  passingScore: number;
  criticalQuestionCount: number;
  failOnWrongCriticalQuestion: boolean;
  categoryQuotas: ExamCategoryQuota[];
  validFrom: string;
  validTo?: string;
  sourceReference: string;
}

export interface ExamQuestion {
  question: Question;
  selectedAnswerKey?: string;
}

export interface ExamSession {
  config: ExamConfig;
  questions: ExamQuestion[];
  startedAt: string;
  submittedAt?: string;
}

export interface ExamAnswerResult {
  questionId: number;
  selectedAnswerKey?: string;
  correctAnswerKey: string;
  correct: boolean;
  critical: boolean;
}

export interface ExamResult {
  score: number;
  questionCount: number;
  passingScore: number;
  passed: boolean;
  criticalFailed: boolean;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  answers: ExamAnswerResult[];
}
