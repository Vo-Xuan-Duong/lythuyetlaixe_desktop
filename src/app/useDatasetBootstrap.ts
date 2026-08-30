import { useEffect, useState } from "react";
import {
  bootstrapDataset,
  type DatasetBootstrapStatus,
} from "../infrastructure/database/DatasetBootstrap";

export function useDatasetBootstrap(): DatasetBootstrapStatus {
  const [status, setStatus] = useState<DatasetBootstrapStatus>({ state: "checking" });

  useEffect(() => {
    let active = true;

    void bootstrapDataset().then((result) => {
      if (active) setStatus(result);
    });

    return () => {
      active = false;
    };
  }, []);

  return status;
}
