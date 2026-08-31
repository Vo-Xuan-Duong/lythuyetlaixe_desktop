import type { ProductionDataset } from "./DatasetImporter";

export interface RemoteDatasetManifest {
  dataset: "VN_GPLX_600";
  version: string;
  validFrom: string;
  stage: "production";
  datasetUrl: string;
  sha256: string;
  sizeBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeSha256(value: string): string {
  return value.trim().toLowerCase().replace(/^sha256:/, "");
}

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDatasetManifest(url: string): Promise<RemoteDatasetManifest> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Cannot load dataset manifest: HTTP ${response.status}`);
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

  const manifestUrl = response.url || url;
  return {
    ...(manifest as RemoteDatasetManifest),
    datasetUrl: new URL(manifest.datasetUrl, manifestUrl).toString(),
  };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function downloadDataset(manifest: RemoteDatasetManifest): Promise<ProductionDataset> {
  const response = await fetchWithTimeout(manifest.datasetUrl, 120_000);
  if (!response.ok) {
    throw new Error(`Cannot download dataset ${manifest.version}: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  if (manifest.sizeBytes !== undefined && buffer.byteLength !== manifest.sizeBytes) {
    throw new Error(
      `Dataset size mismatch: expected ${manifest.sizeBytes} bytes, received ${buffer.byteLength}`,
    );
  }

  const actualSha256 = await sha256Hex(buffer);
  const expectedSha256 = normalizeSha256(manifest.sha256);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Dataset checksum mismatch for version ${manifest.version}`);
  }

  const dataset = JSON.parse(new TextDecoder().decode(buffer)) as ProductionDataset;
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

  return {
    ...dataset,
    sourceSha256: actualSha256,
  };
}
