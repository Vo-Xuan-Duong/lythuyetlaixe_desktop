import { useEffect, useMemo, useState } from "react";
import type {
  StatisticsSnapshot,
} from "../../domain/entities/reviewStatistics";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteReviewStatisticsRepository } from "../../infrastructure/repositories/SqliteReviewStatisticsRepository";
import { LearningSession } from "../learning/LearningSession";

interface StatisticsPageProps {
  datasetStatus: DatasetBootstrapStatus;
}

const repository = new SqliteReviewStatisticsRepository();

const EMPTY_SNAPSHOT: StatisticsSnapshot = {
  learning: {
    totalQuestions: 0,
    learnedQuestions: 0,
    masteredQuestions: 0,
    dueQuestions: 0,
    attemptCount: 0,
    correctCount: 0,
    wrongCount: 0,
    accuracyPercent: 0,
  },
  categories: [],
  critical: {
    questionCount: 0,
    learnedQuestions: 0,
    masteredQuestions: 0,
    wrongQuestions: 0,
  },
  exams: {
    totalExams: 0,
    passedExams: 0,
    failedExams: 0,
    passRatePercent: 0,
    averageScorePercent: 0,
  },
  recentExams: [],
  weakestQuestions: [],
};

function ratioPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StatisticsPage({ datasetStatus }: StatisticsPageProps) {
  const [snapshot, setSnapshot] = useState<StatisticsSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (datasetStatus.state !== "ready") {
      setSnapshot(EMPTY_SNAPSHOT);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);
    void repository
      .getStatistics()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch((loadError) => {
        if (!active) return;
        setSnapshot(EMPTY_SNAPSHOT);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [datasetStatus, refreshKey]);

  const weakSequence = useMemo(
    () => snapshot.weakestQuestions.map((item) => item.questionId),
    [snapshot.weakestQuestions],
  );

  if (selectedQuestionId !== null) {
    return (
      <LearningSession
        datasetStatus={datasetStatus}
        initialQuestionId={selectedQuestionId}
        questionSequence={weakSequence}
        backLabel="Thống kê"
        onBack={() => {
          setSelectedQuestionId(null);
          setRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  const { learning, critical, exams } = snapshot;
  const learnedPercent = ratioPercent(learning.learnedQuestions, learning.totalQuestions);
  const masteryPercent = ratioPercent(learning.masteredQuestions, learning.totalQuestions);
  const criticalLearnedPercent = ratioPercent(critical.learnedQuestions, critical.questionCount);
  const criticalMasteryPercent = ratioPercent(critical.masteredQuestions, critical.questionCount);

  return (
    <div className="page statistics-page" aria-busy={loading}>
      <div className="section-heading statistics-heading">
        <div>
          <span className="eyebrow">Learning analytics</span>
          <h1>Thống kê học tập</h1>
          <p>Dữ liệu được tổng hợp trực tiếp từ progress và lịch sử thi lưu offline trong SQLite.</p>
        </div>
        <div className="statistics-dataset-badge">
          {datasetStatus.state === "ready" ? `Dataset ${datasetStatus.version}` : "Chưa có dữ liệu"}
        </div>
      </div>

      {error && (
        <div className="data-warning" role="status">
          Không thể tổng hợp thống kê.
          <small>{error}</small>
        </div>
      )}

      <section className="statistics-kpi-grid">
        <article className="statistics-kpi-card">
          <span>Đã học</span>
          <strong>{learning.learnedQuestions} / {learning.totalQuestions}</strong>
          <small>{learnedPercent}% bộ câu hỏi</small>
        </article>
        <article className="statistics-kpi-card">
          <span>Mastery 4</span>
          <strong>{learning.masteredQuestions}</strong>
          <small>{masteryPercent}% đã thành thạo</small>
        </article>
        <article className="statistics-kpi-card">
          <span>Độ chính xác</span>
          <strong>{learning.accuracyPercent}%</strong>
          <small>{learning.correctCount} đúng / {learning.attemptCount} lượt</small>
        </article>
        <article className="statistics-kpi-card attention">
          <span>Đến hạn ôn</span>
          <strong>{learning.dueQuestions}</strong>
          <small>{learning.wrongCount} lượt trả lời sai</small>
        </article>
      </section>

      <section className="statistics-panel progress-overview-panel">
        <div className="statistics-panel-heading">
          <div>
            <span className="eyebrow">600 câu</span>
            <h2>Tiến độ tổng thể</h2>
          </div>
          <span>{learnedPercent}% đã học</span>
        </div>
        <div className="statistics-progress-track large">
          <i style={{ width: `${learnedPercent}%` }} />
        </div>
        <div className="statistics-progress-legend">
          <span><strong>{learning.learnedQuestions}</strong> đã học</span>
          <span><strong>{learning.masteredQuestions}</strong> thành thạo</span>
          <span><strong>{Math.max(0, learning.totalQuestions - learning.learnedQuestions)}</strong> chưa học</span>
        </div>
      </section>

      <section className="statistics-panel">
        <div className="statistics-panel-heading">
          <div>
            <span className="eyebrow">Theo chủ đề</span>
            <h2>Hiệu suất 6 nhóm kiến thức</h2>
          </div>
        </div>
        <div className="category-statistics-list">
          {snapshot.categories.map((category) => {
            const learned = ratioPercent(category.learnedQuestions, category.questionCount);
            return (
              <article className="category-statistics-row" key={category.code}>
                <div className="category-statistics-title">
                  <strong>{category.name}</strong>
                  <span>{category.learnedQuestions}/{category.questionCount} đã học</span>
                </div>
                <div className="statistics-progress-track">
                  <i style={{ width: `${learned}%` }} />
                </div>
                <div className="category-statistics-values">
                  <span>{category.accuracyPercent}% chính xác</span>
                  <span>{category.masteredQuestions} mastery</span>
                  <span>{category.wrongCount} lượt sai</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="statistics-two-column">
        <section className="statistics-panel critical-statistics-panel">
          <div className="statistics-panel-heading">
            <div>
              <span className="eyebrow">Điểm liệt</span>
              <h2>60 câu an toàn nghiêm trọng</h2>
            </div>
          </div>
          <div className="critical-stat-grid">
            <div><strong>{criticalLearnedPercent}%</strong><span>đã học</span></div>
            <div><strong>{criticalMasteryPercent}%</strong><span>thành thạo</span></div>
            <div><strong>{critical.wrongQuestions}</strong><span>câu từng sai</span></div>
          </div>
          <div className="statistics-progress-track">
            <i style={{ width: `${criticalLearnedPercent}%` }} />
          </div>
        </section>

        <section className="statistics-panel exam-statistics-panel">
          <div className="statistics-panel-heading">
            <div>
              <span className="eyebrow">Thi thử</span>
              <h2>Kết quả mô phỏng</h2>
            </div>
          </div>
          <div className="exam-stat-grid">
            <div><strong>{exams.totalExams}</strong><span>lần thi</span></div>
            <div><strong>{exams.passRatePercent}%</strong><span>tỷ lệ đạt</span></div>
            <div><strong>{exams.averageScorePercent}%</strong><span>điểm TB</span></div>
          </div>
          <small>{exams.passedExams} đạt · {exams.failedExams} chưa đạt</small>
        </section>
      </div>

      <section className="statistics-panel">
        <div className="statistics-panel-heading">
          <div>
            <span className="eyebrow">Ưu tiên</span>
            <h2>Câu yếu nhất</h2>
          </div>
          <span>{snapshot.weakestQuestions.length} câu</span>
        </div>
        {snapshot.weakestQuestions.length === 0 ? (
          <div className="statistics-empty">Chưa có đủ lịch sử làm bài để xếp hạng câu yếu.</div>
        ) : (
          <div className="weak-question-grid">
            {snapshot.weakestQuestions.map((item) => {
              const itemAccuracy = ratioPercent(item.correctCount, item.attemptCount);
              return (
                <button
                  type="button"
                  className="weak-question-card"
                  key={item.questionId}
                  onClick={() => setSelectedQuestionId(item.questionId)}
                >
                  <div>
                    <strong>Câu {item.questionId}</strong>
                    {item.critical && <span>Điểm liệt</span>}
                  </div>
                  <p>{item.content}</p>
                  <small>{itemAccuracy}% đúng · Sai {item.wrongCount} · Mastery {item.mastery}/4</small>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="statistics-panel">
        <div className="statistics-panel-heading">
          <div>
            <span className="eyebrow">Lịch sử</span>
            <h2>Các lần thi gần đây</h2>
          </div>
        </div>
        {snapshot.recentExams.length === 0 ? (
          <div className="statistics-empty">Chưa có lịch sử thi thử.</div>
        ) : (
          <div className="recent-exam-list">
            {snapshot.recentExams.map((exam) => (
              <article className="recent-exam-row" key={exam.id}>
                <div>
                  <strong>Hạng {exam.licenseType}</strong>
                  <span>{formatDateTime(exam.completedAt)}</span>
                </div>
                <div>
                  <strong>{exam.score ?? 0}/{exam.questionCount}</strong>
                  {exam.criticalFailed && <span className="critical-fail-label">Sai điểm liệt</span>}
                </div>
                <span className={exam.passed ? "exam-pass" : "exam-fail"}>
                  {exam.passed ? "Đạt" : "Chưa đạt"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
