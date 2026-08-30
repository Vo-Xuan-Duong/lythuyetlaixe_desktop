import { useEffect, useState } from "react";
import type {
  LearningQuestionFilter,
  LearningQuestionSummary,
} from "../../domain/entities/learningCatalog";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteLearningCatalogRepository } from "../../infrastructure/repositories/SqliteLearningCatalogRepository";
import { LearningSession } from "./LearningSession";

interface QuestionCollectionPageProps {
  datasetStatus: DatasetBootstrapStatus;
  eyebrow: string;
  title: string;
  description: string;
  filter?: LearningQuestionFilter;
  criticalOnly?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

const PAGE_SIZE = 60;
const repository = new SqliteLearningCatalogRepository();

function accuracy(question: LearningQuestionSummary): number {
  if (question.attemptCount <= 0) return 0;
  return Math.round((question.correctCount / question.attemptCount) * 100);
}

export function QuestionCollectionPage({
  datasetStatus,
  eyebrow,
  title,
  description,
  filter = "all",
  criticalOnly = false,
  emptyTitle,
  emptyDescription,
}: QuestionCollectionPageProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<LearningQuestionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setPage(0);
  }, [criticalOnly, filter]);

  useEffect(() => {
    let active = true;

    if (datasetStatus.state !== "ready") {
      setQuestions([]);
      setTotal(0);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);

    void repository
      .list({
        filter,
        criticalOnly,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((result) => {
        if (!active) return;
        setQuestions(result.items);
        setTotal(result.total);
      })
      .catch((loadError) => {
        if (!active) return;
        setQuestions([]);
        setTotal(0);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [criticalOnly, datasetStatus, filter, page]);

  if (selectedQuestionId !== null) {
    return (
      <LearningSession
        datasetStatus={datasetStatus}
        initialQuestionId={selectedQuestionId}
        onBack={() => setSelectedQuestionId(null)}
      />
    );
  }

  const datasetReady = datasetStatus.state === "ready";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstQuestion = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastQuestion = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="page question-collection-page">
      <div className="section-heading collection-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={`catalog-dataset-status ${datasetReady ? "ready" : "pending"}`}>
          {datasetStatus.state === "ready"
            ? `${total} câu`
            : datasetStatus.state === "checking"
              ? "Đang kiểm tra dữ liệu"
              : "Dataset chưa sẵn sàng"}
        </div>
      </div>

      {datasetStatus.state === "error" && (
        <div className="data-warning" role="status">
          Không thể đọc dataset production.
          <small>{datasetStatus.message}</small>
        </div>
      )}

      {error && (
        <div className="data-warning" role="status">
          Không thể tải danh sách câu hỏi.
          <small>{error}</small>
        </div>
      )}

      {!datasetReady ? (
        <div className="catalog-empty-state collection-empty-state">
          <strong>Chưa có dataset production trong bundle.</strong>
          <p>Danh sách sẽ tự sử dụng SQLite khi bộ 600 câu đã được validate và publish.</p>
        </div>
      ) : loading ? (
        <div className="catalog-empty-state collection-empty-state">Đang tải danh sách câu hỏi...</div>
      ) : questions.length === 0 ? (
        <div className="catalog-empty-state collection-empty-state">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      ) : (
        <div className="catalog-question-list collection-question-list">
          {questions.map((question) => (
            <button
              type="button"
              className="catalog-question-row"
              key={question.id}
              onClick={() => setSelectedQuestionId(question.id)}
            >
              <div className="catalog-question-id">
                <strong>{question.id}</strong>
                {question.critical && <span>Điểm liệt</span>}
              </div>
              <div className="catalog-question-content">
                <strong>{question.content}</strong>
                <div>
                  <span>{question.attemptCount > 0 ? `${accuracy(question)}% chính xác` : "Chưa học"}</span>
                  <span>Mastery {question.mastery}/4</span>
                  {question.wrongCount > 0 && <span className="wrong-stat">Sai {question.wrongCount} lần</span>}
                </div>
              </div>
              <div className="catalog-question-actions">
                {question.bookmarked && <span aria-label="Đã đánh dấu">★</span>}
                <span>→</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {datasetReady && total > 0 && (
        <div className="catalog-pagination collection-pagination">
          <span>Hiển thị {firstQuestion}–{lastQuestion} / {total}</span>
          <div>
            <button
              className="secondary-button"
              type="button"
              disabled={page <= 0 || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              ← Trước
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
