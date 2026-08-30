import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LearningPage } from "../features/learning/LearningPage";
import { FeaturePlaceholder } from "../features/placeholder/FeaturePlaceholder";
import type { AppSection } from "./navigation";
import { useDatasetBootstrap } from "./useDatasetBootstrap";

export function App() {
  const [section, setSection] = useState<AppSection>("dashboard");
  const datasetStatus = useDatasetBootstrap();

  const content = useMemo(() => {
    switch (section) {
      case "dashboard":
        return <DashboardPage onNavigate={setSection} />;
      case "learning":
        return <LearningPage datasetStatus={datasetStatus} />;
      case "critical":
        return (
          <FeaturePlaceholder
            eyebrow="Luyện tập chuyên biệt"
            title="60 câu điểm liệt"
            description="Khu vực này sẽ dùng dataset chính thức để luyện riêng các câu mất an toàn giao thông nghiêm trọng và theo dõi tiến độ độc lập."
          />
        );
      case "exam":
        return (
          <FeaturePlaceholder
            eyebrow="Exam engine"
            title="Thi thử"
            description="Đề thi sẽ được sinh từ ExamConfig theo hạng GPLX và thời gian hiệu lực, không hard-code số câu hoặc điểm đạt trong UI."
          />
        );
      case "mistakes":
        return (
          <FeaturePlaceholder
            eyebrow="Review queue"
            title="Câu làm sai"
            description="Các câu trả lời sai sẽ được lưu trong SQLite và ưu tiên đưa lại vào hàng đợi ôn tập."
          />
        );
      case "bookmarks":
        return (
          <FeaturePlaceholder
            eyebrow="Bookmark"
            title="Đã đánh dấu"
            description="Lưu các câu cần xem lại. Dữ liệu bookmark sẽ được giữ offline trên thiết bị."
          />
        );
      case "statistics":
        return (
          <FeaturePlaceholder
            eyebrow="Learning analytics"
            title="Thống kê"
            description="Theo dõi độ chính xác theo chủ đề, câu yếu, lịch sử thi và tỷ lệ đạt."
          />
        );
      case "settings":
        return (
          <FeaturePlaceholder
            eyebrow="Application"
            title="Cài đặt"
            description="Phiên bản dataset, tùy chọn giao diện, cấu hình học và các thiết lập platform sẽ được đặt tại đây."
          />
        );
    }
  }, [datasetStatus, section]);

  return (
    <AppShell activeSection={section} onNavigate={setSection}>
      {content}
    </AppShell>
  );
}
