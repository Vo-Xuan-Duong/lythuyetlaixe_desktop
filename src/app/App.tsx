import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LearningPage } from "../features/learning/LearningPage";
import { QuestionCollectionPage } from "../features/learning/QuestionCollectionPage";
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
          <QuestionCollectionPage
            datasetStatus={datasetStatus}
            eyebrow="Luyện tập chuyên biệt"
            title="60 câu điểm liệt"
            description="Luyện riêng các tình huống mất an toàn giao thông nghiêm trọng. Trong chế độ học, đáp án vẫn được chấm và lưu progress như các câu khác."
            criticalOnly
            emptyTitle="Chưa có câu điểm liệt trong dataset hiện tại."
            emptyDescription="Kiểm tra lại dataset production và danh sách 60 câu điểm liệt đã được xác minh."
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
          <QuestionCollectionPage
            datasetStatus={datasetStatus}
            eyebrow="Review queue"
            title="Câu làm sai"
            description="Các câu từng trả lời sai được lấy trực tiếp từ SQLite và ưu tiên để ôn lại."
            filter="wrong"
            emptyTitle="Chưa có câu làm sai."
            emptyDescription="Các câu trả lời sai sẽ tự xuất hiện tại đây sau khi bạn luyện tập."
          />
        );
      case "bookmarks":
        return (
          <QuestionCollectionPage
            datasetStatus={datasetStatus}
            eyebrow="Bookmark"
            title="Đã đánh dấu"
            description="Danh sách câu bạn chủ động lưu để xem lại, được giữ offline trên thiết bị."
            filter="bookmarked"
            emptyTitle="Chưa có câu nào được đánh dấu."
            emptyDescription="Bấm biểu tượng ngôi sao trong màn hình học để thêm câu vào danh sách này."
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
