import { describe, expect, it } from "vitest";
import type { TrafficSignRecord, TrafficSignsDataset } from "../../domain/entities/trafficSign";
import { validateTrafficSignsDataset } from "./TrafficSignsImporter";

const SHA = "a".repeat(64);

function validSign(overrides: Partial<TrafficSignRecord> = {}): TrafficSignRecord {
  return {
    code: "S.H,3",
    name: "Verified test sign",
    groupCode: "SUPPLEMENTARY",
    meaning: "Test-only meaning used to validate the schema contract.",
    recognition: "Test recognition",
    scope: "Test scope",
    exceptions: [],
    notes: "Fixture only; not production traffic knowledge.",
    keywords: ["fixture"],
    sourceVersion: "QCVN 41:2024/BGTVT",
    sourceSection: "F.1",
    sourcePages: [10],
    verifiedBy: "unit-test",
    verifiedAt: "2026-08-31T00:00:00Z",
    ...overrides,
  };
}

function validDataset(): TrafficSignsDataset {
  return {
    dataset: "VN_TRAFFIC_SIGNS",
    version: "2025.01",
    validFrom: "2025-01-01",
    stage: "production",
    sourceDocument: "QCVN 41:2024/BGTVT",
    sourceSha256: SHA,
    signs: [validSign()],
  };
}

describe("validateTrafficSignsDataset", () => {
  it("accepts a structurally valid production catalog including comma sign codes", () => {
    expect(() => validateTrafficSignsDataset(validDataset())).not.toThrow();
  });

  it("accepts a verified image with official QCVN provenance", () => {
    const dataset = validDataset();
    dataset.signs[0] = validSign({
      image: "signs/s-h-3.webp",
      imageVerified: true,
      imageSelection: {
        method: "official-qcvn-manual-crop",
        sourceSha256: SHA,
        sourceSection: "F.1",
        page: 10,
        crop: [10, 20, 110, 120],
        processedAsset: "signs/s-h-3.webp",
      },
    });
    expect(() => validateTrafficSignsDataset(dataset)).not.toThrow();
  });

  it("rejects duplicated sign codes", () => {
    const dataset = validDataset();
    dataset.signs.push({ ...dataset.signs[0] });
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/Duplicate traffic sign code/);
  });

  it("rejects unsupported groups", () => {
    const dataset = validDataset();
    dataset.signs[0] = { ...dataset.signs[0], groupCode: "UNKNOWN" as never };
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/invalid group/);
  });

  it("rejects missing per-sign provenance", () => {
    const dataset = validDataset();
    dataset.signs[0] = { ...dataset.signs[0], sourcePages: [] };
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/sourcePages/);
  });

  it("rejects unsafe image traversal", () => {
    const dataset = validDataset();
    dataset.signs[0] = validSign({
      image: "../escape.webp",
      imageVerified: true,
      imageSelection: {
        method: "official-qcvn-manual-crop",
        sourceSha256: SHA,
        sourceSection: "F.1",
        page: 10,
        crop: [10, 20, 110, 120],
        processedAsset: "../escape.webp",
      },
    });
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/Unsafe traffic sign image path/);
  });

  it("rejects an image without official provenance", () => {
    const dataset = validDataset();
    dataset.signs[0] = validSign({ image: "signs/s-h-3.webp", imageVerified: true });
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/imageSelection provenance/);
  });

  it("requires dataset source provenance", () => {
    const dataset = validDataset();
    dataset.sourceSha256 = "invalid";
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/sourceSha256/);
  });
});
