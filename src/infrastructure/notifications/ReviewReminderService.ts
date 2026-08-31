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

async function notificationPermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

async function cancelReviewReminder(): Promise<void> {
  try {
    await cancel([REVIEW_REMINDER_ID]);
  } catch {
    // Some Android plugin versions have cancellation issues. Reusing a stable ID
    // minimizes duplicate schedules; failure here must not block the application.
  }
}

export async function applyReviewReminder(
  preference: ReviewReminderPreference,
): Promise<ReviewReminderApplyStatus> {
  if (!isTauri()) return { state: "unsupported" };

  if (!preference.enabled) {
    await cancelReviewReminder();
    return { state: "disabled" };
  }

  if (!(await notificationPermission())) {
    return { state: "permission-denied" };
  }

  await cancelReviewReminder();
  const nextAt = nextReminderDate(preference);

  sendNotification({
    id: REVIEW_REMINDER_ID,
    title: "Đến giờ ôn lý thuyết",
    body: "Mở ứng dụng để xem các câu đang đến hạn và những câu còn yếu.",
    autoCancel: true,
    schedule: Schedule.at(nextAt, true, true),
  });

  return {
    state: "scheduled",
    nextAt: nextAt.toISOString(),
  };
}

export async function sendReviewReminderTest(): Promise<
  "sent" | "permission-denied" | "unsupported"
> {
  if (!isTauri()) return "unsupported";
  if (!(await notificationPermission())) return "permission-denied";

  sendNotification({
    id: REVIEW_REMINDER_TEST_ID,
    title: "Nhắc ôn lý thuyết",
    body: "Thông báo hoạt động. Khi bật lịch nhắc, ứng dụng sẽ nhắc bạn quay lại ôn tập.",
    autoCancel: true,
  });
  return "sent";
}
