import type { LicenseType } from "../../domain/entities/question";

const DEFAULT_LICENSE_KEY = "lythuyetlaixe.defaultExamLicense";
const FALLBACK_LICENSE: LicenseType = "B";

const LICENSE_TYPES = new Set<LicenseType>([
  "A1",
  "A",
  "B1",
  "B",
  "C1",
  "C",
  "D1",
  "D2",
  "D",
  "BE",
  "C1E",
  "CE",
  "D1E",
  "D2E",
  "DE",
]);

export function getDefaultExamLicense(): LicenseType {
  try {
    const value = window.localStorage.getItem(DEFAULT_LICENSE_KEY) as LicenseType | null;
    return value && LICENSE_TYPES.has(value) ? value : FALLBACK_LICENSE;
  } catch {
    return FALLBACK_LICENSE;
  }
}

export function setDefaultExamLicense(value: LicenseType): void {
  if (!LICENSE_TYPES.has(value)) return;
  try {
    window.localStorage.setItem(DEFAULT_LICENSE_KEY, value);
  } catch {
    // Preference persistence is non-critical; the app can keep using the in-memory value.
  }
}
