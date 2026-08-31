import { useEffect, useRef } from "react";
import { registerBackHandler, type BackHandler } from "../infrastructure/navigation/BackNavigation";

export function useNativeBackHandler(
  handler: BackHandler,
  options: { enabled?: boolean; priority?: number } = {},
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const enabled = options.enabled ?? true;
  const priority = options.priority ?? 0;

  useEffect(() => {
    if (!enabled) return;
    return registerBackHandler(() => handlerRef.current(), priority);
  }, [enabled, priority]);
}
