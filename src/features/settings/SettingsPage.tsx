import { useEffect, useState } from "react";
import type { LicenseType } from "../../domain/entities/question";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import {
  getDefaultExamLicense,
  setDefaultExamLicense,
  SUPPORTED_EXAM_LICENSE_PREFERENCES,
} from "../../infrastructure/preferences/AppPreferences";
import {
  SqliteSettingsRepository,
  type LocalApplicationInfo,
} from "../../infrastructure/repositories/SqliteSettingsRepository";
import {
  getAppRuntimeInfo,
  type AppRuntimeInfo,
} from "../../infrastructure/runtime/AppRuntime";

interface SettingsPageProps {
  datasetStatus: DatasetBootstrapStatus;
  onCheckDataset: () => void;
}

type ResetTarget = "progress" | "bookmarks" | "exams" | "all";

const repository = new SqliteSettingsRepository();

function formatDate(value: string | null): string {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortHash(value: string | null): string {
  if (!value) return "Chưa có";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function SettingsPage({ datasetStatus, onCheckDataset }: SettingsPageProps) {
  const [info, setInfo] = useState<LocalApplicationInfo>();
  const [runtime, setRuntime] = useState<AppRuntimeInfo>();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState<ResetTarget>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultLicense, setDefaultLicense] = useState<LicenseType>("B");
  const [preferenceLoading, setPreferenceLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([getAppRuntimeInfo(), getDefaultExamLicense()])
      .then(([runtimeInfo, license]) => {
        if (!active) return;
        setRuntime(runtimeInfo);
        setDefaultLicense(license);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setPreferenceLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (datasetStatus.state !== "ready") {
      setInfo(undefined);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);
    void repository
      .getLocalInfo()
      .then((result) => {
        if (active) setInfo(result);
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
  }, [datasetStatus, refreshKey]);

  const canMutateLocalData = datasetStatus.state === "ready" && resetting === undefined;

  const changeDefaultLicense = async (value: LicenseType) => {
    setDefaultLicense(value);
    setMessage(undefined);
    setError(undefined);
    try {
      await setDefaultExamLicense(value);
      setMessage(`Đã đặt hạng ${value} làm mặc định cho Thi thử.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const reset = async (target: ResetTarget) => {
    if (datasetStatus.state !== "ready") return;

    const labels: Record<ResetTarget, string> = {
      progress: "toàn bộ tiến độ học và lịch ôn",
      bookmarks: "toàn bộ câu đã đánh dấu",
      exams: "toàn bộ lịch sử thi",
      all: "toàn bộ tiến độ, bookmark và lịch sử thi",
    };
    if (!window.confirm(`Xóa ${labels[target]} trên thiết bị này? Bộ 600 câu đã tải sẽ được giữ nguyên.`)) {
      return;
    }

    setResetting(target);
    setMessage(undefined);
    setError(undefined);
    try {
      if (target === "progress") await repository.resetLearningProgress();
      if (target === "bookmarks") await repository.resetBookmarks();
      if (target === "exams") await repository.resetExamHistory();
      if (target === "all") await repository.resetAllUserData();
      setMessage("Đã cập nhật dữ liệu local.");
      setRefreshKey((value) => value + 1);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setResetting(undefined);
    }
  };

  return (
    <div className="page settings-page">
      <div className="section-heading settings-heading">
        <div>
          <span className="eyebrow">Application</span>
          <h1>Cài đặt</h1>
          <p>Quản lý phiên bản ứng dụng, dataset local, tùy chọn thi và dữ liệu học trên thiết bị.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={loading || resetting !== undefined}
          onClick={onCheckDataset}
        >
          Kiểm tra cập nhật dữ liệu
        </button>
      </div>

      {error && <div className="data-warning" role="status">{error}</div>}
      {message && <div className="settings-success" role="status">{message}</div>}

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <span className="eyebrow">Runtime</span>
            <h2>Phiên bản ứng dụng</h2>
          </div>
          <span className={`settings-status ${runtime?.native ? "ready" : "pending"}`}>
            {runtime?.native ? "Tauri native" : "Browser preview"}
          </span>
        </div>
        <div className="settings-info-grid">
          <article><span>Ứng dụng</span><strong>{runtime?.name ?? "Đang đọc..."}</strong></article>
          <article><span>App version</span><strong>{runtime?.version ?? "—"}</strong></article>
          <article><span>Tauri version</span><strong>{runtime?.tauriVersion ?? "—"}</strong></article>
          <article><span>Identifier</span><strong>{runtime?.identifier ?? "—"}</strong></article>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <span className="eyebrow">Dataset local</span>
            <h2>Bộ dữ liệu đang sử dụng</h2>
          </div>
          <span className={`settings-status ${datasetStatus.state === "ready" ? "ready" : "pending"}`}>
            {datasetStatus.state === "ready" ? `v${datasetStatus.version}` : "Chưa sẵn sàng"}
          </span>
        </div>

        <div className="settings-info-grid" aria-busy={loading}>
          <article><span>Dataset</span><strong>{info?.dataset ?? "VN_GPLX_600"}</strong></article>
          <article><span>Phiên bản</span><strong>{info?.datasetVersion ?? "—"}</strong></article>
          <article><span>Ngày hiệu lực</span><strong>{info?.validFrom ?? "—"}</strong></article>
          <article><span>Số câu local</span><strong>{info?.questionCount ?? 0}/600</strong></article>
          <article><span>Import gần nhất</span><strong>{formatDate(info?.importedAt ?? null)}</strong></article>
          <article><span>Nguồn</span><strong>{datasetStatus.state === "ready" ? datasetStatus.source : "—"}</strong></article>
        </div>

        <dl className="settings-checksum-list">
          <div><dt>Dataset SHA-256</dt><dd title={info?.sourceSha256 ?? undefined}>{shortHash(info?.sourceSha256 ?? null)}</dd></div>
          <div><dt>Assets SHA-256</dt><dd title={info?.assetSha256 ?? undefined}>{shortHash(info?.assetSha256 ?? null)}</dd></div>
        </dl>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <span className="eyebrow">Thi thử</span>
            <h2>Hạng GPLX mặc định</h2>
          </div>
        </div>
        <div className="settings-preference-row">
          <div>
            <strong>Hạng sát hạch khi mở Thi thử</strong>
            <span>Preference được lưu bằng Tauri Store trên app native và localStorage khi preview bằng browser.</span>
          </div>
          <select
            value={defaultLicense}
            disabled={preferenceLoading}
            onChange={(event) => void changeDefaultLicense(event.target.value as LicenseType)}
            aria-label="Hạng GPLX mặc định"
          >
            {SUPPORTED_EXAM_LICENSE_PREFERENCES.map((license) => (
              <option value={license} key={license}>Hạng {license}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <span className="eyebrow">Local user data</span>
            <h2>Dữ liệu học trên máy</h2>
          </div>
        </div>
        <div className="settings-info-grid compact">
          <article><span>Câu có tiến độ</span><strong>{info?.progressCount ?? 0}</strong></article>
          <article><span>Bookmark</span><strong>{info?.bookmarkCount ?? 0}</strong></article>
          <article><span>Bài thi đã lưu</span><strong>{info?.examCount ?? 0}</strong></article>
        </div>

        <div className="settings-reset-list">
          <div>
            <div><strong>Reset tiến độ học</strong><span>Xóa mastery, số lần đúng/sai và lịch ôn tập.</span></div>
            <button className="secondary-button" type="button" disabled={!canMutateLocalData} onClick={() => void reset("progress")}>Reset</button>
          </div>
          <div>
            <div><strong>Xóa bookmark</strong><span>Bỏ toàn bộ câu bạn đã đánh dấu.</span></div>
            <button className="secondary-button" type="button" disabled={!canMutateLocalData} onClick={() => void reset("bookmarks")}>Xóa</button>
          </div>
          <div>
            <div><strong>Xóa lịch sử thi</strong><span>Xóa các phiên thi và câu trả lời đã lưu.</span></div>
            <button className="secondary-button" type="button" disabled={!canMutateLocalData} onClick={() => void reset("exams")}>Xóa</button>
          </div>
          <div className="danger-row">
            <div><strong>Reset toàn bộ dữ liệu người dùng</strong><span>Giữ nguyên dataset/assets, chỉ xóa dữ liệu học cá nhân trên thiết bị.</span></div>
            <button className="danger-button" type="button" disabled={!canMutateLocalData} onClick={() => void reset("all")}>Reset tất cả</button>
          </div>
        </div>
      </section>
    </div>
  );
}
