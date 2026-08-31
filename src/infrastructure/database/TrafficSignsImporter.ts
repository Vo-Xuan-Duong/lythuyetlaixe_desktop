import type Database from "@tauri-apps/plugin-sql";
import {
  MAX_TRAFFIC_SIGN_COUNT,
  TRAFFIC_SIGN_GROUP_CODES,
  type TrafficSignGroupCode,
  type TrafficSignRecord,
  type TrafficSignsDataset,
  type TrafficSignsLocalState,
} from "../../domain/entities/trafficSign";
import { getDatabase } from "./database";

export interface TrafficSignsImportOptions {
  force?: boolean;
  contentSha256?: string | null;
  assetSha256?: string | null;
}

export interface TrafficSignsImportResult {
  status: "imported" | "up-to-date";
  version: string;
  signCount: number;
}

interface MetadataRow { value: string; }
interface CountRow { count: number; }

const GROUP_CODES = new Set<TrafficSignGroupCode>(TRAFFIC_SIGN_GROUP_CODES);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const IMAGE_SELECTION_METHODS = new Set(["official-qcvn-candidate", "official-qcvn-manual-crop"]);
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGN_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9.,_-]{0,31}$/;

function normalizedChecksum(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
}

function isSha256(value?: string | null): boolean {
  return /^[a-f0-9]{64}$/.test(normalizedChecksum(value));
}

function safeRelativePath(value: string, label: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) throw new Error(`Unsafe ${label}: ${value}`);
  return segments.join("/");
}

function safeImagePath(value: string): string {
  const normalized = safeRelativePath(value, "traffic sign image path");
  const filename = normalized.split("/").at(-1) ?? "";
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) throw new Error(`Unsupported traffic sign image type: ${value}`);
  return normalized;
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function assertOptionalString(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== "string") throw new Error(`${label} must be a string when provided`);
}

function validateImageSelection(sign: TrafficSignRecord, datasetSourceSha256: string): void {
  const code = sign.code.trim();
  if (!sign.image) {
    if (sign.imageSelection) throw new Error(`${code}: imageSelection is present without image`);
    if (sign.imageVerified === true) throw new Error(`${code}: imageVerified cannot be true without image`);
    return;
  }
  if (sign.imageVerified !== true) throw new Error(`${code}: image is present but imageVerified is not true`);
  const selection = sign.imageSelection;
  if (!selection || typeof selection !== "object") throw new Error(`${code}: verified image requires imageSelection provenance`);
  if (!IMAGE_SELECTION_METHODS.has(selection.method)) throw new Error(`${code}: unsupported imageSelection method ${String(selection.method)}`);
  if (normalizedChecksum(selection.sourceSha256) !== datasetSourceSha256) throw new Error(`${code}: imageSelection sourceSha256 does not match dataset source`);
  if (typeof selection.sourceSection !== "string" || !selection.sourceSection.trim()) throw new Error(`${code}: imageSelection sourceSection is required`);
  if (!Number.isInteger(selection.page) || selection.page <= 0) throw new Error(`${code}: imageSelection page must be a positive integer`);
  if (
    !Array.isArray(selection.crop) || selection.crop.length !== 4 ||
    selection.crop.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
    selection.crop[2] <= selection.crop[0] || selection.crop[3] <= selection.crop[1]
  ) throw new Error(`${code}: imageSelection crop must be [x0,y0,x1,y1] with positive area`);
  const image = safeImagePath(sign.image);
  const processedAsset = safeImagePath(selection.processedAsset);
  if (processedAsset !== image) throw new Error(`${code}: imageSelection processedAsset does not match image`);
  if (selection.method === "official-qcvn-candidate") {
    if (typeof selection.candidateFile !== "string") throw new Error(`${code}: candidate image selection requires candidateFile`);
    const candidate = safeRelativePath(selection.candidateFile, "traffic sign candidate path");
    if (!candidate.startsWith("image-candidates/")) throw new Error(`${code}: candidateFile must be inside image-candidates/`);
  }
}

export function validateTrafficSignsDataset(dataset: TrafficSignsDataset): void {
  if (dataset.dataset !== "VN_TRAFFIC_SIGNS") throw new Error(`Unsupported traffic signs dataset: ${dataset.dataset}`);
  if (dataset.stage !== "production") throw new Error(`Traffic signs dataset stage must be production, found: ${dataset.stage}`);
  if (!dataset.version?.trim() || !VERSION_RE.test(dataset.version.trim())) throw new Error("Traffic signs dataset version is invalid");
  if (!dataset.validFrom?.trim() || !ISO_DATE_RE.test(dataset.validFrom.trim())) throw new Error("Traffic signs dataset validFrom must use YYYY-MM-DD");
  if (!dataset.sourceDocument?.trim()) throw new Error("Traffic signs dataset sourceDocument is required");
  if (!isSha256(dataset.sourceSha256)) throw new Error("Traffic signs dataset sourceSha256 must be a valid source document SHA-256");
  if (!Array.isArray(dataset.signs) || dataset.signs.length === 0) throw new Error("Traffic signs dataset must contain at least one verified sign");
  if (dataset.signs.length > MAX_TRAFFIC_SIGN_COUNT) throw new Error(`Traffic signs dataset exceeds maximum of ${MAX_TRAFFIC_SIGN_COUNT} records`);

  const datasetSourceSha256 = normalizedChecksum(dataset.sourceSha256);
  const codes = new Set<string>();
  for (const sign of dataset.signs) {
    const code = typeof sign.code === "string" ? sign.code.trim() : "";
    if (!code || !SIGN_CODE_RE.test(code)) throw new Error(`Invalid traffic sign code: ${String(sign.code)}`);
    if (codes.has(code)) throw new Error(`Duplicate traffic sign code: ${code}`);
    codes.add(code);

    if (typeof sign.name !== "string" || !sign.name.trim()) throw new Error(`${code}: name is required`);
    if (!GROUP_CODES.has(sign.groupCode)) throw new Error(`${code}: invalid group ${String(sign.groupCode)}`);
    if (typeof sign.meaning !== "string" || !sign.meaning.trim()) throw new Error(`${code}: meaning is required`);
    if (typeof sign.sourceVersion !== "string" || !sign.sourceVersion.trim()) throw new Error(`${code}: sourceVersion is required`);
    assertOptionalString(sign.recognition, `${code}: recognition`);
    assertOptionalString(sign.scope, `${code}: scope`);
    assertOptionalString(sign.notes, `${code}: notes`);
    assertStringArray(sign.exceptions, `${code}: exceptions`);
    assertStringArray(sign.keywords, `${code}: keywords`);
    if (sign.image !== undefined && sign.image !== null && sign.image !== "" && typeof sign.image !== "string") throw new Error(`${code}: image must be a string`);
    validateImageSelection(sign, datasetSourceSha256);
  }
}

