import { isTauri } from "@tauri-apps/api/core";
import {
  DatasetImporter,
  getLocalDatasetState,
} from "./DatasetImporter";
import {
  downloadDataset,
  fetchDatasetManifest,
} from "./RemoteDatasetSource";

export type DatasetBootstrapStatus =
  | { state: "checking" }
  | { state: "demo"; reason: "browser" }
  | {
      state: "ready";
      version: string;
      importStatus: "imported" | "up-to-date";
      source: "remote" | "local-cache";
      offline?: boolean;
    }
  | {
      state: "error";
      message: string;
      reason?: "remote-not-configured" | "first-download-failed";
    };

const DATASET_MANIFEST_URL = import.meta.env.VITE_DATASET_MANIFEST_URL?.trim() ?? "";

function normalizedSha256(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
}

export async function bootstrapDataset(): Promise<DatasetBootstrapStatus> {
  if (!isTauri()) {
    return { state: "demo", reason: "browser" };
  }

  let localState;
  try {
    localState = await getLocalDatasetState();
  } catch (error) {
    return {
      state: "error",
      message: `Không thể kiểm tra dataset local: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!DATASET_MANIFEST_URL) {
    if (localState.ready && localState.version) {
      return {
        state: "ready",
        version: localState.version,
        importStatus: "up-to-date",
        source: "local-cache",
        offline: true,
      };
    }

    return {
      state: "error",
      reason: "remote-not-configured",
      message: "Chưa cấu hình VITE_DATASET_MANIFEST_URL để tải bộ dữ liệu lần đầu.",
    };
  }

  try {
    const manifest = await fetchDatasetManifest(DATASET_MANIFEST_URL);
    const sameVersion = localState.ready && localState.version === manifest.version;
    const sameChecksum =
      normalizedSha256(localState.sourceSha256) === normalizedSha256(manifest.sha256);

    if (sameVersion && sameChecksum) {
      return {
        state: "ready",
        version: manifest.version,
        importStatus: "up-to-date",
        source: "local-cache",
      };
    }

    const dataset = await downloadDataset(manifest);
    const result = await new DatasetImporter().import(dataset);
    return {
      state: "ready",
      version: result.version,
      importStatus: result.status,
      source: "remote",
    };
  } catch (error) {
    if (localState.ready && localState.version) {
      return {
        state: "ready",
        version: localState.version,
        importStatus: "up-to-date",
        source: "local-cache",
        offline: true,
      };
    }

    return {
      state: "error",
      reason: "first-download-failed",
      message: `Không thể tải bộ dữ liệu lần đầu: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
