import { useCallback, useEffect, useState } from "react";
import {
  bootstrapTrafficSigns,
  type TrafficSignsBootstrapStatus,
} from "../infrastructure/database/TrafficSignsBootstrap";

export interface TrafficSignsBootstrapController {
  status: TrafficSignsBootstrapStatus;
  retry: () => void;
}

export function useTrafficSignsBootstrap(): TrafficSignsBootstrapController {
  const [status, setStatus] = useState<TrafficSignsBootstrapStatus>({ state: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus({ state: "checking" });

    void bootstrapTrafficSigns().then((nextStatus) => {
      if (active) setStatus(nextStatus);
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
