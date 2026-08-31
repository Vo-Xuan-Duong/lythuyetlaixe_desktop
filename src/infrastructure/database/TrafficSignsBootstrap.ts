import { isTauri } from "@tauri-apps/api/core";
import {
  hasTrafficSignAssetVersion,
  installTrafficSignAssetArchive,
  removeTrafficSignAssetVersion,
} from "../assets/TrafficSignAssetStore";
import {
  getLocalTrafficSignsState,
  TrafficSignsImporter,
} from "./TrafficSignsImporter";
import {
  downloadTrafficSignsDataset,
  downloadVerifiedTrafficSignsBytes,
  fetchTrafficSignsManifest,
  MAX_TRAFFIC_SIGN_ASSET_BYTES,
  normalizeTrafficSignsSha256,
} from "./RemoteTrafficSignsSource";

export type TrafficSignsBootstrapStatus =
  | { state: "checking" }
  | { state: "browser" }
  | { state: "not-configured"; localVersion?: string; signCount?: number }
  | {
      state: "ready";
      version: string;
      signCount: number;
      source: "remote" | "local-cache";
      importStatus: "imported" | "up-to-date";
      offline?: boolean;
      warning?: string;
    }
  | { state: "error"; message: string };

const TRAFFIC_SIGNS_MANIFEST_URL = import.meta.env.VITE_TRAFFIC_SIGNS_MANIFEST_URL?.trim() ?? "";

function normalized(value?: string | null): string {
  return normalizeTrafficSignsSha256(value ?? "");
}

export async function bootstrapTrafficSigns(): Promise<TrafficSignsBootstrapStatus> {
  if (!isTauri()) return { state: "browser" };

  let localState;
  try {
    localState = await getLocalTrafficSignsState();
  } catch (error) {
    return { state: "error", message: `Không thể kiểm tra dữ liệu biển báo local: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!TRAFFIC_SIGNS_MANIFEST_URL) {
    if (localState.ready && localState.version) {
      return {
        state: "ready",
        version: localState.version,
        signCount: localState.signCount,
        source: "local-cache",
        importStatus: "up-to-date",
        offline: true,
      };
    }
    return { state: "not-configured" };
  }

  let pendingAssetVersion: string | null = null;
  try {
    const manifest = await fetchTrafficSignsManifest(TRAFFIC_SIGNS_MANIFEST_URL);
    const sameVersion = localState.ready && localState.version === manifest.version;
    const remoteAssetSha256 = manifest.assets ? normalized(manifest.assets.sha256) : "";
    const sameContent = normalized(localState.contentSha256) === normalized(manifest.sha256);
    const sameAssets = normalized(localState.assetSha256) === remoteAssetSha256;
    const sameSignCount = localState.signCount === manifest.signCount;
    const assetsInstalled = manifest.assets
      ? await hasTrafficSignAssetVersion(manifest.version)
      : true;

    // A published version is immutable. If its package identity changed, never
    // silently replace the local snapshot with different bytes under the same version.
    if (sameVersion && (!sameContent || !sameAssets)) {
      return {
        state: "ready",
        version: localState.version!,
        signCount: localState.signCount,
        source: "local-cache",
        importStatus: "up-to-date",
        warning: "Dataset biển báo remote đã thay đổi checksum nhưng không tăng version. App giữ snapshot local để bảo toàn tính bất biến.",
      };
    }

    if (sameVersion && sameContent && sameAssets && sameSignCount && assetsInstalled) {
      return {
        state: "ready",
        version: manifest.version,
        signCount: localState.signCount,
        source: "local-cache",
        importStatus: "up-to-date",
      };
    }

    // Same immutable package but damaged local state (missing rows/assets) is
    // allowed to self-heal by downloading the exact verified package again.
    const selfHealingSameVersion =
      sameVersion && sameContent && sameAssets && (!sameSignCount || !assetsInstalled);

    const dataset = await downloadTrafficSignsDataset(manifest);
    const requiresAssets = dataset.signs.some((sign) => Boolean(sign.image));
    if (requiresAssets && !manifest.assets) {
      throw new Error(`Traffic signs dataset ${manifest.version} references images but manifest has no asset package`);
    }

    if (manifest.assets) {
      const assetBytes = await downloadVerifiedTrafficSignsBytes(
        manifest.assets.url,
        manifest.assets.sha256,
        manifest.assets.sizeBytes,
        `traffic-sign-assets.zip ${manifest.version}`,
        180_000,
        MAX_TRAFFIC_SIGN_ASSET_BYTES,
      );
      await installTrafficSignAssetArchive(manifest.version, assetBytes, manifest.assets.fileCount);
      pendingAssetVersion = manifest.version;
    }

    let result;
    try {
      result = await new TrafficSignsImporter().import(dataset, {
        contentSha256: manifest.sha256,
        assetSha256: manifest.assets?.sha256 ?? null,
        force: selfHealingSameVersion && !sameSignCount,
      });
    } catch (error) {
      if (pendingAssetVersion) {
        await removeTrafficSignAssetVersion(pendingAssetVersion).catch(() => undefined);
        pendingAssetVersion = null;
      }
      throw error;
    }

    pendingAssetVersion = null;
    if (localState.version && localState.version !== result.version) {
      await removeTrafficSignAssetVersion(localState.version).catch(() => undefined);
    }

    return {
      state: "ready",
      version: result.version,
      signCount: result.signCount,
      source: "remote",
      importStatus: result.status,
      warning: selfHealingSameVersion
        ? "Đã tự phục hồi snapshot biển báo local từ package cùng version đã xác minh."
        : undefined,
    };
  } catch (error) {
    if (pendingAssetVersion) {
      await removeTrafficSignAssetVersion(pendingAssetVersion).catch(() => undefined);
    }
    if (localState.ready && localState.version) {
      return {
        state: "ready",
        version: localState.version,
        signCount: localState.signCount,
        source: "local-cache",
        importStatus: "up-to-date",
        offline: true,
        warning: `Không thể cập nhật biển báo: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return { state: "error", message: `Không thể tải dataset biển báo lần đầu: ${error instanceof Error ? error.message : String(error)}` };
  }
}
