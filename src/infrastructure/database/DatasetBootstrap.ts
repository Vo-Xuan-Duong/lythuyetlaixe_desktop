import { isTauri } from "@tauri-apps/api/core";
import { DatasetImporter, type ProductionDataset } from "./DatasetImporter";

export type DatasetBootstrapStatus =
  | { state: "checking" }
  | { state: "demo"; reason: "browser" | "dataset-missing" }
  | { state: "ready"; version: string; importStatus: "imported" | "up-to-date" }
  | { state: "error"; message: string };

const DATASET_URL = "/data/questions.json";

export async function bootstrapDataset(): Promise<DatasetBootstrapStatus> {
  if (!isTauri()) {
    return { state: "demo", reason: "browser" };
  }

  try {
    const response = await fetch(DATASET_URL, { cache: "no-store" });
    if (response.status === 404) {
      return { state: "demo", reason: "dataset-missing" };
    }
    if (!response.ok) {
      throw new Error(`Cannot load ${DATASET_URL}: HTTP ${response.status}`);
    }

    const dataset = (await response.json()) as ProductionDataset;
    const result = await new DatasetImporter().import(dataset);
    return {
      state: "ready",
      version: result.version,
      importStatus: result.status,
    };
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
