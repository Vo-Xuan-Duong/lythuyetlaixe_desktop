import { useState } from "react";
import {
  runRuntimeDiagnostics,
  type DiagnosticLevel,
  type RuntimeDiagnosticItem,
} from "../../infrastructure/diagnostics/RuntimeDiagnostics";

const LEVEL_LABELS: Record<DiagnosticLevel, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  info: "INFO",
};

export function RuntimeDiagnosticsPanel() {
  const [items, setItems] = useState<RuntimeDiagnosticItem[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string>();

  const run = async () => {
    setRunning(true);
    try {
      setItems(await runRuntimeDiagnostics());
      setLastRunAt(new Date().toISOString());
    } finally {
      setRunning(false);
    }
  };

  const failed = items.filter((item) => item.level === "fail").length;
  const warnings = items.filter((item) => item.level === "warn").length;

  return (
    <section className="settings-section diagnostics-section">
      <div className="settings-section-heading">
        <div>
          <span className="eyebrow">Local diagnostics</span>
          <h2>Kiểm tra runtime trên thiết bị</h2>
          <p>
            Chỉ đọc trạng thái local. Không tải lại dataset, không sửa SQLite và không xin quyền notification.
          </p>
        </div>
        <button className="secondary-button" type="button" disabled={running} onClick={() => void run()}>
          {running ? "Đang kiểm tra..." : "Chạy diagnostics"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="diagnostics-empty">
          Chạy diagnostics sau khi mở app bằng Tauri để kiểm tra plugin và dữ liệu local.
        </div>
      ) : (
        <>
          <div className="diagnostics-summary">
            <strong>{failed === 0 ? "Không phát hiện lỗi bắt buộc" : `${failed} lỗi cần xử lý`}</strong>
            <span>
              {warnings} cảnh báo
              {lastRunAt ? ` · ${new Date(lastRunAt).toLocaleString("vi-VN")}` : ""}
            </span>
          </div>

          <div className="diagnostics-list">
            {items.map((item) => (
              <article className={`diagnostic-row ${item.level}`} key={item.id}>
                <span className="diagnostic-badge">{LEVEL_LABELS[item.level]}</span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.summary}</span>
                  {item.detail && <small>{item.detail}</small>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
