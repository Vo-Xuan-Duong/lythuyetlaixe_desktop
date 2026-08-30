import type { LicenseType } from "../entities/question";
import type { ExamCategoryQuota, ExamConfig } from "../entities/exam";

const CURRENT_DATASET_VERSION = "2025.06";
const CURRENT_VALID_FROM = "2025-06-01";
const CURRENT_VALID_TO = "2027-02-28";
const SOURCE_REFERENCE = "2262/CSGT-P5 (07/05/2025) + transition under 108/2026/TT-BCA";

const quotas = (
  general: number,
  culture: number,
  technique: number,
  vehicle: number,
  signs: number,
  situations: number,
): ExamCategoryQuota[] => [
  { categoryCode: "GENERAL_RULES", count: general },
  { categoryCode: "CULTURE", count: culture },
  { categoryCode: "DRIVING_TECHNIQUE", count: technique },
  { categoryCode: "VEHICLE", count: vehicle },
  { categoryCode: "ROAD_SIGNS", count: signs },
  { categoryCode: "SITUATIONS", count: situations },
];

function config(
  licenseType: LicenseType,
  questionCount: number,
  durationMinutes: number,
  passingScore: number,
  categoryQuotas: ExamCategoryQuota[],
): ExamConfig {
  return {
    id: `${licenseType.toLowerCase()}-${CURRENT_DATASET_VERSION}-legacy-600`,
    licenseType,
    datasetVersion: CURRENT_DATASET_VERSION,
    questionCount,
    durationSeconds: durationMinutes * 60,
    passingScore,
    criticalQuestionCount: 1,
    failOnWrongCriticalQuestion: true,
    categoryQuotas,
    validFrom: CURRENT_VALID_FROM,
    validTo: CURRENT_VALID_TO,
    sourceReference: SOURCE_REFERENCE,
  };
}

const B_CONFIG = config("B", 30, 20, 27, quotas(8, 1, 1, 1, 9, 9));
const C1_CONFIG = config("C1", 35, 22, 32, quotas(10, 1, 2, 1, 10, 10));
const C_CONFIG = config("C", 40, 24, 36, quotas(10, 1, 2, 1, 14, 11));
const HEAVY_CONFIG_QUOTAS = quotas(10, 1, 2, 1, 16, 14);

const HEAVY_LICENSES: LicenseType[] = ["D1", "D2", "D", "BE", "C1E", "CE", "D1E", "D2E", "DE"];

export const EXAM_CONFIGS: ExamConfig[] = [
  B_CONFIG,
  C1_CONFIG,
  C_CONFIG,
  ...HEAVY_LICENSES.map((licenseType) => config(licenseType, 45, 26, 41, HEAVY_CONFIG_QUOTAS)),
];

function toDateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function resolveExamConfig(
  licenseType: LicenseType,
  at: Date | string = new Date(),
  configs: ExamConfig[] = EXAM_CONFIGS,
): ExamConfig | null {
  const date = toDateOnly(at);

  return (
    configs.find(
      (item) =>
        item.licenseType === licenseType &&
        date >= item.validFrom &&
        (!item.validTo || date <= item.validTo),
    ) ?? null
  );
}

export function validateExamConfig(config: ExamConfig): void {
  if (config.questionCount <= 0) throw new Error("questionCount must be positive");
  if (config.durationSeconds <= 0) throw new Error("durationSeconds must be positive");
  if (config.passingScore <= 0 || config.passingScore > config.questionCount) {
    throw new Error("passingScore must be between 1 and questionCount");
  }
  if (config.criticalQuestionCount < 0 || config.criticalQuestionCount > config.questionCount) {
    throw new Error("criticalQuestionCount is invalid");
  }

  const quotaTotal = config.categoryQuotas.reduce((sum, quota) => sum + quota.count, 0);
  if (quotaTotal + config.criticalQuestionCount !== config.questionCount) {
    throw new Error(
      `Exam config ${config.id} selects ${quotaTotal + config.criticalQuestionCount} questions, expected ${config.questionCount}`,
    );
  }

  const seen = new Set<string>();
  for (const quota of config.categoryQuotas) {
    if (quota.count < 0) throw new Error(`Negative quota for ${quota.categoryCode}`);
    if (seen.has(quota.categoryCode)) throw new Error(`Duplicate quota ${quota.categoryCode}`);
    seen.add(quota.categoryCode);
  }
}

for (const item of EXAM_CONFIGS) validateExamConfig(item);
