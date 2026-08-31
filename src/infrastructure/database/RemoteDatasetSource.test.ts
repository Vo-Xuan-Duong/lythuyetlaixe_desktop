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

describe("RemoteDatasetSource", () => {
  it("resolves relative dataset and asset URLs from the final manifest URL", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://data.example.com/releases/current/dataset-manifest.json",
      json: async () => ({
        dataset: "VN_GPLX_600",
        version: "2025.06",
        validFrom: "2025-06-01",
        stage: "production",
        datasetUrl: "questions.json",
        sha256: "a".repeat(64),
        assets: {
          url: "assets.zip",
          format: "zip",
          sha256: "b".repeat(64),
          fileCount: 42,
        },
      }),
    })) as unknown as typeof fetch;

    const manifest = await fetchDatasetManifest(
      "https://data.example.com/dataset-manifest.json",
    );

    expect(manifest.datasetUrl).toBe(
      "https://data.example.com/releases/current/questions.json",
    );
    expect(manifest.assets?.url).toBe(
      "https://data.example.com/releases/current/assets.zip",
    );
  });

  it("rejects a downloaded dataset when SHA-256 does not match", async () => {
    const dataset: ProductionDataset = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      questions: [],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(dataset));

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer,
    })) as unknown as typeof fetch;

    const manifest: RemoteDatasetManifest = {
      dataset: "VN_GPLX_600",
      version: "2025.06",
      validFrom: "2025-06-01",
      stage: "production",
      datasetUrl: "https://data.example.com/questions.json",
      sha256: "0".repeat(64),
      sizeBytes: bytes.byteLength,
    };

    await expect(downloadDataset(manifest)).rejects.toThrow("checksum mismatch");
  });
});
