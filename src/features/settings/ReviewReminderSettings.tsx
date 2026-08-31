import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REVIEW_REMINDER,
  getReviewReminderPreference,
  setReviewReminderPreference,
  type ReviewReminderPreference,
} from "../../infrastructure/preferences/AppPreferences";
import {
  applyReviewReminder,
  sendReviewReminderTest,
} from "../../infrastructure/notifications/ReviewReminderService";

function formatTime(preference: ReviewReminderPreference): string {
  return `${String(preference.hour).padStart(2, "0")}:${String(preference.minute).padStart(2, "0")}`;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatNextAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ReviewReminderSettings() {
  const [preference, setPreference] = useState<ReviewReminderPreference>(DEFAULT_REVIEW_REMINDER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getReviewReminderPreference()
      .then((value) => {
        if (active) setPreference(value);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const timeValue = useMemo(() => formatTime(preference), [preference]);

  const save = async () => {
    setSaving(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await setReviewReminderPreference(preference);
      const result = await applyReviewReminder(preference);
      if (result.state === "scheduled") {
        setMessage(`Đã lên lịch nhắc ôn. Lần gần nhất: ${formatNextAt(result.nextAt)}.`);
      } else if (result.state === "disabled") {
        setMessage("Đã tắt lịch nhắc ôn trên thiết bị này.");
      } else if (result.state === "permission-denied") {
        setMessage("Đã lưu cấu hình nhưng hệ điều hành chưa cấp quyền thông báo.");
      } else {
        setMessage("Đã lưu cấu hình. Browser preview không tạo thông báo native.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSaving(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const result = await sendReviewReminderTest();
      if (result === "sent") setMessage("Đã gửi thông báo thử.");
      if (result === "permission-denied") setMessage("Hệ điều hành chưa cấp quyền thông báo.");
      if (result === "unsupported") setMessage("Browser preview không hỗ trợ thông báo native.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <span className="eyebrow">Review reminder</span>
          <h2>Nhắc ôn tập hằng ngày</h2>
        </div>
      </div>

      {error && <div className="data-warning" role="status">{error}</div>}
      {message && <div className="settings-success" role="status">{message}</div>}

      <div className="settings-reminder-grid" aria-busy={loading || saving}>
        <label className="settings-toggle-row">
          <div>
            <strong>Bật nhắc ôn</strong>
            <span>Thông báo native được lên lịch trên thiết bị; dữ liệu học vẫn hoàn toàn offline.</span>
          </div>
          <input
            type="checkbox"
            checked={preference.enabled}
            disabled={loading || saving}
            onChange={(event) => setPreference((current) => ({ ...current, enabled: event.target.checked }))}
          />
        </label>

        <label className="settings-time-row">
          <div>
            <strong>Giờ nhắc</strong>
            <span>Áp dụng theo giờ local của thiết bị.</span>
          </div>
          <input
            type="time"
            value={timeValue}
            disabled={loading || saving || !preference.enabled}
            onChange={(event) => {
              const parsed = parseTime(event.target.value);
              if (!parsed) return;
              setPreference((current) => ({ ...current, ...parsed }));
            }}
          />
        </label>

        <div className="settings-reminder-actions">
          <button className="primary-button" type="button" disabled={loading || saving} onClick={() => void save()}>
            {saving ? "Đang lưu..." : "Lưu lịch nhắc"}
          </button>
          <button className="secondary-button" type="button" disabled={loading || saving} onClick={() => void sendTest()}>
            Gửi thử thông báo
          </button>
        </div>
      </div>

      <p className="settings-reminder-note">
        Scheduling notification trên Android cần kiểm tra thực tế trên thiết bị trước release. Nếu plugin/hệ điều hành từ chối schedule, ứng dụng vẫn hoạt động bình thường và không ảnh hưởng SQLite/dataset.
      </p>
    </section>
  );
}
