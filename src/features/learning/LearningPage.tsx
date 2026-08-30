import { useState } from "react";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import { LearningCatalogPage } from "./LearningCatalogPage";
import { LearningSession } from "./LearningSession";

interface LearningPageProps {
  datasetStatus: DatasetBootstrapStatus;
}

export function LearningPage({ datasetStatus }: LearningPageProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);

  if (selectedQuestionId !== null) {
    return (
      <LearningSession
        datasetStatus={datasetStatus}
        initialQuestionId={selectedQuestionId}
        onBack={() => setSelectedQuestionId(null)}
      />
    );
  }

  return (
    <LearningCatalogPage
      datasetStatus={datasetStatus}
      onOpenQuestion={setSelectedQuestionId}
    />
  );
}
