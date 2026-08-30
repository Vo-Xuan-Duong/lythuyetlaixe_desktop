import type { CSSProperties } from "react";
import type { AppSection } from "../../app/navigation";
import { demoCategories, demoSummary } from "../../data/demo";

interface DashboardPageProps {
  onNavigate: (section: AppSection) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const progress = Math.round((demoSummary.learnedQuestions / demoSummary.totalQuestions) * 100);
  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;

  return (
    <div className="page dashboard-page">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Lộ trình 600 câu</span>
          <h1>Học đúng phần yếu, thi thử đúng cấu hình.</h1>
          <p>
            Foundation hiện dùng dữ liệu demo. Bộ câu hỏi chính thức sẽ được đưa vào sau khi hoàn thành pipeline kiểm tra dữ liệu.
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
        <div className="progress-ring" style={progressStyle}>
          <div>
            <strong>{progress}%</strong>
            <span>tiến độ</span>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>Đã học</span>
          <strong>{demoSummary.learnedQuestions}/600</strong>
          <small>câu hỏi</small>
        </article>
        <article className="stat-card critical-card">
          <span>Điểm liệt</span>
          <strong>{demoSummary.criticalMastered}/60</strong>
          <small>đã nắm vững</small>
        </article>
        <article className="stat-card">
          <span>Câu sai</span>
          <strong>{demoSummary.wrongQuestions}</strong>
          <small>cần ôn lại</small>
        </article>
        <article className="stat-card">
          <span>Đánh dấu</span>
          <strong>{demoSummary.bookmarkedQuestions}</strong>
          <small>cần xem lại</small>
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
          {demoCategories.map((category, index) => (
            <button className="category-card" key={category.id} onClick={() => onNavigate("learning")} type="button">
              <span className="category-number">0{index + 1}</span>
              <strong>{category.name}</strong>
              <span>{category.questionCount} câu</span>
              <div className="mini-progress"><i style={{ width: "0%" }} /></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
