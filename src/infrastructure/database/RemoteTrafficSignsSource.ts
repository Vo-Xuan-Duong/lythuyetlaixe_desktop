import {
  MAX_TRAFFIC_SIGN_COUNT,
  type TrafficSignsDataset,
} from "../../domain/entities/trafficSign";

export interface RemoteTrafficSignsAssetPackage {
  url: string;
  sha256: string;
  sizeBytes?: number;
  format: "zip";
  fileCount?: number;
}

export interface RemoteTrafficSignsManifest {
  dataset: "VN_TRAFFIC_SIGNS";
  version: string;
  validFrom: string;
  stage: "production";
  datasetUrl: string;
  sha256: string;
  sourceDocument: string;
  sourceSha256: string;
  sourcePartCount: number;
  signCount: number;
  sizeBytes?: number;
  assets?: RemoteTrafficSignsAssetPackage;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_DATASET_BYTES = 8 * 1024 * 1024;
export const MAX_TRAFFIC_SIGN_ASSET_BYTES = 64 * 1024 * 1024;
const EXPECTED_SOURCE_PART_COUNT = 5;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTrafficSignsSha256(value: string): string {
  return value.trim().toLowerCase().replace(/^sha256:/, "");
}

function assertSha256(value: string, label: string): string {
  const normalized = normalizeTrafficSignsSha256(value);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`${label} must be a 64-character SHA-256 hex digest`);
  return normalized;
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer`);
}

function assertOptionalPositiveInteger(value: unknown, label: string): void {
  if (value === undefined) return;
  assertPositiveInteger(value, label);
}

function resolveRemoteUrl(value: string, base?: string): string {
  let parsed: URL;
  try {
    parsed = base ? new URL(value, base) : new URL(value);
  } catch {
    throw new Error(`Invalid traffic signs remote URL: ${value}`);
  }
  const localHttp = parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(`Traffic signs remote URL must use HTTPS: ${parsed.toString()}`);
  }
  if (parsed.username || parsed.password) throw new Error("Traffic signs URLs must not contain credentials");
  return parsed.toString();
}

function assertSameOrigin(url: string, manifestUrl: string, label: string): void {
  if (new URL(url).origin !== new URL(manifestUrl).origin) {
    throw new Error(`${label} must use the same origin as traffic-signs manifest`);
  }
}

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const safeUrl = resolveRemoteUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(safeUrl, { cache: "no-store", redirect: "follow", signal: controller.signal });
    resolveRemoteUrl(response.url || safeUrl);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function readBytes(response: Response, maxBytes: number, label: string): Promise<Uint8Array> {
  const lengthHeader = response.headers?.get?.("content-length");
  const contentLength = lengthHeader ? Number(lengthHeader) : null;
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`${label} exceeds maximum allowed size of ${maxBytes} bytes`);
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error(`${label} exceeds maximum allowed size`);
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

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function fetchTrafficSignsManifest(url: string): Promise<RemoteTrafficSignsManifest> {
  const requestedUrl = resolveRemoteUrl(url);
  const response = await fetchWithTimeout(requestedUrl);
  if (!response.ok) throw new Error(`Cannot load traffic signs manifest: HTTP ${response.status}`);

  const bytes = await readBytes(response, MAX_MANIFEST_BYTES, "traffic signs manifest");
  let manifest: Partial<RemoteTrafficSignsManifest>;
  try {
    manifest = JSON.parse(new TextDecoder().decode(bytes)) as Partial<RemoteTrafficSignsManifest>;
  } catch (error) {
    throw new Error(`Traffic signs manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest.dataset !== "VN_TRAFFIC_SIGNS") throw new Error(`Unsupported traffic signs dataset: ${manifest.dataset ?? "unknown"}`);
  if (manifest.stage !== "production") throw new Error("Traffic signs manifest stage must be production");
  if (!manifest.version?.trim() || !VERSION_RE.test(manifest.version.trim())) throw new Error("Traffic signs manifest version is invalid");
  if (!manifest.validFrom?.trim() || !ISO_DATE_RE.test(manifest.validFrom.trim())) throw new Error("Traffic signs manifest validFrom must use YYYY-MM-DD");
  if (!manifest.datasetUrl?.trim()) throw new Error("Traffic signs manifest is missing datasetUrl");
  if (!manifest.sha256?.trim()) throw new Error("Traffic signs manifest is missing sha256");
  if (!manifest.sourceDocument?.trim()) throw new Error("Traffic signs manifest is missing sourceDocument");
  if (!manifest.sourceSha256?.trim()) throw new Error("Traffic signs manifest is missing sourceSha256");

  assertPositiveInteger(manifest.sourcePartCount, "traffic signs sourcePartCount");
  if (manifest.sourcePartCount !== EXPECTED_SOURCE_PART_COUNT) {
    throw new Error(`traffic signs sourcePartCount must be ${EXPECTED_SOURCE_PART_COUNT}`);
  }

  const signCount = manifest.signCount;
  assertPositiveInteger(signCount, "traffic signs signCount");
  if (signCount > MAX_TRAFFIC_SIGN_COUNT) {
    throw new Error(`traffic signs signCount exceeds maximum of ${MAX_TRAFFIC_SIGN_COUNT}`);
  }
  assertOptionalPositiveInteger(manifest.sizeBytes, "traffic signs sizeBytes");
  const contentSha256 = assertSha256(manifest.sha256, "traffic signs sha256");
  const sourceSha256 = assertSha256(manifest.sourceSha256, "traffic signs source sha256");
  const manifestUrl = resolveRemoteUrl(response.url || requestedUrl);
  const datasetUrl = resolveRemoteUrl(manifest.datasetUrl, manifestUrl);
  assertSameOrigin(datasetUrl, manifestUrl, "traffic-signs.json");

  let assets: RemoteTrafficSignsAssetPackage | undefined;
  if (manifest.assets) {
    if (manifest.assets.format !== "zip") throw new Error(`Unsupported traffic signs asset format: ${String(manifest.assets.format)}`);
    if (!manifest.assets.url?.trim() || !manifest.assets.sha256?.trim()) throw new Error("Traffic signs assets require url and sha256");
    assertOptionalPositiveInteger(manifest.assets.sizeBytes, "traffic signs assets sizeBytes");
    assertOptionalPositiveInteger(manifest.assets.fileCount, "traffic signs assets fileCount");
    if (manifest.assets.fileCount !== undefined && manifest.assets.fileCount > signCount) {
      throw new Error("traffic signs assets fileCount cannot exceed signCount");
    }
    if (manifest.assets.sizeBytes !== undefined && manifest.assets.sizeBytes > MAX_TRAFFIC_SIGN_ASSET_BYTES) {
      throw new Error(`traffic-sign-assets.zip exceeds maximum allowed size of ${MAX_TRAFFIC_SIGN_ASSET_BYTES} bytes`);
    }
    const assetUrl = resolveRemoteUrl(manifest.assets.url, manifestUrl);
    assertSameOrigin(assetUrl, manifestUrl, "traffic-sign-assets.zip");
    assets = { ...manifest.assets, url: assetUrl, sha256: assertSha256(manifest.assets.sha256, "traffic signs assets sha256") };
  }

  return {
    ...(manifest as RemoteTrafficSignsManifest),
    version: manifest.version.trim(),
    validFrom: manifest.validFrom.trim(),
    sourceDocument: manifest.sourceDocument.trim(),
    sourcePartCount: manifest.sourcePartCount,
    signCount,
    datasetUrl,
    sha256: contentSha256,
    sourceSha256,
    assets,
  };
}

