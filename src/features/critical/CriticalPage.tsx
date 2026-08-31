import { useEffect, useMemo, useState } from "react";
import type { LearningQuestionSummary } from "../../domain/entities/learningCatalog";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteLearningCatalogRepository } from "../../infrastructure/repositories/SqliteLearningCatalogRepository";
import { LearningSession } from "../learning/LearningSession";

interface CriticalPageProps {
  datasetStatus: DatasetBootstrapStatus;
}

type CriticalMode = "all" | "wrong";

const repository = new SqliteLearningCatalogRepository();

function accuracy(question: LearningQuestionSummary): number {
  if (question.attemptCount <= 0) return 0;
  return Math.round((question.correctCount / question.attemptCount) * 100);
}

export function CriticalPage({ datasetStatus }: CriticalPageProps) {
  const [mode, setMode] = useState<CriticalMode>("all");
  const [questions, setQuestions] = useState<LearningQuestionSummary[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (datasetStatus.state !== "ready") {
      setQuestions([]);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);
    void repository
      .list({
        criticalOnly: true,
        filter: mode === "wrong" ? "wrong" : "all",
        limit: 60,
        offset: 0,
      })
      .then((result) => {
        if (active) setQuestions(result.items);
      })
      .catch((loadError) => {
        if (!active) return;
        setQuestions([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [datasetStatus, mode, refreshKey]);

  const sequence = useMemo(() => questions.map((question) => question.id), [questions]);
  const mastered = questions.filter((question) => question.mastery === 4).length;
  const learned = questions.filter((question) => question.attemptCount > 0).length;

  if (selectedQuestionId !== null) {
    return (
      <LearningSession
        datasetStatus={datasetStatus}
        initialQuestionId={selectedQuestionId}
        questionSequence={sequence}
        backLabel={mode === "wrong" ? "Câu điểm liệt đã sai" : "60 câu điểm liệt"}
        onBack={() => {
          setSelectedQuestionId(null);
          setRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className="page question-collection-page critical-page">
      <div className="section-heading collection-heading">
        <div>
          <span className="eyebrow">Luyện tập chuyên biệt</span>
          <h1>60 câu điểm liệt</h1>
          <p>
            Luyện riêng nhóm câu mất an toàn giao thông nghiêm trọng và quay lại ngay các câu điểm liệt bạn từng làm sai.
          </p>
        </div>
        <div className="review-count-card">
          <strong>{mode === "all" ? `${mastered}/60` : questions.length}</strong>
          <span>{mode === "all" ? "mastery 4" : "đã từng sai"}</span>
        </div>
      </div>

      <div className="review-mode-tabs" role="tablist" aria-label="Chế độ luyện câu điểm liệt">
        <button type="button" role="tab" aria-selected={mode === "all"} className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>
          Tất cả 60 câu
        </button>
        <button type="button" role="tab" aria-selected={mode === "wrong"} className={mode === "wrong" ? "active" : ""} onClick={() => setMode("wrong")}>
          Đã từng sai
        </button>
      </div>

      {mode === "all" && (
        <div className="review-mode-description">
          <strong>{learned}/60 đã học</strong>
          <span>{mastered}/60 câu đã đạt mastery 4.</span>
        </div>
      )}

      {error && (
        <div className="data-warning" role="status">
          Không thể tải danh sách câu điểm liệt.
          <small>{error}</small>
        </div>
      )}

      {loading ? (
        <div className="catalog-empty-state">Đang tải câu điểm liệt...</div>
      ) : questions.length === 0 ? (
        <div className="catalog-empty-state collection-empty-state">
          <strong>{mode === "wrong" ? "Bạn chưa làm sai câu điểm liệt nào." : "Chưa có dữ liệu 60 câu điểm liệt."}</strong>
          <p>{mode === "wrong" ? "Tiếp tục luyện tập; các câu sai sẽ tự xuất hiện tại đây." : "Kiểm tra dataset production trên thiết bị."}</p>
        </div>
      ) : (
        <div className="catalog-question-list collection-question-list">
          {questions.map((question) => (
            <button className="catalog-question-row" type="button" key={question.id} onClick={() => setSelectedQuestionId(question.id)}>
              <div className="catalog-question-id">
                <strong>{question.id}</strong>
                <span>Điểm liệt</span>
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
    </div>
  );
}
