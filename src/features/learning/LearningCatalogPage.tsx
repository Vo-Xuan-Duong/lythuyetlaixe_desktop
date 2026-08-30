import { useEffect, useState } from "react";
import type {
  LearningCategorySummary,
  LearningQuestionFilter,
  LearningQuestionSummary,
} from "../../domain/entities/learningCatalog";
import { demoCategories } from "../../data/demo";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteLearningCatalogRepository } from "../../infrastructure/repositories/SqliteLearningCatalogRepository";

interface LearningCatalogPageProps {
  datasetStatus: DatasetBootstrapStatus;
  onOpenQuestion: (questionId: number) => void;
}

const PAGE_SIZE = 60;
const repository = new SqliteLearningCatalogRepository();

const FILTERS: Array<{ value: LearningQuestionFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "unlearned", label: "Chưa học" },
  { value: "learned", label: "Đã học" },
  { value: "wrong", label: "Câu sai" },
  { value: "bookmarked", label: "Đánh dấu" },
];

function fallbackCategories(): LearningCategorySummary[] {
  return demoCategories.map((category) => ({
    id: category.id,
    code: category.code,
    name: category.name,
    questionCount: category.questionCount,
    learnedCount: 0,
    wrongCount: 0,
    masteredCount: 0,
  }));
}

function accuracy(question: LearningQuestionSummary): number {
  if (question.attemptCount <= 0) return 0;
  return Math.round((question.correctCount / question.attemptCount) * 100);
}

export function LearningCatalogPage({ datasetStatus, onOpenQuestion }: LearningCatalogPageProps) {
  const [categories, setCategories] = useState<LearningCategorySummary[]>(fallbackCategories);
  const [selectedCategory, setSelectedCategory] = useState<string>();
  const [filter, setFilter] = useState<LearningQuestionFilter>("all");
  const [questions, setQuestions] = useState<LearningQuestionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    if (datasetStatus.state !== "ready") {
      setCategories(fallbackCategories());
      return () => {
        active = false;
      };
    }

    void repository
      .listCategories()
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });

    return () => {
      active = false;
    };
  }, [datasetStatus]);

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
        categoryCode: selectedCategory,
        filter,
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
  }, [datasetStatus, filter, page, selectedCategory]);

  const selectCategory = (categoryCode?: string) => {
    setSelectedCategory(categoryCode);
    setPage(0);
  };

  const selectFilter = (value: LearningQuestionFilter) => {
    setFilter(value);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstQuestion = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastQuestion = Math.min((page + 1) * PAGE_SIZE, total);
  const datasetReady = datasetStatus.state === "ready";

  return (
    <div className="page learning-catalog-page">
      <div className="section-heading catalog-heading">
        <div>
          <span className="eyebrow">Chế độ học</span>
          <h1>Chọn phần cần luyện</h1>
          <p>Học theo 6 nhóm kiến thức hoặc lọc nhanh các câu chưa học, đã làm sai và đã đánh dấu.</p>
        </div>
        <div className={`catalog-dataset-status ${datasetReady ? "ready" : "pending"}`}>
          {datasetStatus.state === "ready"
            ? `Dataset ${datasetStatus.version}`
            : datasetStatus.state === "checking"
              ? "Đang kiểm tra dữ liệu"
              : "Dataset production chưa sẵn sàng"}
        </div>
      </div>

      {datasetStatus.state === "error" && (
        <div className="data-warning" role="status">
          Không thể mở catalog production. Các nhóm kiến thức vẫn hiển thị để phát triển giao diện.
          <small>{datasetStatus.message}</small>
        </div>
      )}

      {error && (
        <div className="data-warning" role="status">
          Không thể tải danh sách câu hỏi.
          <small>{error}</small>
        </div>
      )}

      <section className="catalog-section">
        <div className="catalog-section-title">
          <div>
            <span className="eyebrow">Theo chủ đề</span>
            <h2>6 nhóm kiến thức</h2>
          </div>
          <button
            className={`catalog-all-button ${selectedCategory === undefined ? "active" : ""}`}
            type="button"
            onClick={() => selectCategory(undefined)}
          >
            Tất cả 600 câu
          </button>
        </div>

        <div className="catalog-category-grid">
          {categories.map((category, index) => {
            const progress = category.questionCount > 0
              ? Math.round((category.learnedCount / category.questionCount) * 100)
              : 0;
            return (
              <button
                className={`catalog-category-card ${selectedCategory === category.code ? "active" : ""}`}
                type="button"
                key={category.code}
                onClick={() => selectCategory(category.code)}
              >
                <div className="catalog-category-topline">
                  <span>0{index + 1}</span>
                  <small>{category.questionCount} câu</small>
                </div>
                <strong>{category.name}</strong>
                <div className="catalog-category-stats">
                  <span>{category.learnedCount} đã học</span>
                  <span>{category.wrongCount} câu sai</span>
                </div>
                <div className="mini-progress">
                  <i style={{ width: `${progress}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="catalog-section question-catalog-section">
        <div className="catalog-question-toolbar">
          <div>
            <span className="eyebrow">Danh sách câu</span>
            <h2>{total} câu phù hợp</h2>
          </div>
          <div className="catalog-filters" aria-label="Lọc trạng thái học">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.value}
                className={filter === item.value ? "active" : ""}
                onClick={() => selectFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!datasetReady ? (
          <div className="catalog-empty-state">
            <strong>Chưa có dataset production trong bundle.</strong>
            <p>Khi `questions.json` đã qua validator được publish, danh sách 600 câu sẽ xuất hiện tại đây và lưu tiến độ bằng SQLite.</p>
          </div>
        ) : loading ? (
          <div className="catalog-empty-state">Đang tải danh sách câu hỏi...</div>
        ) : questions.length === 0 ? (
          <div className="catalog-empty-state">
            <strong>Không có câu nào phù hợp bộ lọc hiện tại.</strong>
            <p>Đổi chủ đề hoặc trạng thái học để xem nhóm câu khác.</p>
          </div>
        ) : (
          <div className="catalog-question-list">
            {questions.map((question) => (
              <button
                type="button"
                className="catalog-question-row"
                key={question.id}
                onClick={() => onOpenQuestion(question.id)}
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
          <div className="catalog-pagination">
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
      </section>
    </div>
  );
}
