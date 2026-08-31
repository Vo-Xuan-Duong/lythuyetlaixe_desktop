import { isTauri } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { LicenseType } from "../../domain/entities/question";

const SETTINGS_FILE = "settings.json";
const DEFAULT_LICENSE_KEY = "lythuyetlaixe.defaultExamLicense";
const REVIEW_REMINDER_KEY = "lythuyetlaixe.reviewReminder";
const FALLBACK_LICENSE: LicenseType = "B";
const store = new LazyStore(SETTINGS_FILE);

export interface ReviewReminderPreference {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_REVIEW_REMINDER: ReviewReminderPreference = {
  enabled: false,
  hour: 19,
  minute: 0,
};

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

function isReviewReminder(value: unknown): value is ReviewReminderPreference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReviewReminderPreference>;
  return (
    typeof candidate.enabled === "boolean" &&
    Number.isInteger(candidate.hour) &&
    Number.isInteger(candidate.minute) &&
    (candidate.hour ?? -1) >= 0 &&
    (candidate.hour ?? 24) <= 23 &&
    (candidate.minute ?? -1) >= 0 &&
    (candidate.minute ?? 60) <= 59
  );
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser/WebView fallback persistence is best-effort.
  }
}

function readLegacyDefaultLicense(): LicenseType | null {
  const value = readLocalStorage(DEFAULT_LICENSE_KEY);
  return isSupportedLicense(value) ? value : null;
}

function readBrowserReminder(): ReviewReminderPreference | null {
  const value = readLocalStorage(REVIEW_REMINDER_KEY);
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isReviewReminder(parsed) ? parsed : null;
  } catch {
    return null;
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
    writeLocalStorage(DEFAULT_LICENSE_KEY, value);
    return;
  }

  try {
    await store.set(DEFAULT_LICENSE_KEY, value);
  } catch {
    writeLocalStorage(DEFAULT_LICENSE_KEY, value);
  }
}

export async function getReviewReminderPreference(): Promise<ReviewReminderPreference> {
  if (!isTauri()) {
    return readBrowserReminder() ?? DEFAULT_REVIEW_REMINDER;
  }

  try {
    const stored = await store.get<unknown>(REVIEW_REMINDER_KEY);
    if (isReviewReminder(stored)) return stored;

    const browserValue = readBrowserReminder();
    if (browserValue) {
      await store.set(REVIEW_REMINDER_KEY, browserValue);
      return browserValue;
    }
  } catch {
    const browserValue = readBrowserReminder();
    if (browserValue) return browserValue;
  }

  return DEFAULT_REVIEW_REMINDER;
}

export async function setReviewReminderPreference(value: ReviewReminderPreference): Promise<void> {
  if (!isReviewReminder(value)) {
    throw new Error("Cấu hình nhắc ôn không hợp lệ.");
  }

  if (!isTauri()) {
    writeLocalStorage(REVIEW_REMINDER_KEY, JSON.stringify(value));
    return;
  }

  try {
    await store.set(REVIEW_REMINDER_KEY, value);
  } catch {
    writeLocalStorage(REVIEW_REMINDER_KEY, JSON.stringify(value));
  }
}
