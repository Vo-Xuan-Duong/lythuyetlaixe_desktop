import type { ExamHistorySummary, ExamResult, ExamSession } from "../entities/exam";

export interface ExamHistoryRepository {
  saveCompleted(session: ExamSession, result: ExamResult): Promise<number>;
  listRecent(limit?: number): Promise<ExamHistorySummary[]>;
}
