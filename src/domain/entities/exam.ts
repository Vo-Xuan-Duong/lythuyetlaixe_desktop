import type { LicenseType } from "./question";

export interface ExamConfig {
  licenseType: LicenseType;
  questionCount: number;
  durationSeconds: number;
  passingScore: number;
  criticalQuestionCount: number;
  failOnWrongCriticalQuestion: boolean;
  validFrom: string;
  validTo?: string;
}

export interface ExamResult {
  score: number;
  questionCount: number;
  passed: boolean;
  criticalFailed: boolean;
}
