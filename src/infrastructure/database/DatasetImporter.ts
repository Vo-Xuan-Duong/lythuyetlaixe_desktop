import type Database from "@tauri-apps/plugin-sql";
import { getDatabase } from "./database";

export interface DatasetAnswer {
  key: string;
  content: string;
  correct: boolean;
}

export interface DatasetQuestion {
  id: number;
  category: string;
  content: string;
  image?: string | null;
  critical: boolean;
  licenses: string[];
  sourceVersion: string;
  explanation?: string | null;
  needsVerification?: boolean;
  answers: DatasetAnswer[];
}

export interface ProductionDataset {
  dataset: "VN_GPLX_600";
  version: string;
  validFrom: string;
  stage: "production";
  /** SHA-256 provenance of the official source PDF, not questions.json. */
  sourceSha256?: string | null;
  questions: DatasetQuestion[];
}

export interface DatasetImportResult {
  status: "imported" | "up-to-date";
  version: string;
  questionCount: number;
}

export interface LocalDatasetState {
  ready: boolean;
  version: string | null;
  sourceSha256: string | null;
  contentSha256: string | null;
  assetSha256: string | null;
  questionCount: number;
}

export interface DatasetImportOptions {
  force?: boolean;
  /** SHA-256 of the exact published questions.json payload. */
  contentSha256?: string | null;
  /** SHA-256 of the published assets.zip payload, empty when there is no package. */
  assetSha256?: string | null;
}

interface MetadataRow {
  value: string;
}

interface CountRow {
  count: number;
}

const EXPECTED_QUESTION_COUNT = 600;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_ANSWER_KEYS = new Set(["A", "B", "C", "D"]);
const SUPPORTED_LICENSES = new Set([
  "B",
  "C1",
  "C",
  "D1",
  "D2",
  "D",
  "BE",
  "C1E",
  "CE",
  "D1E",
  "D2E",
  "DE",
]);

const CRITICAL_QUESTION_IDS = new Set([
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 32, 34, 35, 47, 48, 52, 53, 55,
  58, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74, 85, 86, 87, 88, 89, 90, 91, 92,
  93, 97, 98, 102, 117, 163, 165, 167, 197, 198, 206, 215, 226, 234, 245, 246, 252,
  253, 254, 255, 260,
]);

const CATEGORIES = [
  { id: 1, code: "GENERAL_RULES", name: "Quy định chung và quy tắc giao thông", sortOrder: 1, from: 1, to: 180 },
  { id: 2, code: "CULTURE", name: "Văn hóa giao thông và đạo đức", sortOrder: 2, from: 181, to: 205 },
  { id: 3, code: "DRIVING_TECHNIQUE", name: "Kỹ thuật lái xe", sortOrder: 3, from: 206, to: 263 },
  { id: 4, code: "VEHICLE", name: "Cấu tạo và sửa chữa", sortOrder: 4, from: 264, to: 300 },
  { id: 5, code: "ROAD_SIGNS", name: "Báo hiệu đường bộ", sortOrder: 5, from: 301, to: 485 },
  { id: 6, code: "SITUATIONS", name: "Sa hình và xử lý tình huống", sortOrder: 6, from: 486, to: 600 },
] as const;

const CATEGORY_IDS: ReadonlyMap<string, number> = new Map(
  CATEGORIES.map((category) => [category.code, category.id]),
);

function normalizedChecksum(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
}

function isSha256(value?: string | null): boolean {
  return /^[a-f0-9]{64}$/.test(normalizedChecksum(value));
}

function expectedCategory(questionId: number): string | undefined {
  return CATEGORIES.find((category) => questionId >= category.from && questionId <= category.to)?.code;
}

function normalizeImagePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe image path: ${value}`);
  }

  const filename = segments.at(-1) ?? "";
  const extensionIndex = filename.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex).toLowerCase() : "";
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported image type: ${value}`);
  }
  return segments.join("/");
}

