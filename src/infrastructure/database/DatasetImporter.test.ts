import { describe, expect, it } from "vitest";
import {
  validateDatasetForImport,
  type DatasetQuestion,
  type ProductionDataset,
} from "./DatasetImporter";

const CRITICAL_IDS = new Set([
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 32, 34, 35, 47, 48, 52, 53, 55,
  58, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74, 85, 86, 87, 88, 89, 90, 91, 92,
  93, 97, 98, 102, 117, 163, 165, 167, 197, 198, 206, 215, 226, 234, 245, 246, 252,
  253, 254, 255, 260,
]);

function categoryFor(id: number): DatasetQuestion["category"] {
  if (id <= 180) return "GENERAL_RULES";
  if (id <= 205) return "CULTURE";
  if (id <= 263) return "DRIVING_TECHNIQUE";
  if (id <= 300) return "VEHICLE";
  if (id <= 485) return "ROAD_SIGNS";
  return "SITUATIONS";
}

function question(id: number): DatasetQuestion {
  return {
    id,
    category: categoryFor(id),
    content: `Câu ${id}`,
    image: id === 301 ? "images/q301.webp" : null,
    critical: CRITICAL_IDS.has(id),
    licenses: ["B"],
    sourceVersion: "2025.06",
    needsVerification: false,
    answers: [
      { key: "A", content: "Đáp án A", correct: true },
      { key: "B", content: "Đáp án B", correct: false },
    ],
  };
}

function validDataset(): ProductionDataset {
  return {
    dataset: "VN_GPLX_600",
    version: "2025.06",
    validFrom: "2025-06-01",
    stage: "production",
    sourceSha256: "a".repeat(64),
    questions: Array.from({ length: 600 }, (_, index) => question(index + 1)),
  };
}

describe("validateDatasetForImport", () => {
  it("accepts the complete current 600-question contract", () => {
    expect(() => validateDatasetForImport(validDataset())).not.toThrow();
  });

  it("rejects a wrong critical flag even when the total count could look plausible", () => {
    const dataset = validDataset();
    dataset.questions[18].critical = false;

    expect(() => validateDatasetForImport(dataset)).toThrow("critical flag must be true");
  });

  it("rejects category ranges that do not match the official contract", () => {
    const dataset = validDataset();
    dataset.questions[300].category = "GENERAL_RULES";

    expect(() => validateDatasetForImport(dataset)).toThrow("expected category ROAD_SIGNS");
  });

  it("rejects unsafe image paths", () => {
    const dataset = validDataset();
    dataset.questions[300].image = "../answers/q301.webp";

    expect(() => validateDatasetForImport(dataset)).toThrow("Unsafe image path");
  });

  it("rejects unsupported license codes", () => {
    const dataset = validDataset();
    dataset.questions[0].licenses = ["UNKNOWN"];

    expect(() => validateDatasetForImport(dataset)).toThrow("unsupported license UNKNOWN");
  });

  it("requires official PDF provenance", () => {
    const dataset = validDataset();
    dataset.sourceSha256 = null;

    expect(() => validateDatasetForImport(dataset)).toThrow("sourceSha256");
  });
});
