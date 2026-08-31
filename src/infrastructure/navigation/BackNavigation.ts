import { onBackButtonPress } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

export type BackHandler = () => void;

interface RegisteredHandler {
  id: number;
  priority: number;
  handler: BackHandler;
}

let nextId = 1;
let handlers: RegisteredHandler[] = [];
let listenerCleanup: (() => void) | null = null;
let listenerStarting = false;

function activeHandler(): RegisteredHandler | undefined {
  return [...handlers].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return right.id - left.id;
  })[0];
}

async function ensureNativeListener(): Promise<void> {
  if (!isTauri() || listenerCleanup || listenerStarting || handlers.length === 0) return;

  listenerStarting = true;
  try {
    const listener = await onBackButtonPress(() => {
      activeHandler()?.handler();
    });
    listenerCleanup = () => listener.unregister();

    if (handlers.length === 0) {
      listenerCleanup();
      listenerCleanup = null;
    }
  } catch {
    // Android back integration is progressive enhancement. Desktop/browser continue normally.
  } finally {
    listenerStarting = false;
  }
}

function releaseNativeListenerIfIdle(): void {
  if (handlers.length !== 0 || !listenerCleanup) return;
  listenerCleanup();
  listenerCleanup = null;
}

export function registerBackHandler(handler: BackHandler, priority = 0): () => void {
  const entry: RegisteredHandler = {
    id: nextId++,
    priority,
    handler,
  };
  handlers.push(entry);
  void ensureNativeListener();

  return () => {
    handlers = handlers.filter((item) => item.id !== entry.id);
    releaseNativeListenerIfIdle();
  };
}
