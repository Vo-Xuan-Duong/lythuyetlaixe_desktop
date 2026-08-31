import { isTauri } from "@tauri-apps/api/core";
import { installAssetArchive } from "../assets/RemoteAssetStore";
import {
  DatasetImporter,
  getLocalDatasetState,
} from "./DatasetImporter";
import {
  downloadDataset,
  downloadVerifiedBytes,
  fetchDatasetManifest,
  normalizeSha256,
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
      warning?: string;
    }
  | {
      state: "error";
      message: string;
      reason?: "remote-not-configured" | "first-download-failed";
    };

const DATASET_MANIFEST_URL = import.meta.env.VITE_DATASET_MANIFEST_URL?.trim() ?? "";

function normalizedSha256(value?: string | null): string {
  return normalizeSha256(value ?? "");
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
    const sameDatasetChecksum =
      normalizedSha256(localState.sourceSha256) === normalizedSha256(manifest.sha256);
    const remoteAssetSha256 = manifest.assets ? normalizedSha256(manifest.assets.sha256) : "";
    const sameAssetChecksum = normalizedSha256(localState.assetSha256) === remoteAssetSha256;

    if (sameVersion && sameDatasetChecksum && sameAssetChecksum) {
      return {
        state: "ready",
        version: manifest.version,
        importStatus: "up-to-date",
        source: "local-cache",
      };
    }

    if (sameVersion && (!sameDatasetChecksum || !sameAssetChecksum)) {
      return {
        state: "ready",
        version: localState.version!,
        importStatus: "up-to-date",
        source: "local-cache",
        warning: "Remote dataset changed without a version bump. Local immutable version was kept.",
      };
    }

    const dataset = await downloadDataset(manifest);
    const requiresAssets = dataset.questions.some((question) => Boolean(question.image));

    if (requiresAssets && !manifest.assets) {
      throw new Error(`Dataset ${manifest.version} references images but manifest has no asset package`);
    }

    if (manifest.assets) {
      const assetBytes = await downloadVerifiedBytes(
        manifest.assets.url,
        manifest.assets.sha256,
        manifest.assets.sizeBytes,
        `asset package ${manifest.version}`,
        180_000,
      );
      await installAssetArchive(manifest.version, assetBytes, manifest.assets.fileCount);
    }

    const result = await new DatasetImporter().import(dataset, {
      assetSha256: manifest.assets?.sha256 ?? null,
    });

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
        warning: `Không thể cập nhật dữ liệu: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      state: "error",
      reason: "first-download-failed",
      message: `Không thể tải bộ dữ liệu lần đầu: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
