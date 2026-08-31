import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CriticalPage } from "../features/critical/CriticalPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ExamPage } from "../features/exam/ExamPage";
import { LearningPage } from "../features/learning/LearningPage";
import { QuestionCollectionPage } from "../features/learning/QuestionCollectionPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { DatasetSetupPage } from "../features/setup/DatasetSetupPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { StatisticsPage } from "../features/statistics/StatisticsPage";
import type { AppSection } from "./navigation";
import { useDatasetBootstrap } from "./useDatasetBootstrap";

export function App() {
  const [section, setSection] = useState<AppSection>("dashboard");
  const { status: datasetStatus, retry: retryDataset } = useDatasetBootstrap();

  const content = useMemo(() => {
    switch (section) {
      case "dashboard":
        return <DashboardPage datasetStatus={datasetStatus} onNavigate={setSection} />;
      case "learning":
        return <LearningPage datasetStatus={datasetStatus} />;
      case "critical":
        return <CriticalPage datasetStatus={datasetStatus} />;
      case "exam":
        return <ExamPage datasetStatus={datasetStatus} />;
      case "mistakes":
        return <ReviewPage datasetStatus={datasetStatus} />;
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
        return <StatisticsPage datasetStatus={datasetStatus} />;
      case "settings":
        return <SettingsPage datasetStatus={datasetStatus} onCheckDataset={retryDataset} />;
    }
  }, [datasetStatus, retryDataset, section]);

  if (datasetStatus.state === "checking" || datasetStatus.state === "error") {
    return <DatasetSetupPage status={datasetStatus} onRetry={retryDataset} />;
  }

  return (
    <AppShell activeSection={section} onNavigate={setSection}>
      {content}
    </AppShell>
  );
}
