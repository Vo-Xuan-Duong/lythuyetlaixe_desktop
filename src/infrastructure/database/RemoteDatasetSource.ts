import type { ProductionDataset } from "./DatasetImporter";

export interface RemoteAssetPackage {
  url: string;
  sha256: string;
  sizeBytes?: number;
  format: "zip";
  fileCount?: number;
}

export interface RemoteDatasetManifest {
  dataset: "VN_GPLX_600";
  version: string;
  validFrom: string;
  stage: "production";
  datasetUrl: string;
  sha256: string;
  sizeBytes?: number;
  assets?: RemoteAssetPackage;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_DATASET_BYTES = 16 * 1024 * 1024;
export const MAX_ASSET_ARCHIVE_BYTES = 64 * 1024 * 1024;
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeSha256(value: string): string {
  return value.trim().toLowerCase().replace(/^sha256:/, "");
}

function assertSha256(value: string, label: string): string {
  const normalized = normalizeSha256(value);
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 64-character SHA-256 hex digest`);
  }
  return normalized;
}

function assertOptionalPositiveInteger(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function resolveAllowedRemoteUrl(value: string, base?: string): string {
  let parsed: URL;
  try {
    parsed = base ? new URL(value, base) : new URL(value);
  } catch {
    throw new Error(`Invalid remote URL: ${value}`);
  }

  const allowedHttpDevelopmentUrl =
    parsed.protocol === "http:" && LOCAL_DEVELOPMENT_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !allowedHttpDevelopmentUrl) {
    throw new Error(`Remote URL must use HTTPS (HTTP is only allowed for localhost): ${parsed.toString()}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Remote dataset URLs must not contain embedded credentials");
  }
  return parsed.toString();
}

function responseContentLength(response: Response): number | null {
  const raw = response.headers?.get?.("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const safeUrl = resolveAllowedRemoteUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(safeUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const contentLength = responseContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(`${label} exceeds maximum allowed size of ${maxBytes} bytes`);
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error(`${label} exceeds maximum allowed size of ${maxBytes} bytes`);
    }
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`${label} exceeds maximum allowed size of ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchDatasetManifest(url: string): Promise<RemoteDatasetManifest> {
  const requestedUrl = resolveAllowedRemoteUrl(url);
  const response = await fetchWithTimeout(requestedUrl);
  if (!response.ok) {
    throw new Error(`Cannot load dataset manifest: HTTP ${response.status}`);
  }

  const contentLength = responseContentLength(response);
  if (contentLength !== null && contentLength > MAX_MANIFEST_BYTES) {
    throw new Error("Dataset manifest is unexpectedly large");
  }

  const manifest = (await response.json()) as Partial<RemoteDatasetManifest>;
  if (manifest.dataset !== "VN_GPLX_600") {
    throw new Error(`Unsupported remote dataset: ${manifest.dataset ?? "unknown"}`);
  }
  if (manifest.stage !== "production") {
    throw new Error(`Remote dataset stage must be production, found: ${manifest.stage ?? "unknown"}`);
  }
  if (!manifest.version?.trim()) {
    throw new Error("Remote dataset manifest is missing version");
  }
  if (!manifest.validFrom?.trim()) {
    throw new Error("Remote dataset manifest is missing validFrom");
  }
  if (!manifest.datasetUrl?.trim()) {
    throw new Error("Remote dataset manifest is missing datasetUrl");
  }
  if (!manifest.sha256?.trim()) {
    throw new Error("Remote dataset manifest is missing sha256");
  }

  assertOptionalPositiveInteger(manifest.sizeBytes, "dataset sizeBytes");
  const datasetSha256 = assertSha256(manifest.sha256, "dataset sha256");

  if (manifest.assets) {
    if (manifest.assets.format !== "zip") {
      throw new Error(`Unsupported asset package format: ${String(manifest.assets.format)}`);
    }
    if (!manifest.assets.url?.trim() || !manifest.assets.sha256?.trim()) {
      throw new Error("Remote asset package requires url and sha256");
    }
    assertOptionalPositiveInteger(manifest.assets.sizeBytes, "assets sizeBytes");
    assertOptionalPositiveInteger(manifest.assets.fileCount, "assets fileCount");
    if (manifest.assets.sizeBytes !== undefined && manifest.assets.sizeBytes > MAX_ASSET_ARCHIVE_BYTES) {
      throw new Error(`assets.zip exceeds maximum allowed size of ${MAX_ASSET_ARCHIVE_BYTES} bytes`);
    }
  }

  const manifestUrl = resolveAllowedRemoteUrl(response.url || requestedUrl);
  const resolvedDatasetUrl = resolveAllowedRemoteUrl(manifest.datasetUrl, manifestUrl);
  const resolvedAssets = manifest.assets
    ? {
        ...manifest.assets,
        sha256: assertSha256(manifest.assets.sha256, "assets sha256"),
        url: resolveAllowedRemoteUrl(manifest.assets.url, manifestUrl),
      }
    : undefined;

  return {
    ...(manifest as RemoteDatasetManifest),
    sha256: datasetSha256,
    datasetUrl: resolvedDatasetUrl,
    assets: resolvedAssets,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function downloadVerifiedBytes(
  url: string,
  expectedSha256: string,
  expectedSizeBytes: number | undefined,
  label: string,
  timeoutMs = 120_000,
  maxBytes = MAX_DATASET_BYTES,
): Promise<Uint8Array> {
  assertOptionalPositiveInteger(expectedSizeBytes, `${label} sizeBytes`);
  if (expectedSizeBytes !== undefined && expectedSizeBytes > maxBytes) {
    throw new Error(`${label} exceeds maximum allowed size of ${maxBytes} bytes`);
  }

  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    throw new Error(`Cannot download ${label}: HTTP ${response.status}`);
  }

  const bytes = await readResponseBytes(response, maxBytes, label);
  if (expectedSizeBytes !== undefined && bytes.byteLength !== expectedSizeBytes) {
    throw new Error(
      `${label} size mismatch: expected ${expectedSizeBytes} bytes, received ${bytes.byteLength}`,
    );
  }

  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== assertSha256(expectedSha256, `${label} sha256`)) {
    throw new Error(`${label} checksum mismatch`);
  }

  return bytes;
}

export async function downloadDataset(manifest: RemoteDatasetManifest): Promise<ProductionDataset> {
  const bytes = await downloadVerifiedBytes(
    manifest.datasetUrl,
    manifest.sha256,
    manifest.sizeBytes,
    `dataset ${manifest.version}`,
    120_000,
    MAX_DATASET_BYTES,
  );

  let dataset: ProductionDataset;
  try {
    dataset = JSON.parse(new TextDecoder().decode(bytes)) as ProductionDataset;
  } catch (error) {
    throw new Error(`Dataset ${manifest.version} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (dataset.dataset !== manifest.dataset) {
    throw new Error("Dataset identity does not match remote manifest");
  }
  if (dataset.version !== manifest.version) {
    throw new Error(
      `Dataset version mismatch: manifest=${manifest.version}, dataset=${dataset.version}`,
    );
  }
  if (dataset.validFrom !== manifest.validFrom) {
    throw new Error(
      `Dataset validFrom mismatch: manifest=${manifest.validFrom}, dataset=${dataset.validFrom}`,
    );
  }
  if (dataset.stage !== manifest.stage) {
    throw new Error("Dataset stage does not match remote manifest");
  }

  // Important: dataset.sourceSha256 is provenance for the official source PDF.
  // manifest.sha256 is the distribution checksum for questions.json and is
  // stored separately as contentSha256 by DatasetImporter.
  return dataset;
}
