export const TRAFFIC_SIGN_GROUP_CODES = [
  "PROHIBITION",
  "MANDATORY",
  "WARNING",
  "INDICATION",
  "SUPPLEMENTARY",
] as const;

export const MAX_TRAFFIC_SIGN_COUNT = 2_000;

export type TrafficSignGroupCode = (typeof TRAFFIC_SIGN_GROUP_CODES)[number];
export type TrafficSignImageSelectionMethod = "official-qcvn-candidate" | "official-qcvn-manual-crop";

export interface TrafficSignImageSelection {
  method: TrafficSignImageSelectionMethod;
  sourceSha256: string;
  sourceSection: string;
  page: number;
  crop: [number, number, number, number];
  processedAsset: string;
  candidateFile?: string;
}

export interface TrafficSignRecord {
  code: string;
  name: string;
  groupCode: TrafficSignGroupCode;
  meaning: string;
  recognition?: string;
  scope?: string;
  exceptions: string[];
  notes?: string;
  image?: string;
  imageVerified?: boolean;
  imageSelection?: TrafficSignImageSelection;
  keywords: string[];
  sourceVersion: string;
}

export interface TrafficSignsDataset {
  dataset: "VN_TRAFFIC_SIGNS";
  version: string;
  validFrom: string;
  stage: "production";
  sourceDocument: string;
  sourceSha256: string;
  signs: TrafficSignRecord[];
}

export interface TrafficSignsLocalState {
  ready: boolean;
  version: string | null;
  validFrom: string | null;
  sourceDocument: string | null;
  sourceSha256: string | null;
  contentSha256: string | null;
  assetSha256: string | null;
  signCount: number;
}
