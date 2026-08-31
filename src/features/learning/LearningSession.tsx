import { useEffect, useMemo, useState } from "react";
import type { Question } from "../../domain/entities/question";
import type { QuestionProgress } from "../../domain/entities/progress";
import { accuracyPercent, recordAnswerProgress } from "../../domain/services/learningProgress";
import { demoQuestion } from "../../data/demo";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteProgressRepository } from "../../infrastructure/repositories/SqliteProgressRepository";
import { SqliteQuestionRepository } from "../../infrastructure/repositories/SqliteQuestionRepository";

interface LearningSessionProps {
  datasetStatus: DatasetBootstrapStatus;
  initialQuestionId: number;
  onBack: () => void;
  questionSequence?: number[];
  backLabel?: string;
}

const QUESTION_COUNT = 600;

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL_RULES: "Quy định và quy tắc giao thông",
  CULTURE: "Văn hóa, đạo đức và cứu hộ",
  DRIVING_TECHNIQUE: "Kỹ thuật lái xe",
  VEHICLE: "Cấu tạo và sửa chữa",
  ROAD_SIGNS: "Báo hiệu đường bộ",
  SITUATIONS: "Sa hình và xử lý tình huống",
};

const questionRepository = new SqliteQuestionRepository();
const progressRepository = new SqliteProgressRepository();

