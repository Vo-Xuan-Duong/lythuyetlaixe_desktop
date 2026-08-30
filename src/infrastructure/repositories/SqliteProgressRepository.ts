import type { QuestionProgress } from "../../domain/entities/progress";
import type { ProgressRepository } from "../../domain/repositories/ProgressRepository";
import { getDatabase } from "../database/database";

interface ProgressRow {
  question_id: number;
  attempt_count: number;
  correct_count: number;
  wrong_count: number;
  mastery: 0 | 1 | 2 | 3 | 4;
  last_answered_at: string | null;
  next_review_at: string | null;
}

interface BookmarkRow {
  question_id: number;
}

export class SqliteProgressRepository implements ProgressRepository {
  async get(questionId: number): Promise<QuestionProgress | null> {
    const db = await getDatabase();
    const rows = await db.select<ProgressRow[]>(
      `SELECT question_id, attempt_count, correct_count, wrong_count, mastery,
              last_answered_at, next_review_at
       FROM user_progress
       WHERE question_id = $1`,
      [questionId],
    );

    return rows[0] ? this.mapProgress(rows[0]) : null;
  }

  async save(progress: QuestionProgress): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO user_progress (
         question_id, attempt_count, correct_count, wrong_count, mastery,
         last_answered_at, next_review_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(question_id) DO UPDATE SET
         attempt_count = excluded.attempt_count,
         correct_count = excluded.correct_count,
         wrong_count = excluded.wrong_count,
         mastery = excluded.mastery,
         last_answered_at = excluded.last_answered_at,
         next_review_at = excluded.next_review_at`,
      [
        progress.questionId,
        progress.attemptCount,
        progress.correctCount,
        progress.wrongCount,
        progress.mastery,
        progress.lastAnsweredAt ?? null,
        progress.nextReviewAt ?? null,
      ],
    );
  }

  async listWeak(limit = 20): Promise<QuestionProgress[]> {
    const db = await getDatabase();
    const rows = await db.select<ProgressRow[]>(
      `SELECT question_id, attempt_count, correct_count, wrong_count, mastery,
              last_answered_at, next_review_at
       FROM user_progress
       WHERE wrong_count > 0
       ORDER BY mastery ASC, wrong_count DESC, attempt_count DESC
       LIMIT $1`,
      [limit],
    );

    return rows.map((row) => this.mapProgress(row));
  }

  async isBookmarked(questionId: number): Promise<boolean> {
    const db = await getDatabase();
    const rows = await db.select<BookmarkRow[]>(
      "SELECT question_id FROM bookmarks WHERE question_id = $1 LIMIT 1",
      [questionId],
    );
    return rows.length > 0;
  }

  async addBookmark(questionId: number): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "INSERT OR IGNORE INTO bookmarks (question_id, created_at) VALUES ($1, $2)",
      [questionId, new Date().toISOString()],
    );
  }

  async removeBookmark(questionId: number): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM bookmarks WHERE question_id = $1", [questionId]);
  }

  async listBookmarkIds(): Promise<number[]> {
    const db = await getDatabase();
    const rows = await db.select<BookmarkRow[]>(
      "SELECT question_id FROM bookmarks ORDER BY created_at DESC",
    );
    return rows.map((row) => row.question_id);
  }

  private mapProgress(row: ProgressRow): QuestionProgress {
    return {
      questionId: row.question_id,
      attemptCount: row.attempt_count,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      mastery: row.mastery,
      lastAnsweredAt: row.last_answered_at ?? undefined,
      nextReviewAt: row.next_review_at ?? undefined,
    };
  }
}
