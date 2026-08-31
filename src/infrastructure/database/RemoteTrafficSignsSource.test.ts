import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrafficSignsDataset } from "../../domain/entities/trafficSign";
import {
  downloadTrafficSignsDataset,
  fetchTrafficSignsManifest,
  type RemoteTrafficSignsManifest,
} from "./RemoteTrafficSignsSource";

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

describe("RemoteTrafficSignsSource", () => {
  it("requires signCount and resolves same-origin relative URLs", async () => {
    globalThis.fetch = vi.fn(async () =>
      byteResponse(
        {
          dataset: "VN_TRAFFIC_SIGNS",
          version: "2025.01",
          validFrom: "2025-01-01",
          stage: "production",
          datasetUrl: "traffic-signs.json",
          sha256: "a".repeat(64),
          sourceDocument: "QCVN 41:2024/BGTVT",
          sourceSha256: "b".repeat(64),
          signCount: 123,
          assets: {
            url: "traffic-sign-assets.zip",
            format: "zip",
            sha256: "c".repeat(64),
            fileCount: 100,
          },
        },
        "https://data.example.com/traffic-signs/manifest.json",
      ) as Response,
    ) as unknown as typeof fetch;

    const manifest = await fetchTrafficSignsManifest(
      "https://data.example.com/traffic-signs/manifest.json",
    );

    expect(manifest.signCount).toBe(123);
    expect(manifest.datasetUrl).toBe("https://data.example.com/traffic-signs/traffic-signs.json");
    expect(manifest.assets?.url).toBe("https://data.example.com/traffic-signs/traffic-sign-assets.zip");
  });

  it("rejects manifests without a positive signCount", async () => {
    globalThis.fetch = vi.fn(async () =>
      byteResponse(
        {
          dataset: "VN_TRAFFIC_SIGNS",
          version: "2025.01",
          validFrom: "2025-01-01",
          stage: "production",
          datasetUrl: "traffic-signs.json",
          sha256: "a".repeat(64),
          sourceDocument: "QCVN 41:2024/BGTVT",
          sourceSha256: "b".repeat(64),
          signCount: 0,
        },
        "https://data.example.com/traffic-signs/manifest.json",
      ) as Response,
    ) as unknown as typeof fetch;

    await expect(
      fetchTrafficSignsManifest("https://data.example.com/traffic-signs/manifest.json"),
    ).rejects.toThrow("signCount");
  });

  it("rejects cross-origin catalog payloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      byteResponse(
        {
          dataset: "VN_TRAFFIC_SIGNS",
          version: "2025.01",
          validFrom: "2025-01-01",
          stage: "production",
          datasetUrl: "https://other.example.com/traffic-signs.json",
          sha256: "a".repeat(64),
          sourceDocument: "QCVN 41:2024/BGTVT",
          sourceSha256: "b".repeat(64),
          signCount: 1,
        },
        "https://data.example.com/traffic-signs/manifest.json",
      ) as Response,
    ) as unknown as typeof fetch;

    await expect(
      fetchTrafficSignsManifest("https://data.example.com/traffic-signs/manifest.json"),
    ).rejects.toThrow("same origin");
  });

  it("rejects a catalog whose sign count differs from the manifest", async () => {
    const dataset: TrafficSignsDataset = {
      dataset: "VN_TRAFFIC_SIGNS",
      version: "2025.01",
      validFrom: "2025-01-01",
      stage: "production",
      sourceDocument: "QCVN 41:2024/BGTVT",
      sourceSha256: "b".repeat(64),
      signs: [],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(dataset));
    const sha256 = await digestHex(bytes);

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://data.example.com/traffic-signs/traffic-signs.json",
      arrayBuffer: async () => bytes.buffer,
    })) as unknown as typeof fetch;

    const manifest: RemoteTrafficSignsManifest = {
      dataset: "VN_TRAFFIC_SIGNS",
      version: "2025.01",
      validFrom: "2025-01-01",
      stage: "production",
      datasetUrl: "https://data.example.com/traffic-signs/traffic-signs.json",
      sha256,
      sourceDocument: "QCVN 41:2024/BGTVT",
      sourceSha256: "b".repeat(64),
      signCount: 1,
      sizeBytes: bytes.byteLength,
    };

    await expect(downloadTrafficSignsDataset(manifest)).rejects.toThrow("count mismatch");
  });
});
