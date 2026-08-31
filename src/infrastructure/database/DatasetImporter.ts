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
  questionCount: number;
}

interface MetadataRow {
  value: string;
}

interface CountRow {
  count: number;
}

const EXPECTED_QUESTION_COUNT = 600;

const CATEGORIES = [
  { id: 1, code: "GENERAL_RULES", name: "Quy định chung và quy tắc giao thông", sortOrder: 1 },
  { id: 2, code: "CULTURE", name: "Văn hóa giao thông và đạo đức", sortOrder: 2 },
  { id: 3, code: "DRIVING_TECHNIQUE", name: "Kỹ thuật lái xe", sortOrder: 3 },
  { id: 4, code: "VEHICLE", name: "Cấu tạo và sửa chữa", sortOrder: 4 },
  { id: 5, code: "ROAD_SIGNS", name: "Báo hiệu đường bộ", sortOrder: 5 },
  { id: 6, code: "SITUATIONS", name: "Sa hình và xử lý tình huống", sortOrder: 6 },
] as const;

const CATEGORY_IDS: ReadonlyMap<string, number> = new Map(
  CATEGORIES.map((category) => [category.code, category.id]),
);

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
  if (dataset.questions.length !== EXPECTED_QUESTION_COUNT) {
    throw new Error(`Expected ${EXPECTED_QUESTION_COUNT} questions, found ${dataset.questions.length}`);
  }

  const ids = new Set<number>();
  for (const question of dataset.questions) {
    if (!Number.isInteger(question.id) || question.id < 1 || question.id > EXPECTED_QUESTION_COUNT) {
      throw new Error(`Invalid question id: ${question.id}`);
    }
    if (ids.has(question.id)) {
      throw new Error(`Duplicate question id: ${question.id}`);
    }
    ids.add(question.id);

    if (!CATEGORY_IDS.has(question.category)) {
      throw new Error(`Question ${question.id}: unknown category ${question.category}`);
    }
    if (question.needsVerification === true) {
      throw new Error(`Question ${question.id}: still needs verification`);
    }
    if (!question.content?.trim()) {
      throw new Error(`Question ${question.id}: content is required`);
    }
    if (!Array.isArray(question.licenses) || question.licenses.length === 0) {
      throw new Error(`Question ${question.id}: licenses are required`);
    }
    if (!Array.isArray(question.answers) || question.answers.length < 2) {
      throw new Error(`Question ${question.id}: at least 2 answers are required`);
    }

    const answerKeys = new Set<string>();
    let correctCount = 0;
    for (const answer of question.answers) {
      if (!answer.key?.trim() || answerKeys.has(answer.key)) {
        throw new Error(`Question ${question.id}: invalid or duplicated answer key ${answer.key}`);
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
  const [version, sourceSha256, count] = await Promise.all([
    metadataValue(db, "version"),
    metadataValue(db, "sourceSha256"),
    questionCount(db),
  ]);

  return {
    ready: Boolean(version) && count === EXPECTED_QUESTION_COUNT,
    version,
    sourceSha256: sourceSha256 || null,
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

  // Answers/license mappings are source data and can change between dataset versions.
  // User progress is intentionally NOT deleted because it belongs to the learner.
  await db.execute("DELETE FROM answers WHERE question_id = $1", [question.id]);
  await db.execute("DELETE FROM question_license_types WHERE question_id = $1", [question.id]);

  for (const answer of question.answers) {
    await db.execute(
      `INSERT INTO answers (question_id, answer_key, content, is_correct)
       VALUES ($1, $2, $3, $4)`,
      [question.id, answer.key, answer.content, answer.correct ? 1 : 0],
    );
  }

  for (const license of [...new Set(question.licenses)]) {
    await db.execute(
      `INSERT INTO question_license_types (question_id, license_type)
       VALUES ($1, $2)`,
      [question.id, license],
    );
  }
}

export class DatasetImporter {
  async import(dataset: ProductionDataset, options: { force?: boolean } = {}): Promise<DatasetImportResult> {
    validateDatasetForImport(dataset);
    const db = await getDatabase();

    const [currentVersion, currentSha256, currentCount] = await Promise.all([
      metadataValue(db, "version"),
      metadataValue(db, "sourceSha256"),
      questionCount(db),
    ]);

    if (
      !options.force &&
      currentVersion === dataset.version &&
      currentCount === EXPECTED_QUESTION_COUNT &&
      (!dataset.sourceSha256 || currentSha256 === dataset.sourceSha256)
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
      await upsertMetadata(db, "sourceSha256", dataset.sourceSha256 ?? "");
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
