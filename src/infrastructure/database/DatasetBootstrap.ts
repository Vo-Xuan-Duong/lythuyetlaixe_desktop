import { isTauri } from "@tauri-apps/api/core";
import {
  installAssetArchive,
  removeAssetVersion,
} from "../assets/RemoteAssetStore";
import {
  DatasetImporter,
  getLocalDatasetState,
  migrateLegacyContentChecksum,
} from "./DatasetImporter";
import {
  downloadDataset,
  downloadVerifiedBytes,
  fetchDatasetManifest,
  MAX_ASSET_ARCHIVE_BYTES,
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

// VITE_DATASET_MANIFEST_URL remains a compatibility fallback for local builds
// created before the question/sign datasets were split.
const QUESTIONS_MANIFEST_URL =
  import.meta.env.VITE_QUESTIONS_MANIFEST_URL?.trim() ||
  import.meta.env.VITE_DATASET_MANIFEST_URL?.trim() ||
  "";

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

  if (!QUESTIONS_MANIFEST_URL) {
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
      message: "Chưa cấu hình VITE_QUESTIONS_MANIFEST_URL để tải bộ 600 câu lần đầu.",
    };
  }

  let pendingAssetVersion: string | null = null;

  try {
    const manifest = await fetchDatasetManifest(QUESTIONS_MANIFEST_URL);

    if (
      localState.ready &&
      localState.version === manifest.version &&
      !normalizedSha256(localState.contentSha256)
    ) {
      const migrated = await migrateLegacyContentChecksum(manifest.sha256);
      if (migrated) {
        localState = await getLocalDatasetState();
      }
    }

    const sameVersion = localState.ready && localState.version === manifest.version;
    const localHasContentChecksum = Boolean(normalizedSha256(localState.contentSha256));
    const legacyProvenanceMatches =
      sameVersion &&
      !localHasContentChecksum &&
      normalizedSha256(localState.sourceSha256) === normalizedSha256(manifest.sourceSha256);
    const sameDatasetChecksum =
      normalizedSha256(localState.contentSha256) === normalizedSha256(manifest.sha256);
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

    if (sameVersion && !legacyProvenanceMatches && (!sameDatasetChecksum || !sameAssetChecksum)) {
      return {
        state: "ready",
        version: localState.version!,
        importStatus: "up-to-date",
        source: "local-cache",
        warning:
          "Package 600 câu remote đã thay đổi nhưng không tăng version, hoặc local package chưa có checksum/provenance đủ để xác minh. Ứng dụng giữ nguyên version local để bảo toàn tính bất biến.",
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
        `question asset package ${manifest.version}`,
        180_000,
        MAX_ASSET_ARCHIVE_BYTES,
      );
      await installAssetArchive(manifest.version, assetBytes, manifest.assets.fileCount);
      pendingAssetVersion = manifest.version;
    }

    let result;
    try {
      result = await new DatasetImporter().import(dataset, {
        contentSha256: manifest.sha256,
        assetSha256: manifest.assets?.sha256 ?? null,
      });
    } catch (error) {
      if (pendingAssetVersion) {
        await removeAssetVersion(pendingAssetVersion).catch(() => undefined);
        pendingAssetVersion = null;
      }
      throw error;
    }

    pendingAssetVersion = null;

    if (localState.version && localState.version !== result.version) {
      await removeAssetVersion(localState.version).catch(() => undefined);
    }

    return {
      state: "ready",
      version: result.version,
      importStatus: result.status,
      source: "remote",
      warning: legacyProvenanceMatches
        ? "Đã revalidate package 600 câu local legacy và bổ sung content checksum."
        : undefined,
    };
  } catch (error) {
    if (pendingAssetVersion) {
      await removeAssetVersion(pendingAssetVersion).catch(() => undefined);
    }

    if (localState.ready && localState.version) {
      return {
        state: "ready",
        version: localState.version,
        importStatus: "up-to-date",
        source: "local-cache",
        offline: true,
        warning: `Không thể cập nhật bộ 600 câu: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      state: "error",
      reason: "first-download-failed",
      message: `Không thể tải bộ 600 câu lần đầu: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
