import { useCallback, useEffect, useState } from "react";
import {
  bootstrapTrafficSigns,
  type TrafficSignsBootstrapStatus,
} from "../infrastructure/database/TrafficSignsBootstrap";

export function useTrafficSignsBootstrap() {
  const [status, setStatus] = useState<TrafficSignsBootstrapStatus>({ state: "checking" });

  const retry = useCallback(() => {
    setStatus({ state: "checking" });
    void bootstrapTrafficSigns().then(setStatus);
  }, []);

  useEffect(() => {
    let active = true;
    void bootstrapTrafficSigns().then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    return () => {
      active = false;
    };
  }, []);

  return { status, retry };
}
