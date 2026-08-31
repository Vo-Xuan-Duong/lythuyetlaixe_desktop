import { useCallback, useEffect, useState } from "react";
import {
  bootstrapDataset,
  type DatasetBootstrapStatus,
} from "../infrastructure/database/DatasetBootstrap";

export interface DatasetBootstrapController {
  status: DatasetBootstrapStatus;
  retry: () => void;
}

export function useDatasetBootstrap(): DatasetBootstrapController {
  const [status, setStatus] = useState<DatasetBootstrapStatus>({ state: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus({ state: "checking" });

    void bootstrapDataset().then((result) => {
      if (active) setStatus(result);
    });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return { status, retry };
}
