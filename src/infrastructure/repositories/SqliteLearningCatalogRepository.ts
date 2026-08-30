import type {
  LearningCatalogQuery,
  LearningCatalogResult,
  LearningCategorySummary,
  LearningQuestionSummary,
} from "../../domain/entities/learningCatalog";
import type { LearningCatalogRepository } from "../../domain/repositories/LearningCatalogRepository";
import { getDatabase } from "../database/database";

interface CatalogRow {
  id: number;
  category_code: string;
  content: string;
  is_critical: number;
  attempt_count: number;
  correct_count: number;
  wrong_count: number;
  mastery: 0 | 1 | 2 | 3 | 4;
  bookmarked: number;
}

interface CountRow {
  count: number;
}

interface CategoryRow {
  id: number;
  code: string;
  name: string;
  question_count: number;
  learned_count: number;
  wrong_count: number;
  mastered_count: number;
}

export class SqliteLearningCatalogRepository implements LearningCatalogRepository {
  async list(query: LearningCatalogQuery = {}): Promise<LearningCatalogResult> {
    const db = await getDatabase();
    const where: string[] = [];
    const bindValues: unknown[] = [];

    const bind = (value: unknown): string => {
      bindValues.push(value);
      return `$${bindValues.length}`;
    };

    if (query.categoryCode) {
      where.push(`c.code = ${bind(query.categoryCode)}`);
    }

    switch (query.filter ?? "all") {
      case "unlearned":
        where.push("COALESCE(p.attempt_count, 0) = 0");
        break;
      case "learned":
        where.push("COALESCE(p.attempt_count, 0) > 0");
        break;
      case "wrong":
        where.push("COALESCE(p.wrong_count, 0) > 0");
        break;
      case "bookmarked":
        where.push("b.question_id IS NOT NULL");
        break;
      case "all":
        break;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Math.max(query.limit ?? 60, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const limitPlaceholder = bind(limit);
    const offsetPlaceholder = bind(offset);

    const rows = await db.select<CatalogRow[]>(
      `SELECT
         q.id,
         c.code AS category_code,
         q.content,
         q.is_critical,
         COALESCE(p.attempt_count, 0) AS attempt_count,
         COALESCE(p.correct_count, 0) AS correct_count,
         COALESCE(p.wrong_count, 0) AS wrong_count,
         COALESCE(p.mastery, 0) AS mastery,
         CASE WHEN b.question_id IS NULL THEN 0 ELSE 1 END AS bookmarked
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       LEFT JOIN user_progress p ON p.question_id = q.id
       LEFT JOIN bookmarks b ON b.question_id = q.id
       ${whereSql}
       ORDER BY q.id
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      bindValues,
    );

    const countBindValues = bindValues.slice(0, bindValues.length - 2);
    const countRows = await db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       LEFT JOIN user_progress p ON p.question_id = q.id
       LEFT JOIN bookmarks b ON b.question_id = q.id
       ${whereSql}`,
      countBindValues,
    );

    return {
      items: rows.map((row) => this.mapQuestion(row)),
      total: countRows[0]?.count ?? 0,
    };
  }

  async listCategories(): Promise<LearningCategorySummary[]> {
    const db = await getDatabase();
    const rows = await db.select<CategoryRow[]>(
      `SELECT
         c.id,
         c.code,
         c.name,
         COUNT(q.id) AS question_count,
         COALESCE(SUM(CASE WHEN p.attempt_count > 0 THEN 1 ELSE 0 END), 0) AS learned_count,
         COALESCE(SUM(CASE WHEN p.wrong_count > 0 THEN 1 ELSE 0 END), 0) AS wrong_count,
         COALESCE(SUM(CASE WHEN p.mastery = 4 THEN 1 ELSE 0 END), 0) AS mastered_count
       FROM categories c
       LEFT JOIN questions q ON q.category_id = c.id
       LEFT JOIN user_progress p ON p.question_id = q.id
       GROUP BY c.id, c.code, c.name, c.sort_order
       ORDER BY c.sort_order`,
    );

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      questionCount: row.question_count,
      learnedCount: row.learned_count,
      wrongCount: row.wrong_count,
      masteredCount: row.mastered_count,
    }));
  }

  private mapQuestion(row: CatalogRow): LearningQuestionSummary {
    return {
      id: row.id,
      categoryCode: row.category_code,
      content: row.content,
      critical: row.is_critical === 1,
      attemptCount: row.attempt_count,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      mastery: row.mastery,
      bookmarked: row.bookmarked === 1,
    };
  }
}
