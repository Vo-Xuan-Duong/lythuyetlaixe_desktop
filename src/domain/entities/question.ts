export type LicenseType =
  | "A1"
  | "A"
  | "B1"
  | "B"
  | "C1"
  | "C"
  | "D1"
  | "D2"
  | "D"
  | "BE"
  | "C1E"
  | "CE"
  | "D1E"
  | "D2E"
  | "DE";

export interface Answer {
  key: string;
  content: string;
  correct: boolean;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  questionCount: number;
}

export interface Question {
  id: number;
  categoryCode: string;
  content: string;
  imagePath?: string;
  critical: boolean;
  licenses: LicenseType[];
  answers: Answer[];
  explanation?: string;
  sourceVersion: string;
}
