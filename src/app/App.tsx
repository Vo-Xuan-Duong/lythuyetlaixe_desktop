import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CriticalPage } from "../features/critical/CriticalPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ExamPage } from "../features/exam/ExamPage";
import { LearningPage } from "../features/learning/LearningPage";
import { QuestionCollectionPage } from "../features/learning/QuestionCollectionPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { DatasetSetupPage } from "../features/setup/DatasetSetupPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TrafficSignsKnowledgePage } from "../features/signs/TrafficSignsKnowledgePage";
import { StatisticsPage } from "../features/statistics/StatisticsPage";
import { restoreReviewReminder } from "../infrastructure/notifications/ReviewReminderService";
import { getReviewReminderPreference } from "../infrastructure/preferences/AppPreferences";
import type { AppSection } from "./navigation";
import { useDatasetBootstrap } from "./useDatasetBootstrap";
import { useNativeBackHandler } from "./useNativeBackHandler";

const MAX_NAVIGATION_HISTORY = 20;

export function App() {
  const [sectionHistory, setSectionHistory] = useState<AppSection[]>(["dashboard"]);
  const { status: datasetStatus, retry: retryDataset } = useDatasetBootstrap();
  const section = sectionHistory[sectionHistory.length - 1] ?? "dashboard";

  useEffect(() => {
    let active = true;
    void getReviewReminderPreference()
      .then((preference) => {
        if (!active || !preference.enabled) return undefined;
        return restoreReviewReminder(preference);
      })
      .catch(() => {
        // Reminder restoration is best-effort and must never block app startup.
      });

    return () => {
      active = false;
    };
  }, []);

  const navigate = useCallback((nextSection: AppSection) => {
    setSectionHistory((history) => {
      const current = history[history.length - 1] ?? "dashboard";
      if (current === nextSection) return history;
      return [...history, nextSection].slice(-MAX_NAVIGATION_HISTORY);
    });
  }, []);

  const navigateBack = useCallback(() => {
    setSectionHistory((history) => (history.length > 1 ? history.slice(0, -1) : history));
  }, []);

  useNativeBackHandler(navigateBack, {
    enabled: sectionHistory.length > 1,
    priority: 10,
  });

  const content = useMemo(() => {
    // Built-in knowledge and settings remain reachable even when first-run
    // dataset download is unavailable. Data-dependent features keep the setup gate.
    if (section === "signs") {
      return <TrafficSignsKnowledgePage datasetStatus={datasetStatus} onNavigate={navigate} />;
    }
    if (section === "settings") {
      return <SettingsPage datasetStatus={datasetStatus} onCheckDataset={retryDataset} />;
    }
    if (datasetStatus.state === "checking" || datasetStatus.state === "error") {
      return <DatasetSetupPage status={datasetStatus} onRetry={retryDataset} />;
    }

    switch (section) {
      case "dashboard":
        return <DashboardPage datasetStatus={datasetStatus} onNavigate={navigate} />;
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
    }
  }, [datasetStatus, navigate, retryDataset, section]);

  return (
    <AppShell activeSection={section} onNavigate={navigate}>
      {content}
    </AppShell>
  );
}
