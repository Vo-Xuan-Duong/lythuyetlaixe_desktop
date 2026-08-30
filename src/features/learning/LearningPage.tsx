import { useEffect, useState } from "react";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import type { Question } from "../../domain/entities/question";
import { demoQuestion } from "../../data/demo";
import { SqliteQuestionRepository } from "../../infrastructure/repositories/SqliteQuestionRepository";

interface LearningPageProps {
  datasetStatus: DatasetBootstrapStatus;
}

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL_RULES: "Quy định và quy tắc giao thông",
  CULTURE: "Văn hóa, đạo đức và cứu hộ",
  DRIVING_TECHNIQUE: "Kỹ thuật lái xe",
  VEHICLE: "Cấu tạo và sửa chữa",
  ROAD_SIGNS: "Báo hiệu đường bộ",
  SITUATIONS: "Sa hình và xử lý tình huống",
};

const repository = new SqliteQuestionRepository();

export function LearningPage({ datasetStatus }: LearningPageProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string>();
  const [checked, setChecked] = useState(false);
  const [databaseQuestion, setDatabaseQuestion] = useState<Question | null>(null);
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    let active = true;

    if (datasetStatus.state !== "ready") {
      setDatabaseQuestion(null);
      setLoadError(undefined);
      return () => {
        active = false;
      };
    }

    void repository
      .getById(1)
      .then((question) => {
        if (!active) return;
        setDatabaseQuestion(question);
        setLoadError(question ? undefined : "SQLite đã sẵn sàng nhưng chưa tìm thấy câu số 1.");
      })
      .catch((error) => {
        if (!active) return;
        setDatabaseQuestion(null);
        setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      active = false;
    };
  }, [datasetStatus]);

  const question = databaseQuestion ?? demoQuestion;
  const isProductionData = databaseQuestion !== null && datasetStatus.state === "ready";
  const selected = question.answers.find((answer) => answer.key === selectedAnswer);

  const reset = () => {
    setSelectedAnswer(undefined);
    setChecked(false);
  };

  useEffect(() => {
    reset();
  }, [question.id, question.sourceVersion]);

  const dataTag = (() => {
    if (datasetStatus.state === "checking") return "Đang kiểm tra dữ liệu";
    if (datasetStatus.state === "error" || loadError) return "Fallback demo — lỗi dữ liệu";
    if (isProductionData) return `Dataset ${datasetStatus.version}`;
    return "Dữ liệu demo";
  })();

  return (
    <div className="page learning-page">
      <div className="section-heading learning-heading">
        <div>
          <span className="eyebrow">Chế độ học</span>
          <h1>Câu {question.id} / 600</h1>
        </div>
        <div className="question-tags">
          <span>{CATEGORY_LABELS[question.categoryCode] ?? question.categoryCode}</span>
          <span className={isProductionData ? "production-tag" : "demo-tag"}>{dataTag}</span>
        </div>
      </div>

      {(datasetStatus.state === "error" || loadError) && (
        <div className="data-warning" role="status">
          Không thể đọc dataset production. Ứng dụng đang dùng câu demo để không chặn quá trình phát triển UI.
          <small>{loadError ?? (datasetStatus.state === "error" ? datasetStatus.message : "")}</small>
        </div>
      )}

      <div className="learning-layout">
        <section className="question-card">
          <div className="question-meta">
            <span>Câu hỏi</span>
            <button type="button" className="bookmark-button" aria-label="Đánh dấu câu hỏi">☆</button>
          </div>

          <h2>{question.content}</h2>

          {question.imagePath && (
            <div className="question-image-frame">
              <img src={question.imagePath} alt={`Hình minh họa câu ${question.id}`} />
            </div>
          )}

          <div className="answer-list">
            {question.answers.map((answer) => {
              const isSelected = answer.key === selectedAnswer;
              const state = checked
                ? answer.correct
                  ? "correct"
                  : isSelected
                    ? "wrong"
                    : ""
                : isSelected
                  ? "selected"
                  : "";

              return (
                <button
                  key={answer.key}
                  type="button"
                  className={`answer-option ${state}`}
                  disabled={checked}
                  onClick={() => setSelectedAnswer(answer.key)}
                >
                  <span className="answer-key">{answer.key}</span>
                  <span>{answer.content}</span>
                </button>
              );
            })}
          </div>

          {!checked ? (
            <button
              className="primary-button check-button"
              disabled={!selectedAnswer}
              onClick={() => setChecked(true)}
              type="button"
            >
              Kiểm tra đáp án
            </button>
          ) : (
            <div className={`answer-feedback ${selected?.correct ? "success" : "danger"}`}>
              <strong>{selected?.correct ? "Chính xác" : "Chưa chính xác"}</strong>
              <p>{question.explanation ?? "Đáp án được đối chiếu từ dataset đã xác minh."}</p>
            </div>
          )}
        </section>

        <aside className="question-side-panel">
          <span className="eyebrow">Phiên học</span>
          <h3>Tiến độ chủ đề</h3>
          <div className="side-progress"><i /></div>
          <dl>
            <div><dt>Đã làm</dt><dd>0</dd></div>
            <div><dt>Đúng</dt><dd>0</dd></div>
            <div><dt>Sai</dt><dd>0</dd></div>
            <div><dt>Mastery</dt><dd>0 / 4</dd></div>
          </dl>
          {checked && (
            <button className="secondary-button full-width" onClick={reset} type="button">
              Làm lại câu hiện tại
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
