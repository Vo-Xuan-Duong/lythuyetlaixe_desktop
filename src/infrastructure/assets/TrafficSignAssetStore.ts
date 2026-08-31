import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, exists, mkdir, remove, writeFile } from "@tauri-apps/plugin-fs";
import { unzipSync } from "fflate";

const ASSET_ROOT = "traffic-sign-assets";
const MAX_ASSET_FILES = 2_000;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
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
    throw new Error(`Unsafe traffic sign asset path: ${value}`);
  }
  return segments.join("/");
}

function safeVersion(value: string): string {
  const normalized = sanitizeRelativePath(value);
  if (normalized.includes("/")) throw new Error(`Traffic sign version cannot contain path separators: ${value}`);
  return normalized;
}

function assertAssetType(path: string): void {
  const lower = path.toLowerCase();
  if (![...ALLOWED_EXTENSIONS].some((extension) => lower.endsWith(extension))) {
    throw new Error(`Unsupported traffic sign asset type: ${path}`);
  }
}

function parentDirectory(path: string): string | undefined {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : undefined;
}

function clearVersionCache(version: string): void {
  for (const key of [...resolvedUrlCache.keys()]) {
    if (key.startsWith(`${version}:`)) resolvedUrlCache.delete(key);
  }
}

export async function hasTrafficSignAssetVersion(version: string): Promise<boolean> {
  const versionName = safeVersion(version);
  return exists(`${ASSET_ROOT}/${versionName}`, { baseDir: BaseDirectory.AppData });
}

export async function installTrafficSignAssetArchive(
  version: string,
  zipBytes: Uint8Array,
  expectedFileCount?: number,
): Promise<void> {
  const versionName = safeVersion(version);
  const archive = unzipSync(zipBytes);
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  let totalBytes = 0;

  for (const [rawPath, bytes] of Object.entries(archive)) {
    if (rawPath.endsWith("/")) continue;
    const path = sanitizeRelativePath(rawPath);
    assertAssetType(path);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("Traffic sign assets exceed maximum uncompressed size");
    files.push({ path, bytes });
    if (files.length > MAX_ASSET_FILES) throw new Error("Traffic sign asset archive contains too many files");
  }

  if (expectedFileCount !== undefined && files.length !== expectedFileCount) {
    throw new Error(`Traffic sign asset file count mismatch: expected ${expectedFileCount}, found ${files.length}`);
  }

  const versionRoot = `${ASSET_ROOT}/${versionName}`;
  if (await exists(versionRoot, { baseDir: BaseDirectory.AppData })) {
    await remove(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  await mkdir(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true });

  try {
    for (const file of files) {
      const destination = `${versionRoot}/${file.path}`;
      const parent = parentDirectory(destination);
      if (parent) await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
      await writeFile(destination, file.bytes, { baseDir: BaseDirectory.AppData });
    }
  } catch (error) {
    await remove(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => undefined);
    throw error;
  }

  clearVersionCache(versionName);
}

export async function removeTrafficSignAssetVersion(version: string): Promise<void> {
  const versionName = safeVersion(version);
  const versionRoot = `${ASSET_ROOT}/${versionName}`;
  if (await exists(versionRoot, { baseDir: BaseDirectory.AppData })) {
    await remove(versionRoot, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  clearVersionCache(versionName);
}

export function resolveTrafficSignAssetUrl(version: string, imagePath: string): Promise<string> {
  const versionName = safeVersion(version);
  const safePath = sanitizeRelativePath(imagePath);
  const key = `${versionName}:${safePath}`;
  const cached = resolvedUrlCache.get(key);
  if (cached) return cached;

  const resolved = (async () => {
    const absolutePath = await join(await appDataDir(), `${ASSET_ROOT}/${versionName}/${safePath}`);
    return convertFileSrc(absolutePath);
  })();
  resolvedUrlCache.set(key, resolved);
  return resolved;
}
