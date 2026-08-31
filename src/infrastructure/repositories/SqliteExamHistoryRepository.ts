import type { ExamHistorySummary, ExamResult, ExamSession } from "../../domain/entities/exam";
import type { LicenseType } from "../../domain/entities/question";
import type { ExamHistoryRepository } from "../../domain/repositories/ExamHistoryRepository";
import { getDatabase, withDatabaseWriteLock } from "../database/database";

interface HistoryRow {
  id: number;
  license_type: LicenseType;
  question_count: number;
  score: number | null;
  passed: number | null;
  critical_failed: number;
  started_at: string;
  completed_at: string | null;
}

export class SqliteExamHistoryRepository implements ExamHistoryRepository {
  async saveCompleted(session: ExamSession, result: ExamResult): Promise<number> {
    const completedAt = session.submittedAt ?? new Date().toISOString();

    return withDatabaseWriteLock(async (db) => {
      await db.execute("BEGIN IMMEDIATE TRANSACTION");
      try {
        const insert = await db.execute(
          `INSERT INTO exam_sessions (
             license_type, question_count, score, passed, critical_failed, started_at, completed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            session.config.licenseType,
            session.config.questionCount,
            result.score,
            result.passed ? 1 : 0,
            result.criticalFailed ? 1 : 0,
            session.startedAt,
            completedAt,
          ],
        );

        const sessionId = insert.lastInsertId;
        if (sessionId === undefined) throw new Error("SQLite did not return exam session id");

        for (const answer of result.answers) {
          await db.execute(
            `INSERT INTO exam_answers (
               exam_session_id, question_id, selected_answer_key, is_correct
             ) VALUES ($1, $2, $3, $4)`,
            [
              sessionId,
              answer.questionId,
              answer.selectedAnswerKey ?? null,
              answer.correct ? 1 : 0,
            ],
          );
        }

        await db.execute("COMMIT");
        return sessionId;
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }
    });
  }

  async listRecent(limit = 20): Promise<ExamHistorySummary[]> {
    const db = await getDatabase();
    const rows = await db.select<HistoryRow[]>(
      `SELECT id, license_type, question_count, score, passed, critical_failed,
              started_at, completed_at
       FROM exam_sessions
       ORDER BY started_at DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 100)],
    );

    return rows.map((row) => ({
      id: row.id,
      licenseType: row.license_type,
      questionCount: row.question_count,
      score: row.score ?? undefined,
      passed: row.passed === null ? undefined : row.passed === 1,
      criticalFailed: row.critical_failed === 1,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
    }));
  }
}
