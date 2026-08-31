import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";

interface DatasetSetupPageProps {
  status: DatasetBootstrapStatus;
  onRetry: () => void;
}

export function DatasetSetupPage({ status, onRetry }: DatasetSetupPageProps) {
  const checking = status.state === "checking";
  const message =
    status.state === "error"
      ? status.message
      : "Ứng dụng đang kiểm tra phiên bản dữ liệu và tải bộ 600 câu nếu máy chưa có dữ liệu local.";

  return (
    <div className="dataset-setup-page" aria-busy={checking}>
      <section className="dataset-setup-card">
        <span className="eyebrow">Khởi tạo dữ liệu</span>
        <h1>{checking ? "Đang chuẩn bị bộ 600 câu..." : "Chưa thể tải bộ dữ liệu"}</h1>
        <p>{message}</p>

        <div className="dataset-setup-flow" aria-label="Các bước khởi tạo dữ liệu">
          <div>
            <strong>01</strong>
            <span>Kiểm tra manifest</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Tải + xác minh SHA-256</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Import vào SQLite local</span>
          </div>
        </div>

        {checking ? (
          <div className="dataset-setup-progress" role="status">
            <i />
            <span>Lần đầu cần Internet. Sau khi hoàn tất, ứng dụng có thể dùng dữ liệu offline.</span>
          </div>
        ) : (
          <div className="dataset-setup-actions">
            <button className="primary-button" type="button" onClick={onRetry}>
              Thử tải lại
            </button>
            <small>
              Kiểm tra kết nối Internet và endpoint dataset trước khi thử lại. Bạn vẫn có thể mở
              mục Kiến thức biển báo và Cài đặt từ thanh điều hướng.
            </small>
          </div>
        )}
      </section>
    </div>
  );
}