async function metadataValue(db: Database, key: string): Promise<string | null> {
  const rows = await db.select<MetadataRow[]>("SELECT value FROM traffic_sign_metadata WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

async function signCount(db: Database): Promise<number> {
  const rows = await db.select<CountRow[]>("SELECT COUNT(*) AS count FROM traffic_signs");
  return rows[0]?.count ?? 0;
}

async function upsertMetadata(db: Database, key: string, value: string): Promise<void> {
  await db.execute(
    `INSERT INTO traffic_sign_metadata (key, value)
     VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

async function upsertSign(db: Database, sign: TrafficSignRecord): Promise<void> {
  await db.execute(
    `INSERT INTO traffic_signs (
       code, name, group_code, meaning, recognition, scope, exceptions_json,
       notes, image_path, keywords_json, source_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(code) DO UPDATE SET
       name = excluded.name,
       group_code = excluded.group_code,
       meaning = excluded.meaning,
       recognition = excluded.recognition,
       scope = excluded.scope,
       exceptions_json = excluded.exceptions_json,
       notes = excluded.notes,
       image_path = excluded.image_path,
       keywords_json = excluded.keywords_json,
       source_version = excluded.source_version`,
    [
      sign.code.trim(), sign.name.trim(), sign.groupCode, sign.meaning.trim(), sign.recognition?.trim() || null,
      sign.scope?.trim() || null, JSON.stringify(sign.exceptions.map((value) => value.trim())), sign.notes?.trim() || null,
      sign.image ? safeImagePath(sign.image) : null, JSON.stringify(sign.keywords.map((value) => value.trim())), sign.sourceVersion.trim(),
    ],
  );
}

export async function getLocalTrafficSignsState(): Promise<TrafficSignsLocalState> {
  const db = await getDatabase();
  const [version, validFrom, sourceDocument, sourceSha256, contentSha256, assetSha256, count] = await Promise.all([
    metadataValue(db, "version"), metadataValue(db, "validFrom"), metadataValue(db, "sourceDocument"),
    metadataValue(db, "sourceSha256"), metadataValue(db, "contentSha256"), metadataValue(db, "assetSha256"), signCount(db),
  ]);
  return {
    ready: Boolean(version) && count > 0,
    version,
    validFrom,
    sourceDocument,
    sourceSha256: sourceSha256?.trim() || null,
    contentSha256: contentSha256?.trim() || null,
    assetSha256: assetSha256?.trim() || null,
    signCount: count,
  };
}

export class TrafficSignsImporter {
  async import(dataset: TrafficSignsDataset, options: TrafficSignsImportOptions = {}): Promise<TrafficSignsImportResult> {
    validateTrafficSignsDataset(dataset);
    const contentSha256 = normalizedChecksum(options.contentSha256);
    const assetSha256 = normalizedChecksum(options.assetSha256);
    if (contentSha256 && !isSha256(contentSha256)) throw new Error("traffic signs contentSha256 is invalid");
    if (assetSha256 && !isSha256(assetSha256)) throw new Error("traffic signs assetSha256 is invalid");

    const db = await getDatabase();
    const [currentVersion, currentContentSha256, currentAssetSha256, currentCount] = await Promise.all([
      metadataValue(db, "version"), metadataValue(db, "contentSha256"), metadataValue(db, "assetSha256"), signCount(db),
    ]);
    if (
      !options.force && currentVersion === dataset.version && currentCount === dataset.signs.length &&
      normalizedChecksum(currentContentSha256) === contentSha256 && normalizedChecksum(currentAssetSha256) === assetSha256
    ) return { status: "up-to-date", version: dataset.version, signCount: currentCount };

    await db.execute("BEGIN IMMEDIATE TRANSACTION");
    try {
      await db.execute("DELETE FROM traffic_signs");
      for (const sign of dataset.signs) await upsertSign(db, sign);
      await upsertMetadata(db, "dataset", dataset.dataset);
      await upsertMetadata(db, "version", dataset.version.trim());
      await upsertMetadata(db, "validFrom", dataset.validFrom.trim());
      await upsertMetadata(db, "sourceDocument", dataset.sourceDocument.trim());
      await upsertMetadata(db, "sourceSha256", normalizedChecksum(dataset.sourceSha256));
      await upsertMetadata(db, "contentSha256", contentSha256);
      await upsertMetadata(db, "assetSha256", assetSha256);
      await upsertMetadata(db, "importedAt", new Date().toISOString());
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
    return { status: "imported", version: dataset.version, signCount: dataset.signs.length };
  }
}
