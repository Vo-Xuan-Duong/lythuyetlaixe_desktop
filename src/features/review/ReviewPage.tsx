import { useEffect, useMemo, useState } from "react";
import type {
  ReviewQueueItem,
  ReviewQueueMode,
} from "../../domain/entities/reviewStatistics";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteReviewStatisticsRepository } from "../../infrastructure/repositories/SqliteReviewStatisticsRepository";
import { LearningSession } from "../learning/LearningSession";

interface ReviewPageProps {
  datasetStatus: DatasetBootstrapStatus;
}

const repository = new SqliteReviewStatisticsRepository();

const MODES: Array<{
  value: ReviewQueueMode;
  label: string;
  description: string;
}> = [
  {
    value: "due",
    label: "Đến hạn",
    description: "Các câu có lịch ôn đã đến hạn, ưu tiên câu quá hạn lâu hơn trước.",
  },
  {
    value: "weak",
    label: "Câu yếu",
    description: "Ưu tiên mastery thấp, tỷ lệ đúng thấp và số lần sai cao.",
  },
  {
    value: "wrong",
    label: "Đã từng sai",
    description: "Toàn bộ câu đã có ít nhất một lần trả lời sai.",
  },
];

function accuracy(item: ReviewQueueItem): number {
  if (item.attemptCount <= 0) return 0;
  return Math.round((item.correctCount / item.attemptCount) * 100);
}

function formatReviewAt(value?: string): string {
  if (!value) return "Chưa lên lịch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ReviewPage({ datasetStatus }: ReviewPageProps) {
  const [mode, setMode] = useState<ReviewQueueMode>("due");
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (datasetStatus.state !== "ready") {
      setItems([]);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);
    void repository
      .listReviewQueue(mode, { limit: 200 })
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((loadError) => {
        if (!active) return;
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [datasetStatus, mode, refreshKey]);

  const sequence = useMemo(() => items.map((item) => item.questionId), [items]);
  const selectedMode = MODES.find((item) => item.value === mode) ?? MODES[0];

  if (selectedQuestionId !== null) {
    return (
      <LearningSession
        datasetStatus={datasetStatus}
        initialQuestionId={selectedQuestionId}
        questionSequence={sequence}
        backLabel="Hàng đợi ôn tập"
        onBack={() => {
          setSelectedQuestionId(null);
          setRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className="page review-page">
      <div className="section-heading review-heading">
        <div>
          <span className="eyebrow">Review engine</span>
          <h1>Ôn tập thông minh</h1>
          <p>
            Hàng đợi được tạo trực tiếp từ tiến độ SQLite. Không cần chọn thủ công câu cần ôn lại.
          </p>
        </div>
        <div className="review-count-card">
          <strong>{items.length}</strong>
          <span>{selectedMode.label.toLowerCase()}</span>
        </div>
      </div>

      <div className="review-mode-tabs" role="tablist" aria-label="Loại hàng đợi ôn tập">
        {MODES.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={mode === item.value}
            className={mode === item.value ? "active" : ""}
            key={item.value}
            onClick={() => setMode(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="review-mode-description">
        <strong>{selectedMode.label}</strong>
        <span>{selectedMode.description}</span>
      </div>

      {error && (
        <div className="data-warning" role="status">
          Không thể tạo hàng đợi ôn tập.
          <small>{error}</small>
        </div>
      )}

      {loading ? (
        <div className="catalog-empty-state">Đang xếp hàng câu cần ôn...</div>
      ) : items.length === 0 ? (
        <div className="catalog-empty-state review-empty-state">
          <strong>
            {mode === "due"
              ? "Hiện chưa có câu nào đến hạn ôn."
              : mode === "wrong"
                ? "Bạn chưa có câu trả lời sai."
                : "Chưa có đủ dữ liệu để xếp hạng câu yếu."}
          </strong>
          <p>Tiếp tục luyện tập; hàng đợi sẽ tự cập nhật từ kết quả đã lưu trên máy.</p>
        </div>
      ) : (
        <div className="review-list">
          {items.map((item, index) => (
            <button
              className="review-row"
              type="button"
              key={item.questionId}
              onClick={() => setSelectedQuestionId(item.questionId)}
            >
              <div className="review-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="review-question-number">
                <strong>Câu {item.questionId}</strong>
                {item.critical && <span>Điểm liệt</span>}
              </div>
              <div className="review-question-body">
                <strong>{item.content}</strong>
                <div>
                  <span>{item.categoryName}</span>
                  <span>{accuracy(item)}% chính xác</span>
                  <span>Mastery {item.mastery}/4</span>
                  <span>Sai {item.wrongCount} lần</span>
                  {mode === "due" && <span>Ôn: {formatReviewAt(item.nextReviewAt)}</span>}
                </div>
              </div>
              <div className="review-row-action">
                {item.bookmarked && <span aria-label="Đã đánh dấu">★</span>}
                <span>→</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