export async function downloadVerifiedTrafficSignsBytes(
  url: string,
  expectedSha256: string,
  expectedSizeBytes: number | undefined,
  label: string,
  timeoutMs = 120_000,
  maxBytes = MAX_DATASET_BYTES,
): Promise<Uint8Array> {
  assertOptionalPositiveInteger(expectedSizeBytes, `${label} sizeBytes`);
  if (expectedSizeBytes !== undefined && expectedSizeBytes > maxBytes) throw new Error(`${label} exceeds maximum allowed size`);
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) throw new Error(`Cannot download ${label}: HTTP ${response.status}`);
  const bytes = await readBytes(response, maxBytes, label);
  if (expectedSizeBytes !== undefined && bytes.byteLength !== expectedSizeBytes) {
    throw new Error(`${label} size mismatch: expected ${expectedSizeBytes}, found ${bytes.byteLength}`);
  }
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== assertSha256(expectedSha256, `${label} sha256`)) throw new Error(`${label} SHA-256 mismatch`);
  return bytes;
}

export async function downloadTrafficSignsDataset(manifest: RemoteTrafficSignsManifest): Promise<TrafficSignsDataset> {
  const bytes = await downloadVerifiedTrafficSignsBytes(
    manifest.datasetUrl,
    manifest.sha256,
    manifest.sizeBytes,
    `traffic-signs.json ${manifest.version}`,
  );
  let dataset: TrafficSignsDataset;
  try {
    dataset = JSON.parse(new TextDecoder().decode(bytes)) as TrafficSignsDataset;
  } catch (error) {
    throw new Error(`traffic-signs.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (dataset.dataset !== manifest.dataset) {
    throw new Error("Traffic signs dataset identity does not match manifest");
  }
  if (dataset.stage !== manifest.stage) {
    throw new Error("Traffic signs dataset stage does not match manifest");
  }
  if (dataset.version !== manifest.version) {
    throw new Error("Traffic signs dataset version does not match manifest");
  }
  if (dataset.validFrom !== manifest.validFrom) {
    throw new Error(`Traffic signs validFrom mismatch: manifest=${manifest.validFrom}, dataset=${dataset.validFrom}`);
  }
  if (!Array.isArray(dataset.signs) || dataset.signs.length !== manifest.signCount) {
    throw new Error(`Traffic signs count mismatch: expected ${manifest.signCount}, found ${Array.isArray(dataset.signs) ? dataset.signs.length : 0}`);
  }
  if (normalizeTrafficSignsSha256(dataset.sourceSha256) !== manifest.sourceSha256) {
    throw new Error("Traffic signs source provenance does not match manifest");
  }
  if (typeof dataset.sourceDocument !== "string" || dataset.sourceDocument.trim() !== manifest.sourceDocument) {
    throw new Error("Traffic signs source document does not match manifest");
  }
  return dataset;
}
