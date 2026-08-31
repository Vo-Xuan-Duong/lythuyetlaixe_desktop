import { describe, expect, it } from "vitest";
import type { TrafficSignsDataset } from "../../domain/entities/trafficSign";
import { validateTrafficSignsDataset } from "./TrafficSignsImporter";

const SHA = "a".repeat(64);

function validDataset(): TrafficSignsDataset {
  return {
    dataset: "VN_TRAFFIC_SIGNS",
    version: "2025.01",
    validFrom: "2025-01-01",
    stage: "production",
    sourceDocument: "QCVN 41:2024/BGTVT",
    sourceSha256: SHA,
    signs: [
      {
        code: "P.001",
        name: "Verified test sign",
        groupCode: "PROHIBITION",
        meaning: "Test-only meaning used to validate the schema contract.",
        recognition: "Test recognition",
        scope: "Test scope",
        exceptions: [],
        notes: "Fixture only; not production traffic knowledge.",
        image: "signs/p001.webp",
        keywords: ["fixture"],
        sourceVersion: "QCVN 41:2024/BGTVT",
      },
    ],
  };
}

describe("validateTrafficSignsDataset", () => {
  it("accepts a structurally valid production catalog", () => {
    expect(() => validateTrafficSignsDataset(validDataset())).not.toThrow();
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

  it("rejects unsafe image traversal", () => {
    const dataset = validDataset();
    dataset.signs[0] = { ...dataset.signs[0], image: "../escape.webp" };
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/Unsafe traffic sign image path/);
  });

  it("requires source provenance", () => {
    const dataset = validDataset();
    dataset.sourceSha256 = "invalid";
    expect(() => validateTrafficSignsDataset(dataset)).toThrow(/sourceSha256/);
  });
});
