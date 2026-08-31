import { getDatabase } from "../database/database";

interface MetadataRow {
  key: string;
  value: string;
}

interface CountRow {
  count: number;
}

export interface LocalApplicationInfo {
  dataset: string | null;
  datasetVersion: string | null;
  validFrom: string | null;
  importedAt: string | null;
  /** SHA-256 provenance of the official source PDF. */
  sourceSha256: string | null;
  /** SHA-256 of the exact published questions.json payload. */
  contentSha256: string | null;
  /** SHA-256 of the published assets.zip payload. */
  assetSha256: string | null;
  questionCount: number;
  progressCount: number;
  bookmarkCount: number;
  examCount: number;
}

export class SqliteSettingsRepository {
  async getLocalInfo(): Promise<LocalApplicationInfo> {
    const db = await getDatabase();
    const [metadata, questionRows, progressRows, bookmarkRows, examRows] = await Promise.all([
      db.select<MetadataRow[]>("SELECT key, value FROM dataset_metadata"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM questions"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM user_progress"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM bookmarks"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM exam_sessions WHERE completed_at IS NOT NULL"),
    ]);

    const values = new Map(metadata.map((row) => [row.key, row.value]));
    const nullable = (key: string) => values.get(key)?.trim() || null;

    return {
      dataset: nullable("dataset"),
      datasetVersion: nullable("version"),
      validFrom: nullable("validFrom"),
      importedAt: nullable("importedAt"),
      sourceSha256: nullable("sourceSha256"),
      contentSha256: nullable("contentSha256"),
      assetSha256: nullable("assetSha256"),
      questionCount: questionRows[0]?.count ?? 0,
      progressCount: progressRows[0]?.count ?? 0,
      bookmarkCount: bookmarkRows[0]?.count ?? 0,
      examCount: examRows[0]?.count ?? 0,
    };
  }

  async resetLearningProgress(): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM user_progress");
  }

  async resetBookmarks(): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM bookmarks");
  }

  async resetExamHistory(): Promise<void> {
    const db = await getDatabase();
    await db.execute("BEGIN IMMEDIATE TRANSACTION");
    try {
      await db.execute("DELETE FROM exam_answers");
      await db.execute("DELETE FROM exam_sessions");
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  }

  async resetAllUserData(): Promise<void> {
    const db = await getDatabase();
    await db.execute("BEGIN IMMEDIATE TRANSACTION");
    try {
      await db.execute("DELETE FROM exam_answers");
      await db.execute("DELETE FROM exam_sessions");
      await db.execute("DELETE FROM bookmarks");
      await db.execute("DELETE FROM user_progress");
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  }
}
