import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadDataset,
  fetchDatasetManifest,
  type RemoteDatasetManifest,
} from "./RemoteDatasetSource";
import type { ProductionDataset } from "./DatasetImporter";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function byteResponse(
  payload: unknown,
  url: string,
  status = 200,
): Pick<Response, "ok" | "status" | "url" | "arrayBuffer"> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    arrayBuffer: async () => bytes.buffer,
  };
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

describe("RemoteDatasetSource", () => {
  it("resolves relative dataset and asset URLs from the final manifest URL", async () => {
    const manifestPayload = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      datasetUrl: "questions.json",
      sha256: "a".repeat(64),
      sourceSha256: "c".repeat(64),
      assets: {
        url: "assets.zip",
        format: "zip",
        sha256: "b".repeat(64),
        fileCount: 42,
      },
    };

    globalThis.fetch = vi.fn(async () =>
      byteResponse(
        manifestPayload,
        "https://data.example.com/releases/current/dataset-manifest.json",
      ) as Response,
    ) as unknown as typeof fetch;

    const manifest = await fetchDatasetManifest(
      "https://data.example.com/dataset-manifest.json",
    );

    expect(manifest.datasetUrl).toBe(
      "https://data.example.com/releases/current/questions.json",
    );
    expect(manifest.assets?.url).toBe(
      "https://data.example.com/releases/current/assets.zip",
    );
    expect(manifest.sourceSha256).toBe("c".repeat(64));
  });

  it("rejects non-HTTPS production URLs", async () => {
    await expect(
      fetchDatasetManifest("http://data.example.com/dataset-manifest.json"),
    ).rejects.toThrow("must use HTTPS");
  });

  it("rejects cross-origin payload URLs", async () => {
    globalThis.fetch = vi.fn(async () =>
      byteResponse(
        {
          dataset: "VN_GPLX_600",
          version: "2025.06",
          validFrom: "2025-06-01",
          stage: "production",
          datasetUrl: "https://other.example.com/questions.json",
          sha256: "a".repeat(64),
          sourceSha256: "c".repeat(64),
        },
        "https://data.example.com/dataset-manifest.json",
      ) as Response,
    ) as unknown as typeof fetch;

    await expect(
      fetchDatasetManifest("https://data.example.com/dataset-manifest.json"),
    ).rejects.toThrow("same origin");
  });

  it("rejects malformed manifest checksums", async () => {
    globalThis.fetch = vi.fn(async () =>
      byteResponse(
        {
          dataset: "VN_GPLX_600",
          version: "2025.06",
          validFrom: "2025-06-01",
          stage: "production",
          datasetUrl: "questions.json",
          sha256: "not-a-sha",
          sourceSha256: "c".repeat(64),
        },
        "https://data.example.com/dataset-manifest.json",
      ) as Response,
    ) as unknown as typeof fetch;

    await expect(
      fetchDatasetManifest("https://data.example.com/dataset-manifest.json"),
    ).rejects.toThrow("64-character SHA-256");
  });

  it("rejects a downloaded dataset when SHA-256 does not match", async () => {
    const dataset: ProductionDataset = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      sourceSha256: "c".repeat(64),
      questions: [],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(dataset));

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://data.example.com/questions.json",
      arrayBuffer: async () => bytes.buffer,
    })) as unknown as typeof fetch;

    const manifest: RemoteDatasetManifest = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      datasetUrl: "https://data.example.com/questions.json",
      sha256: "0".repeat(64),
      sourceSha256: "c".repeat(64),
      sizeBytes: bytes.byteLength,
    };

    await expect(downloadDataset(manifest)).rejects.toThrow("checksum mismatch");
  });

  it("rejects a dataset whose source provenance differs from the manifest", async () => {
    const dataset: ProductionDataset = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      sourceSha256: "d".repeat(64),
      questions: [],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(dataset));
    const sha256 = await digestHex(bytes);

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://data.example.com/questions.json",
      arrayBuffer: async () => bytes.buffer,
    })) as unknown as typeof fetch;

    const manifest: RemoteDatasetManifest = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      datasetUrl: "https://data.example.com/questions.json",
      sha256,
      sourceSha256: "c".repeat(64),
      sizeBytes: bytes.byteLength,
    };

    await expect(downloadDataset(manifest)).rejects.toThrow("sourceSha256 provenance");
  });
});
