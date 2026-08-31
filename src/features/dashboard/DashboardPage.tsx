import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AppSection } from "../../app/navigation";
import { demoCategories, demoSummary } from "../../data/demo";
import type { StatisticsSnapshot } from "../../domain/entities/reviewStatistics";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { SqliteReviewStatisticsRepository } from "../../infrastructure/repositories/SqliteReviewStatisticsRepository";

interface DashboardPageProps {
  datasetStatus: DatasetBootstrapStatus;
  onNavigate: (section: AppSection) => void;
}

const repository = new SqliteReviewStatisticsRepository();

export function DashboardPage({ datasetStatus, onNavigate }: DashboardPageProps) {
  const [snapshot, setSnapshot] = useState<StatisticsSnapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (datasetStatus.state !== "ready") {
      setSnapshot(undefined);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);
    void repository
      .getStatistics({ recentExamLimit: 5 })
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((loadError) => {
        if (!active) return;
        setSnapshot(undefined);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [datasetStatus]);

  const isProduction = datasetStatus.state === "ready" && snapshot !== undefined;
  const learnedQuestions = snapshot?.learning.learnedQuestions ?? demoSummary.learnedQuestions;
  const totalQuestions = snapshot?.learning.totalQuestions ?? demoSummary.totalQuestions;
  const criticalMastered = snapshot?.critical.masteredQuestions ?? demoSummary.criticalMastered;
  const progress = totalQuestions > 0 ? Math.round((learnedQuestions / totalQuestions) * 100) : 0;
  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;

  const categories = useMemo(() => {
    if (!snapshot) return demoCategories.map((category) => ({ ...category, learnedCount: 0 }));
    return snapshot.categories.map((category) => ({
      id: category.code,
      name: category.name,
      questionCount: category.questionCount,
      learnedCount: category.learnedQuestions,
    }));
  }, [snapshot]);

  return (
    <div className="page dashboard-page">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Lộ trình 600 câu</span>
          <h1>Học đúng phần yếu, thi thử đúng cấu hình.</h1>
          <p>
            {isProduction
              ? `Đang sử dụng dataset ${datasetStatus.version} từ SQLite local. Tiến độ, câu yếu và lịch sử thi được lưu offline trên thiết bị.`
              : "Đang dùng dữ liệu demo cho giao diện browser. Khi chạy Tauri với dataset production, Dashboard sẽ đọc toàn bộ số liệu từ SQLite."}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onNavigate("learning")} type="button">
              Bắt đầu học
            </button>
            <button className="secondary-button" onClick={() => onNavigate("exam")} type="button">
              Thi thử
            </button>
          </div>
        </div>
        <div className="progress-ring" style={progressStyle} aria-label={`Tiến độ ${progress}%`}>
          <div>
            <strong>{loading ? "…" : `${progress}%`}</strong>
            <span>tiến độ</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="data-warning" role="status">
          Không thể tải thống kê Dashboard từ SQLite.
          <small>{error}</small>
        </div>
      )}

      <section className="stat-grid">
        <article className="stat-card">
          <span>Đã học</span>
          <strong>{learnedQuestions}/{totalQuestions}</strong>
          <small>câu hỏi</small>
        </article>
        <article className="stat-card critical-card">
          <span>Điểm liệt</span>
          <strong>{criticalMastered}/60</strong>
          <small>mastery 4</small>
        </article>
        <article className="stat-card">
          <span>Đến hạn ôn</span>
          <strong>{snapshot?.learning.dueQuestions ?? 0}</strong>
          <small>cần ưu tiên</small>
        </article>
        <article className="stat-card">
          <span>Độ chính xác</span>
          <strong>{snapshot ? `${snapshot.learning.accuracyPercent}%` : "—"}</strong>
          <small>{snapshot ? `${snapshot.learning.attemptCount} lượt trả lời` : "chờ dữ liệu thật"}</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Theo chủ đề</span>
            <h2>6 nhóm kiến thức</h2>
          </div>
          <button className="text-button" onClick={() => onNavigate("learning")} type="button">
            Xem tất cả →
          </button>
        </div>

        <div className="category-grid">
          {categories.map((category, index) => {
            const categoryProgress = category.questionCount > 0
              ? Math.round((category.learnedCount / category.questionCount) * 100)
              : 0;
            return (
              <button className="category-card" key={category.id} onClick={() => onNavigate("learning")} type="button">
                <span className="category-number">0{index + 1}</span>
                <strong>{category.name}</strong>
                <span>{category.learnedCount}/{category.questionCount} câu đã học</span>
                <div className="mini-progress"><i style={{ width: `${categoryProgress}%` }} /></div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
