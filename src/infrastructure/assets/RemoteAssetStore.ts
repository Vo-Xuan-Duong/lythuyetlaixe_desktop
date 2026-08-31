import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  remove,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { unzipSync } from "fflate";

const ASSET_ROOT = "dataset-assets";
const MAX_ASSET_FILES = 2_000;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const resolvedUrlCache = new Map<string, Promise<string>>();

function sanitizeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);

  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe asset path: ${value}`);
  }

  return segments.join("/");
}

function assertImageAsset(path: string): void {
  const lower = path.toLowerCase();
  const extension = [...ALLOWED_IMAGE_EXTENSIONS].find((candidate) => lower.endsWith(candidate));
  if (!extension) {
    throw new Error(`Unsupported asset type: ${path}`);
  }
}

function parentDirectory(path: string): string | undefined {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : undefined;
}

export interface AssetInstallResult {
  version: string;
  fileCount: number;
  uncompressedBytes: number;
}

export function inspectAssetArchive(
  zipBytes: Uint8Array,
  expectedFileCount?: number,
): Array<{ path: string; bytes: Uint8Array }> {
  const archive = unzipSync(zipBytes);
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  let totalBytes = 0;

  for (const [rawPath, bytes] of Object.entries(archive)) {
    if (rawPath.endsWith("/")) continue;
    const path = sanitizeRelativePath(rawPath);
    assertImageAsset(path);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("Asset archive exceeds maximum uncompressed size");
    }
    files.push({ path, bytes });
    if (files.length > MAX_ASSET_FILES) {
      throw new Error("Asset archive contains too many files");
    }
  }

  if (expectedFileCount !== undefined && files.length !== expectedFileCount) {
    throw new Error(
      `Asset file count mismatch: expected ${expectedFileCount}, found ${files.length}`,
    );
  }

  return files;
}

export async function installAssetArchive(
  version: string,
  zipBytes: Uint8Array,
  expectedFileCount?: number,
): Promise<AssetInstallResult> {
  const safeVersion = sanitizeRelativePath(version);
  if (safeVersion.includes("/")) {
    throw new Error(`Dataset version cannot contain path separators: ${version}`);
  }

  const files = inspectAssetArchive(zipBytes, expectedFileCount);
  const versionRoot = `${ASSET_ROOT}/${safeVersion}`;

  if (await exists(versionRoot, { baseDir: BaseDirectory.AppData })) {
    await remove(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  await mkdir(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true });

  let uncompressedBytes = 0;
  try {
    for (const file of files) {
      const destination = `${versionRoot}/${file.path}`;
      const parent = parentDirectory(destination);
      if (parent) {
        await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
      }
      await writeFile(destination, file.bytes, { baseDir: BaseDirectory.AppData });
      uncompressedBytes += file.bytes.byteLength;
    }
  } catch (error) {
    await remove(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => undefined);
    throw error;
  }

  for (const key of [...resolvedUrlCache.keys()]) {
    if (key.startsWith(`${safeVersion}:`)) resolvedUrlCache.delete(key);
  }

  return {
    version: safeVersion,
    fileCount: files.length,
    uncompressedBytes,
  };
}

export function resolveAssetUrl(version: string, imagePath: string): Promise<string> {
  const safeVersion = sanitizeRelativePath(version);
  const safeImagePath = sanitizeRelativePath(imagePath);
  const key = `${safeVersion}:${safeImagePath}`;
  const cached = resolvedUrlCache.get(key);
  if (cached) return cached;

  const resolved = (async () => {
    const relativePath = `${ASSET_ROOT}/${safeVersion}/${safeImagePath}`;
    const absolutePath = await join(await appDataDir(), relativePath);
    return convertFileSrc(absolutePath);
  })();

  resolvedUrlCache.set(key, resolved);
  return resolved;
}
