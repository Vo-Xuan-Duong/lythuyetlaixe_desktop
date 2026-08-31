import { isTauri } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { LicenseType } from "../../domain/entities/question";

const SETTINGS_FILE = "settings.json";
const DEFAULT_LICENSE_KEY = "lythuyetlaixe.defaultExamLicense";
const FALLBACK_LICENSE: LicenseType = "B";
const store = new LazyStore(SETTINGS_FILE);

export const SUPPORTED_EXAM_LICENSE_PREFERENCES: LicenseType[] = [
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
];

const LICENSE_TYPES = new Set<LicenseType>(SUPPORTED_EXAM_LICENSE_PREFERENCES);

function isSupportedLicense(value: unknown): value is LicenseType {
  return typeof value === "string" && LICENSE_TYPES.has(value as LicenseType);
}

function readLegacyDefaultLicense(): LicenseType | null {
  try {
    const value = window.localStorage.getItem(DEFAULT_LICENSE_KEY);
    return isSupportedLicense(value) ? value : null;
  } catch {
    return null;
  }
}

function writeBrowserDefaultLicense(value: LicenseType): void {
  try {
    window.localStorage.setItem(DEFAULT_LICENSE_KEY, value);
  } catch {
    // Browser preview can continue with the in-memory value.
  }
}

export async function getDefaultExamLicense(): Promise<LicenseType> {
  if (!isTauri()) {
    return readLegacyDefaultLicense() ?? FALLBACK_LICENSE;
  }

  try {
    const stored = await store.get<unknown>(DEFAULT_LICENSE_KEY);
    if (isSupportedLicense(stored)) return stored;

    const legacy = readLegacyDefaultLicense();
    if (legacy) {
      await store.set(DEFAULT_LICENSE_KEY, legacy);
      return legacy;
    }
  } catch {
    const legacy = readLegacyDefaultLicense();
    if (legacy) return legacy;
  }

  return FALLBACK_LICENSE;
}

export async function setDefaultExamLicense(value: LicenseType): Promise<void> {
  if (!LICENSE_TYPES.has(value)) return;

  if (!isTauri()) {
    writeBrowserDefaultLicense(value);
    return;
  }

  try {
    await store.set(DEFAULT_LICENSE_KEY, value);
  } catch {
    // Preference persistence is non-critical; preserve a WebView fallback where possible.
    writeBrowserDefaultLicense(value);
  }
}
