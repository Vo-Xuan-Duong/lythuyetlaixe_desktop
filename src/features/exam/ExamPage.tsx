import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExamResult, ExamSession } from "../../domain/entities/exam";
import type { LicenseType } from "../../domain/entities/question";
import { createExamSession, remainingExamSeconds, scoreExam } from "../../domain/services/examEngine";
import { EXAM_CONFIGS, resolveExamConfig } from "../../domain/services/examConfigs";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { getDefaultExamLicense, setDefaultExamLicense } from "../../infrastructure/preferences/AppPreferences";
import { SqliteExamHistoryRepository } from "../../infrastructure/repositories/SqliteExamHistoryRepository";
import { SqliteQuestionRepository } from "../../infrastructure/repositories/SqliteQuestionRepository";
import { ExamResultReview } from "./ExamResultReview";

interface ExamPageProps {
  datasetStatus: DatasetBootstrapStatus;
}

const questionRepository = new SqliteQuestionRepository();
const historyRepository = new SqliteExamHistoryRepository();

const SUPPORTED_LICENSES = [...new Set(EXAM_CONFIGS.map((config) => config.licenseType))];

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function ExamPage({ datasetStatus }: ExamPageProps) {
  const [licenseType, setLicenseType] = useState<LicenseType>(() => getDefaultExamLicense());
  const [session, setSession] = useState<ExamSession | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [error, setError] = useState<string>();

  const config = useMemo(() => resolveExamConfig(licenseType, new Date()), [licenseType]);

  useEffect(() => {
    setDefaultExamLicense(licenseType);
  }, [licenseType]);

  const submitExam = useCallback(async () => {
    if (!session || result) return;

    const submittedSession: ExamSession = {
      ...session,
      submittedAt: new Date().toISOString(),
    };
    const scored = scoreExam(submittedSession, answers);
    setSession(submittedSession);
    setResult(scored);
    setRemainingSeconds(0);

    if (datasetStatus.state !== "ready") return;

    setHistorySaving(true);
    try {
      await historyRepository.saveCompleted(submittedSession, scored);
    } catch (saveError) {
      setError(
        `Kết quả đã được chấm nhưng chưa lưu được lịch sử: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
      );
    } finally {
      setHistorySaving(false);
    }
  }, [answers, datasetStatus.state, result, session]);

  useEffect(() => {
    if (!session || result) return;

    const update = () => {
      setRemainingSeconds(remainingExamSeconds(session));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [result, session]);

  useEffect(() => {
    if (session && !result && remainingSeconds === 0) {
      void submitExam();
    }
  }, [remainingSeconds, result, session, submitExam]);

  const startExam = async () => {
    if (datasetStatus.state !== "ready") {
      setError("Cần dataset production trước khi tạo đề thi thử.");
      return;
    }
    if (!config) {
      setError("Không có ExamConfig tương thích với hạng và ngày hiện tại.");
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const candidates = await questionRepository.listForLicense(licenseType);
      const nextSession = createExamSession(candidates, config);
      setAnswers({});
      setCurrentIndex(0);
      setResult(null);
      setRemainingSeconds(config.durationSeconds);
      setSession(nextSession);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setLoading(false);
    }
  };

  const resetExam = () => {
    setSession(null);
    setResult(null);
    setAnswers({});
    setCurrentIndex(0);
    setRemainingSeconds(0);
    setError(undefined);
  };

  if (!session) {
    return (
      <div className="page exam-page">
        <div className="exam-hero">
          <span className="eyebrow">Exam Engine</span>
          <h1>Thi thử lý thuyết</h1>
          <p>
            Đề được sinh theo cấu trúc đang áp dụng cho bộ 600 câu, có timer và rule điểm liệt.
            Cấu hình được version hóa theo thời gian hiệu lực thay vì hard-code trong giao diện.
          </p>
        </div>

        {error && <div className="data-warning" role="status">{error}</div>}

        <div className="exam-setup-grid">
          <section className="exam-setup-card">
            <span className="eyebrow">Hạng GPLX</span>
            <h2>Chọn hạng sát hạch</h2>
            <div className="exam-license-grid">
              {SUPPORTED_LICENSES.map((license) => (
                <button
                  key={license}
                  type="button"
                  className={licenseType === license ? "active" : ""}
                  onClick={() => setLicenseType(license)}
                >
                  {license}
                </button>
              ))}
            </div>
          </section>

          <section className="exam-setup-card exam-config-card">
            <span className="eyebrow">Cấu hình hiện tại</span>
            {config ? (
              <>
                <h2>Hạng {config.licenseType}</h2>
                <dl>
                  <div><dt>Số câu</dt><dd>{config.questionCount}</dd></div>
                  <div><dt>Thời gian</dt><dd>{Math.round(config.durationSeconds / 60)} phút</dd></div>
                  <div><dt>Điểm đạt</dt><dd>{config.passingScore}/{config.questionCount}</dd></div>
                  <div><dt>Câu điểm liệt</dt><dd>{config.criticalQuestionCount}</dd></div>
                  <div><dt>Hiệu lực đến</dt><dd>{config.validTo ?? "Không giới hạn"}</dd></div>
                </dl>
              </>
            ) : (
              <div className="exam-config-missing">
                <strong>Chưa có cấu hình tương thích.</strong>
                <p>Không dùng bộ 600 hiện tại để giả lập một format sát hạch mới chưa tương thích.</p>
              </div>
            )}
          </section>
        </div>

        <div className="exam-start-panel">
          <div>
            <strong>{datasetStatus.state === "ready" ? `Dataset ${datasetStatus.version} sẵn sàng` : "Dataset production chưa sẵn sàng"}</strong>
            <span>Trong chế độ thi, ứng dụng không đánh dấu trước câu điểm liệt.</span>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={loading || !config || datasetStatus.state !== "ready"}
            onClick={() => void startExam()}
          >
            {loading ? "Đang tạo đề..." : "Bắt đầu thi"}
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page exam-page">
        <section className={`exam-result-card ${result.passed ? "passed" : "failed"}`}>
          <span className="eyebrow">Kết quả thi thử</span>
          <h1>{result.passed ? "ĐẠT" : "KHÔNG ĐẠT"}</h1>
          <div className="exam-score">{result.score}<small>/{result.questionCount}</small></div>
          <p>
            Yêu cầu: {result.passingScore}/{result.questionCount}
            {session.config.failOnWrongCriticalQuestion ? " và không sai câu điểm liệt." : "."}
          </p>
          {result.criticalFailed && (
            <div className="exam-critical-failure">
              Bài thi không đạt do trả lời sai hoặc bỏ trống câu điểm liệt.
            </div>
          )}
          <div className="exam-result-stats">
            <div><span>Đúng</span><strong>{result.correctCount}</strong></div>
            <div><span>Sai</span><strong>{result.wrongCount}</strong></div>
            <div><span>Chưa trả lời</span><strong>{result.unansweredCount}</strong></div>
          </div>
          {error && <div className="data-warning" role="status">{error}</div>}
          <button className="primary-button" type="button" disabled={historySaving} onClick={resetExam}>
            {historySaving ? "Đang lưu lịch sử..." : "Làm đề khác"}
          </button>
        </section>

        <ExamResultReview session={session} result={result} />
      </div>
    );
  }

  const current = session.questions[currentIndex]?.question;
  if (!current) return null;
  const selectedAnswer = answers[current.id];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="page exam-page exam-running-page">
      <div className="exam-running-header">
        <div>
          <span className="eyebrow">Thi thử hạng {session.config.licenseType}</span>
          <h1>Câu {currentIndex + 1} / {session.config.questionCount}</h1>
        </div>
        <div className={`exam-timer ${remainingSeconds <= 60 ? "urgent" : ""}`}>
          <span>Thời gian còn lại</span>
          <strong>{formatDuration(remainingSeconds)}</strong>
        </div>
      </div>

      {error && <div className="data-warning" role="status">{error}</div>}

      <div className="exam-layout">
        <section className="question-card exam-question-card">
          <h2>{current.content}</h2>
          {current.imagePath && (
            <div className="question-image-frame">
              <img src={current.imagePath} alt={`Hình câu thi ${currentIndex + 1}`} />
            </div>
          )}
          <div className="answer-list">
            {current.answers.map((answer) => (
              <button
                key={answer.key}
                type="button"
                className={`answer-option ${selectedAnswer === answer.key ? "selected" : ""}`}
                onClick={() => setAnswers((state) => ({ ...state, [current.id]: answer.key }))}
              >
                <span className="answer-key">{answer.key}</span>
                <span>{answer.content}</span>
              </button>
            ))}
          </div>
          <div className="question-navigation">
            <button
              className="secondary-button"
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            >
              ← Câu trước
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={currentIndex >= session.questions.length - 1}
              onClick={() => setCurrentIndex((index) => Math.min(session.questions.length - 1, index + 1))}
            >
              Câu tiếp →
            </button>
          </div>
        </section>

        <aside className="exam-navigator-panel">
          <div className="exam-navigator-heading">
            <div><strong>{answeredCount}</strong><span>đã trả lời</span></div>
            <div><strong>{session.config.questionCount - answeredCount}</strong><span>còn lại</span></div>
          </div>
          <div className="exam-question-grid">
            {session.questions.map((item, index) => (
              <button
                type="button"
                key={item.question.id}
                className={`${index === currentIndex ? "current" : ""} ${answers[item.question.id] ? "answered" : ""}`}
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <button className="primary-button full-width" type="button" onClick={() => void submitExam()}>
            Nộp bài
          </button>
        </aside>
      </div>
    </div>
  );
}
