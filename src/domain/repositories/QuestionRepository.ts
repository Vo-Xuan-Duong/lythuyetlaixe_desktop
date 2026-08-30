import type { LicenseType, Question } from "../entities/question";

export interface QuestionRepository {
  count(): Promise<number>;
  getById(id: number): Promise<Question | null>;
  listByCategory(categoryCode: string): Promise<Question[]>;
  listCritical(): Promise<Question[]>;
  listForLicense(licenseType: LicenseType): Promise<Question[]>;
}