export function validateDatasetForImport(dataset: ProductionDataset): void {
  if (dataset.dataset !== "VN_GPLX_600") {
    throw new Error(`Unsupported dataset: ${dataset.dataset}`);
  }
  if (dataset.stage !== "production") {
    throw new Error(`Dataset stage must be production, found: ${dataset.stage}`);
  }
  if (!dataset.version?.trim()) {
    throw new Error("Dataset version is required");
  }
  if (!dataset.validFrom?.trim()) {
    throw new Error("Dataset validFrom is required");
  }
  if (!isSha256(dataset.sourceSha256)) {
    throw new Error("Dataset sourceSha256 must contain the official PDF SHA-256 provenance");
  }
  if (!Array.isArray(dataset.questions) || dataset.questions.length !== EXPECTED_QUESTION_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_QUESTION_COUNT} questions, found ${Array.isArray(dataset.questions) ? dataset.questions.length : 0}`,
    );
  }

  const ids = new Set<number>();
  let criticalCount = 0;

  for (const question of dataset.questions) {
    if (!Number.isInteger(question.id) || question.id < 1 || question.id > EXPECTED_QUESTION_COUNT) {
      throw new Error(`Invalid question id: ${question.id}`);
    }
    if (ids.has(question.id)) {
      throw new Error(`Duplicate question id: ${question.id}`);
    }
    ids.add(question.id);

    const category = expectedCategory(question.id);
    if (!category || question.category !== category) {
      throw new Error(
        `Question ${question.id}: expected category ${category ?? "unknown"}, found ${question.category}`,
      );
    }

    const expectedCritical = CRITICAL_QUESTION_IDS.has(question.id);
    if (question.critical !== expectedCritical) {
      throw new Error(
        `Question ${question.id}: critical flag must be ${expectedCritical ? "true" : "false"}`,
      );
    }
    if (question.critical) criticalCount += 1;

    if (question.needsVerification === true) {
      throw new Error(`Question ${question.id}: still needs verification`);
    }
    if (!question.content?.trim()) {
      throw new Error(`Question ${question.id}: content is required`);
    }
    if (!question.sourceVersion?.trim()) {
      throw new Error(`Question ${question.id}: sourceVersion is required`);
    }

    if (question.image !== undefined && question.image !== null && question.image !== "") {
      if (typeof question.image !== "string") {
        throw new Error(`Question ${question.id}: image must be a string or null`);
      }
      normalizeImagePath(question.image);
    }

    if (!Array.isArray(question.licenses) || question.licenses.length === 0) {
      throw new Error(`Question ${question.id}: licenses are required`);
    }
    const uniqueLicenses = new Set<string>();
    for (const license of question.licenses) {
      if (typeof license !== "string" || !SUPPORTED_LICENSES.has(license)) {
        throw new Error(`Question ${question.id}: unsupported license ${String(license)}`);
      }
      if (uniqueLicenses.has(license)) {
        throw new Error(`Question ${question.id}: duplicated license ${license}`);
      }
      uniqueLicenses.add(license);
    }

    if (!Array.isArray(question.answers) || question.answers.length < 2 || question.answers.length > 4) {
      throw new Error(`Question ${question.id}: expected between 2 and 4 answers`);
    }

    const answerKeys = new Set<string>();
    let correctCount = 0;
    for (const answer of question.answers) {
      if (
        typeof answer.key !== "string" ||
        !ALLOWED_ANSWER_KEYS.has(answer.key) ||
        answerKeys.has(answer.key)
      ) {
        throw new Error(`Question ${question.id}: invalid or duplicated answer key ${String(answer.key)}`);
      }
      answerKeys.add(answer.key);
      if (!answer.content?.trim()) {
        throw new Error(`Question ${question.id}: answer ${answer.key} content is required`);
      }
      if (typeof answer.correct !== "boolean") {
        throw new Error(`Question ${question.id}: answer ${answer.key} correct must be boolean`);
      }
      if (answer.correct) correctCount += 1;
    }
    if (correctCount !== 1) {
      throw new Error(`Question ${question.id}: expected exactly 1 correct answer, found ${correctCount}`);
    }
  }

  if (criticalCount !== CRITICAL_QUESTION_IDS.size) {
    throw new Error(
      `Expected ${CRITICAL_QUESTION_IDS.size} critical questions, found ${criticalCount}`,
    );
  }
}

async function metadataValue(db: Database, key: string): Promise<string | null> {
  const rows = await db.select<MetadataRow[]>(
    "SELECT value FROM dataset_metadata WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function questionCount(db: Database): Promise<number> {
  const rows = await db.select<CountRow[]>("SELECT COUNT(*) AS count FROM questions");
  return rows[0]?.count ?? 0;
}

export async function getLocalDatasetState(): Promise<LocalDatasetState> {
  const db = await getDatabase();
  const [version, sourceSha256, contentSha256, assetSha256, count] = await Promise.all([
    metadataValue(db, "version"),
    metadataValue(db, "sourceSha256"),
    metadataValue(db, "contentSha256"),
    metadataValue(db, "assetSha256"),
    questionCount(db),
  ]);

  return {
    ready: Boolean(version) && count === EXPECTED_QUESTION_COUNT,
    version,
    sourceSha256: sourceSha256?.trim() || null,
    contentSha256: contentSha256?.trim() || null,
    assetSha256: assetSha256?.trim() || null,
    questionCount: count,
  };
}

async function upsertMetadata(db: Database, key: string, value: string): Promise<void> {
  await db.execute(
    `INSERT INTO dataset_metadata (key, value)
     VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/**
 * Builds before contentSha256 existed stored the questions.json checksum in
 * sourceSha256. When the remote manifest proves that exact relationship, move
 * the value to the correct key and clear the invalid PDF provenance.
 */
export async function migrateLegacyContentChecksum(remoteContentSha256: string): Promise<boolean> {
  const normalizedRemote = normalizedChecksum(remoteContentSha256);
  if (!isSha256(normalizedRemote)) return false;

  const db = await getDatabase();
  const [currentContent, currentSource] = await Promise.all([
    metadataValue(db, "contentSha256"),
    metadataValue(db, "sourceSha256"),
  ]);

  if (normalizedChecksum(currentContent)) return false;
  if (normalizedChecksum(currentSource) !== normalizedRemote) return false;

  await db.execute("BEGIN IMMEDIATE TRANSACTION");
  try {
    await upsertMetadata(db, "contentSha256", normalizedRemote);
    await upsertMetadata(db, "sourceSha256", "");
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
  return true;
}

async function seedCategories(db: Database): Promise<void> {
  for (const category of CATEGORIES) {
    await db.execute(
      `INSERT INTO categories (id, code, name, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         name = excluded.name,
         sort_order = excluded.sort_order`,
      [category.id, category.code, category.name, category.sortOrder],
    );
  }
}

async function upsertQuestion(db: Database, question: DatasetQuestion): Promise<void> {
  const categoryId = CATEGORY_IDS.get(question.category);
  if (!categoryId) throw new Error(`Unknown category: ${question.category}`);

  await db.execute(
    `INSERT INTO questions (
       id, category_id, content, image_path, is_critical, source_version, explanation
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id,
       content = excluded.content,
       image_path = excluded.image_path,
       is_critical = excluded.is_critical,
       source_version = excluded.source_version,
       explanation = excluded.explanation`,
    [
      question.id,
      categoryId,
      question.content,
      question.image ?? null,
      question.critical ? 1 : 0,
      question.sourceVersion,
      question.explanation ?? null,
    ],
  );

  await db.execute("DELETE FROM answers WHERE question_id = $1", [question.id]);
  await db.execute("DELETE FROM question_license_types WHERE question_id = $1", [question.id]);

  for (const answer of question.answers) {
    await db.execute(
      `INSERT INTO answers (question_id, answer_key, content, is_correct)
       VALUES ($1, $2, $3, $4)`,
      [question.id, answer.key, answer.content, answer.correct ? 1 : 0],
    );
  }

  for (const license of question.licenses) {
    await db.execute(
      `INSERT INTO question_license_types (question_id, license_type)
       VALUES ($1, $2)`,
      [question.id, license],
    );
  }
}

export class DatasetImporter {
  async import(
    dataset: ProductionDataset,
    options: DatasetImportOptions = {},
  ): Promise<DatasetImportResult> {
    validateDatasetForImport(dataset);

    const requestedContentSha256 = normalizedChecksum(options.contentSha256);
    const requestedAssetSha256 = normalizedChecksum(options.assetSha256);
    if (requestedContentSha256 && !isSha256(requestedContentSha256)) {
      throw new Error("contentSha256 must be a valid SHA-256 digest");
    }
    if (requestedAssetSha256 && !isSha256(requestedAssetSha256)) {
      throw new Error("assetSha256 must be a valid SHA-256 digest");
    }

    const db = await getDatabase();
    const [currentVersion, currentContentSha256, currentAssetSha256, currentCount] = await Promise.all([
      metadataValue(db, "version"),
      metadataValue(db, "contentSha256"),
      metadataValue(db, "assetSha256"),
      questionCount(db),
    ]);

    if (
      !options.force &&
      currentVersion === dataset.version &&
      currentCount === EXPECTED_QUESTION_COUNT &&
      normalizedChecksum(currentContentSha256) === requestedContentSha256 &&
      normalizedChecksum(currentAssetSha256) === requestedAssetSha256
    ) {
      return {
        status: "up-to-date",
        version: dataset.version,
        questionCount: currentCount,
      };
    }

    await db.execute("BEGIN IMMEDIATE TRANSACTION");
    try {
      await seedCategories(db);
      for (const question of dataset.questions) {
        await upsertQuestion(db, question);
      }

      await upsertMetadata(db, "dataset", dataset.dataset);
      await upsertMetadata(db, "version", dataset.version);
      await upsertMetadata(db, "validFrom", dataset.validFrom);
      await upsertMetadata(db, "sourceSha256", normalizedChecksum(dataset.sourceSha256));
      await upsertMetadata(db, "contentSha256", requestedContentSha256);
      await upsertMetadata(db, "assetSha256", requestedAssetSha256);
      await upsertMetadata(db, "importedAt", new Date().toISOString());
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }

    return {
      status: "imported",
      version: dataset.version,
      questionCount: dataset.questions.length,
    };
  }
}
