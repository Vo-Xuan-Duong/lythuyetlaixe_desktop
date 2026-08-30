import type { Answer, LicenseType, Question } from "../../domain/entities/question";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository";
import { getDatabase } from "../database/database";

interface CountRow {
  count: number;
}

interface QuestionRow {
  id: number;
  category_code: string;
  content: string;
  image_path: string | null;
  is_critical: number;
  source_version: string;
  explanation: string | null;
}

interface AnswerRow {
  question_id: number;
  answer_key: string;
  content: string;
  is_correct: number;
}

interface LicenseRow {
  question_id: number;
  license_type: LicenseType;
}

export class SqliteQuestionRepository implements QuestionRepository {
  async count(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<CountRow[]>("SELECT COUNT(*) AS count FROM questions");
    return rows[0]?.count ?? 0;
  }

  async getById(id: number): Promise<Question | null> {
    const db = await getDatabase();
    const rows = await db.select<QuestionRow[]>(
      `SELECT q.id, c.code AS category_code, q.content, q.image_path,
              q.is_critical, q.source_version, q.explanation
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       WHERE q.id = $1`,
      [id],
    );

    if (!rows[0]) return null;

    const [answers, licenses] = await Promise.all([
      this.loadAnswers([id]),
      this.loadLicenses([id]),
    ]);

    return this.mapQuestion(rows[0], answers.get(id) ?? [], licenses.get(id) ?? []);
  }

  async listByCategory(categoryCode: string): Promise<Question[]> {
    return this.list(
      `SELECT q.id, c.code AS category_code, q.content, q.image_path,
              q.is_critical, q.source_version, q.explanation
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       WHERE c.code = $1
       ORDER BY q.id`,
      [categoryCode],
    );
  }

  async listCritical(): Promise<Question[]> {
    return this.list(
      `SELECT q.id, c.code AS category_code, q.content, q.image_path,
              q.is_critical, q.source_version, q.explanation
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       WHERE q.is_critical = 1
       ORDER BY q.id`,
    );
  }

  async listForLicense(licenseType: LicenseType): Promise<Question[]> {
    return this.list(
      `SELECT q.id, c.code AS category_code, q.content, q.image_path,
              q.is_critical, q.source_version, q.explanation
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       JOIN question_license_types qlt ON qlt.question_id = q.id
       WHERE qlt.license_type = $1
       ORDER BY q.id`,
      [licenseType],
    );
  }

  private async list(query: string, bindValues: unknown[] = []): Promise<Question[]> {
    const db = await getDatabase();
    const rows = await db.select<QuestionRow[]>(query, bindValues);
    const ids = rows.map((row) => row.id);

    if (ids.length === 0) return [];

    const [answers, licenses] = await Promise.all([
      this.loadAnswers(ids),
      this.loadLicenses(ids),
    ]);

    return rows.map((row) =>
      this.mapQuestion(row, answers.get(row.id) ?? [], licenses.get(row.id) ?? []),
    );
  }

  private async loadAnswers(ids: number[]): Promise<Map<number, Answer[]>> {
    const db = await getDatabase();
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await db.select<AnswerRow[]>(
      `SELECT question_id, answer_key, content, is_correct
       FROM answers
       WHERE question_id IN (${placeholders})
       ORDER BY question_id, answer_key`,
      ids,
    );

    const grouped = new Map<number, Answer[]>();
    for (const row of rows) {
      const current = grouped.get(row.question_id) ?? [];
      current.push({
        key: row.answer_key,
        content: row.content,
        correct: row.is_correct === 1,
      });
      grouped.set(row.question_id, current);
    }
    return grouped;
  }

  private async loadLicenses(ids: number[]): Promise<Map<number, LicenseType[]>> {
    const db = await getDatabase();
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await db.select<LicenseRow[]>(
      `SELECT question_id, license_type
       FROM question_license_types
       WHERE question_id IN (${placeholders})
       ORDER BY question_id, license_type`,
      ids,
    );

    const grouped = new Map<number, LicenseType[]>();
    for (const row of rows) {
      const current = grouped.get(row.question_id) ?? [];
      current.push(row.license_type);
      grouped.set(row.question_id, current);
    }
    return grouped;
  }

  private mapQuestion(row: QuestionRow, answers: Answer[], licenses: LicenseType[]): Question {
    return {
      id: row.id,
      categoryCode: row.category_code,
      content: row.content,
      imagePath: row.image_path ?? undefined,
      critical: row.is_critical === 1,
      licenses,
      answers,
      explanation: row.explanation ?? undefined,
      sourceVersion: row.source_version,
    };
  }
}