function formatReviewTime(value?: string): string {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function LearningSession({
  datasetStatus,
  initialQuestionId,
  onBack,
  questionSequence,
  backLabel = "Danh sách câu hỏi",
}: LearningSessionProps) {
  const [currentQuestionId, setCurrentQuestionId] = useState(initialQuestionId);
  const [selectedAnswer, setSelectedAnswer] = useState<string>();
  const [checked, setChecked] = useState(false);
  const [databaseQuestion, setDatabaseQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState<QuestionProgress | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();

  useEffect(() => {
    setCurrentQuestionId(initialQuestionId);
  }, [initialQuestionId]);

  useEffect(() => {
    let active = true;

    if (datasetStatus.state !== "ready") {
      setDatabaseQuestion(null);
      setProgress(null);
      setBookmarked(false);
      setLoadError(undefined);
      setQuestionLoading(false);
      return () => {
        active = false;
      };
    }

    setQuestionLoading(true);
    setLoadError(undefined);
    setOperationError(undefined);

    void Promise.all([
      questionRepository.getById(currentQuestionId),
      progressRepository.get(currentQuestionId),
      progressRepository.isBookmarked(currentQuestionId),
    ])
      .then(([question, questionProgress, isBookmarked]) => {
        if (!active) return;
        setDatabaseQuestion(question);
        setProgress(questionProgress);
        setBookmarked(isBookmarked);
        setLoadError(
          question
            ? undefined
            : `SQLite đã sẵn sàng nhưng không tìm thấy câu số ${currentQuestionId}.`,
        );
      })
      .catch((error) => {
        if (!active) return;
        setDatabaseQuestion(null);
        setProgress(null);
        setBookmarked(false);
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setQuestionLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentQuestionId, datasetStatus]);

  const question = databaseQuestion ?? demoQuestion;
  const isProductionData = databaseQuestion !== null && datasetStatus.state === "ready";
  const selected = question.answers.find((answer) => answer.key === selectedAnswer);
  const accuracy = accuracyPercent(progress);

  const sequencePosition = useMemo(() => {
    if (!questionSequence?.length) return -1;
    return questionSequence.indexOf(currentQuestionId);
  }, [currentQuestionId, questionSequence]);

  const previousQuestionId = questionSequence?.length
    ? sequencePosition > 0
      ? questionSequence[sequencePosition - 1]
      : undefined
    : currentQuestionId > 1
      ? currentQuestionId - 1
      : undefined;
  const nextQuestionId = questionSequence?.length
    ? sequencePosition >= 0 && sequencePosition + 1 < questionSequence.length
      ? questionSequence[sequencePosition + 1]
      : undefined
    : currentQuestionId < QUESTION_COUNT
      ? currentQuestionId + 1
      : undefined;

  const resetAnswer = () => {
    setSelectedAnswer(undefined);
    setChecked(false);
    setOperationError(undefined);
  };

  useEffect(() => {
    resetAnswer();
  }, [question.id, question.sourceVersion]);

  const handleCheck = async () => {
    if (!selectedAnswer || checked || saving) return;

    const answer = question.answers.find((item) => item.key === selectedAnswer);
    if (!answer) return;

    setChecked(true);
    setOperationError(undefined);

    if (!isProductionData) return;

    const nextProgress = recordAnswerProgress({
      questionId: question.id,
      correct: answer.correct,
      previous: progress,
    });

    setSaving(true);
    try {
      await progressRepository.save(nextProgress);
      setProgress(nextProgress);
    } catch (error) {
      setOperationError(
        `Đã chấm đáp án nhưng chưa lưu được tiến độ: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleBookmark = async () => {
    if (!isProductionData || saving) return;

    setSaving(true);
    setOperationError(undefined);
    try {
      if (bookmarked) {
        await progressRepository.removeBookmark(question.id);
        setBookmarked(false);
      } else {
        await progressRepository.addBookmark(question.id);
        setBookmarked(true);
      }
    } catch (error) {
      setOperationError(
        `Không thể cập nhật đánh dấu: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const navigateTo = (questionId?: number) => {
    if (!isProductionData || questionLoading || saving || questionId === undefined) return;
    if (questionId < 1 || questionId > QUESTION_COUNT || questionId === currentQuestionId) return;
    setCurrentQuestionId(questionId);
  };

  const dataTag = (() => {
    if (datasetStatus.state === "checking") return "Đang kiểm tra dữ liệu";
    if (datasetStatus.state === "error" || loadError) return "Fallback demo — lỗi dữ liệu";
    if (isProductionData) return `Dataset ${datasetStatus.version}`;
    return "Dữ liệu demo";
  })();

  return (
    <div className="page learning-page">
      <div className="learning-back-row">
        <button className="text-button" type="button" onClick={onBack}>
          ← {backLabel}
        </button>
      </div>

      <div className="section-heading learning-heading">
        <div>
          <span className="eyebrow">Chế độ học</span>
          <h1>Câu {question.id} / {QUESTION_COUNT}</h1>
          {questionSequence?.length && sequencePosition >= 0 ? (
            <p>Vị trí {sequencePosition + 1} / {questionSequence.length} trong danh sách ôn tập.</p>
          ) : null}
        </div>
        <div className="question-tags">
          <span>{CATEGORY_LABELS[question.categoryCode] ?? question.categoryCode}</span>
          {question.critical && <span className="critical-tag">Câu điểm liệt</span>}
          <span className={isProductionData ? "production-tag" : "demo-tag"}>{dataTag}</span>
        </div>
      </div>

      {(datasetStatus.state === "error" || loadError) && (
        <div className="data-warning" role="status">
          Không thể đọc dataset production. Ứng dụng đang dùng câu demo để không chặn quá trình phát triển UI.
          <small>{loadError ?? (datasetStatus.state === "error" ? datasetStatus.message : "")}</small>
        </div>
      )}

      {operationError && (
        <div className="data-warning" role="status">
          {operationError}
        </div>
      )}

      <div className="learning-layout" aria-busy={questionLoading || saving}>
        <section className="question-card">
          <div className="question-meta">
            <span>{questionLoading ? "Đang tải câu hỏi..." : "Câu hỏi"}</span>
            <button
              type="button"
              className={`bookmark-button ${bookmarked ? "bookmarked" : ""}`}
              aria-label={bookmarked ? "Bỏ đánh dấu câu hỏi" : "Đánh dấu câu hỏi"}
              aria-pressed={bookmarked}
              disabled={!isProductionData || saving}
              onClick={() => void toggleBookmark()}
            >
              {bookmarked ? "★" : "☆"}
            </button>
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
                  disabled={checked || questionLoading}
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
              disabled={!selectedAnswer || questionLoading || saving}
              onClick={() => void handleCheck()}
              type="button"
            >
              {saving ? "Đang lưu..." : "Kiểm tra đáp án"}
            </button>
          ) : (
            <div className={`answer-feedback ${selected?.correct ? "success" : "danger"}`}>
              <strong>{selected?.correct ? "Chính xác" : "Chưa chính xác"}</strong>
              <p>{question.explanation ?? "Đáp án được đối chiếu từ dataset đã xác minh."}</p>
            </div>
          )}

          <div className="question-navigation">
            <button
              className="secondary-button"
              type="button"
              disabled={!isProductionData || previousQuestionId === undefined || questionLoading || saving}
              onClick={() => navigateTo(previousQuestionId)}
            >
              ← Câu trước
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!isProductionData || nextQuestionId === undefined || questionLoading || saving}
              onClick={() => navigateTo(nextQuestionId)}
            >
              Câu tiếp →
            </button>
          </div>
        </section>

        <aside className="question-side-panel">
          <span className="eyebrow">Tiến độ câu này</span>
          <h3>{progress ? `${accuracy}% chính xác` : "Chưa làm"}</h3>
          <div className="side-progress">
            <i style={{ width: `${(progress?.mastery ?? 0) * 25}%` }} />
          </div>
          <dl>
            <div><dt>Số lần làm</dt><dd>{progress?.attemptCount ?? 0}</dd></div>
            <div><dt>Đúng</dt><dd>{progress?.correctCount ?? 0}</dd></div>
            <div><dt>Sai</dt><dd>{progress?.wrongCount ?? 0}</dd></div>
            <div><dt>Mastery</dt><dd>{progress?.mastery ?? 0} / 4</dd></div>
            <div><dt>Ôn lại</dt><dd>{formatReviewTime(progress?.nextReviewAt)}</dd></div>
          </dl>
          {checked && (
            <button className="secondary-button full-width" onClick={resetAnswer} type="button" disabled={saving}>
              Làm lại câu hiện tại
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
