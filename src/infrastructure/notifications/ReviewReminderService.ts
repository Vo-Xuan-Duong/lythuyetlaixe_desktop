import { isTauri } from "@tauri-apps/api/core";
import {
  cancel,
  isPermissionGranted,
  requestPermission,
  Schedule,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { ReviewReminderPreference } from "../preferences/AppPreferences";

const REVIEW_REMINDER_ID = 600_001;
const REVIEW_REMINDER_TEST_ID = 600_002;

export type ReviewReminderApplyStatus =
  | { state: "scheduled"; nextAt: string }
  | { state: "disabled" }
  | { state: "permission-denied" }
  | { state: "unsupported" };

function nextReminderDate(
  preference: ReviewReminderPreference,
  now = new Date(),
): Date {
  const next = new Date(now);
  next.setHours(preference.hour, preference.minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function notificationPermission(requestIfMissing: boolean): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  if (!requestIfMissing) return false;
  return (await requestPermission()) === "granted";
}

async function cancelReviewReminder(): Promise<void> {
  try {
    await cancel([REVIEW_REMINDER_ID]);
  } catch {
    // Cancellation behavior can vary across Android/plugin versions. Reusing a
    // stable ID minimizes duplicate schedules; failure must not block the app.
  }
}

async function scheduleReviewReminder(
  preference: ReviewReminderPreference,
): Promise<{ state: "scheduled"; nextAt: string }> {
  await cancelReviewReminder();
  const nextAt = nextReminderDate(preference);

  sendNotification({
    id: REVIEW_REMINDER_ID,
    title: "Đến giờ ôn lý thuyết",
    body: "Mở ứng dụng để xem các câu đang đến hạn và những câu còn yếu.",
    autoCancel: true,
    // A study reminder does not justify Android's stricter while-idle alarm
    // behavior. Let the OS schedule normally and verify device behavior locally.
    schedule: Schedule.at(nextAt, true),
  });

  return {
    state: "scheduled",
    nextAt: nextAt.toISOString(),
  };
}

export async function applyReviewReminder(
  preference: ReviewReminderPreference,
): Promise<ReviewReminderApplyStatus> {
  if (!isTauri()) return { state: "unsupported" };

  if (!preference.enabled) {
    await cancelReviewReminder();
    return { state: "disabled" };
  }

  if (!(await notificationPermission(true))) {
    return { state: "permission-denied" };
  }

  return scheduleReviewReminder(preference);
}

/**
 * Re-applies a previously enabled reminder on native startup without opening a
 * permission prompt. Useful after binary upgrade/restart if the platform dropped
 * pending schedules. The explicit Settings action remains responsible for asking
 * for permission.
 */
export async function restoreReviewReminder(
  preference: ReviewReminderPreference,
): Promise<ReviewReminderApplyStatus> {
  if (!isTauri()) return { state: "unsupported" };
  if (!preference.enabled) return { state: "disabled" };
  if (!(await notificationPermission(false))) return { state: "permission-denied" };
  return scheduleReviewReminder(preference);
}

export async function sendReviewReminderTest(): Promise<
  "sent" | "permission-denied" | "unsupported"
> {
  if (!isTauri()) return "unsupported";
  if (!(await notificationPermission(true))) return "permission-denied";

  sendNotification({
    id: REVIEW_REMINDER_TEST_ID,
    title: "Nhắc ôn lý thuyết",
    body: "Thông báo hoạt động. Khi bật lịch nhắc, ứng dụng sẽ nhắc bạn quay lại ôn tập.",
    autoCancel: true,
  });
  return "sent";
}
