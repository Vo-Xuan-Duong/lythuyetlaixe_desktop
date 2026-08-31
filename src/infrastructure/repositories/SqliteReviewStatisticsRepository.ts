import type {
  CategoryStatistics,
  CriticalStatistics,
  ExamStatistics,
  LearningOverviewStatistics,
  RecentExamStatistics,
  ReviewQueueItem,
  ReviewQueueMode,
  StatisticsSnapshot,
} from "../../domain/entities/reviewStatistics";
import type { MasteryLevel } from "../../domain/entities/progress";
import type { LicenseType } from "../../domain/entities/question";
import type { ReviewStatisticsRepository } from "../../domain/repositories/ReviewStatisticsRepository";
import { getDatabase } from "../database/database";

interface ReviewRow {
  question_id: number;
  content: string;
  category_code: string;
  category_name: string;
  is_critical: number;
  attempt_count: number;
  correct_count: number;
  wrong_count: number;
  mastery: MasteryLevel;
  next_review_at: string | null;
  bookmarked: number;
}

interface LearningOverviewRow {
  total_questions: number;
  learned_questions: number;
  mastered_questions: number;
  due_questions: number;
  attempt_count: number;
  correct_count: number;
  wrong_count: number;
}

interface CategoryRow {
  code: string;
  name: string;
  question_count: number;
  learned_questions: number;
  mastered_questions: number;
  attempt_count: number;
  correct_count: number;
  wrong_count: number;
}

interface CriticalRow {
  question_count: number;
  learned_questions: number;
  mastered_questions: number;
  wrong_questions: number;
}

interface ExamAggregateRow {
  total_exams: number;
  passed_exams: number;
  average_score_percent: number | null;
}

interface RecentExamRow {
  id: number;
  license_type: LicenseType;
  question_count: number;
  score: number | null;
  passed: number | null;
  critical_failed: number;
  completed_at: string | null;
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  return Math.min(Math.max(value ?? fallback, 1), max);
}

export class SqliteReviewStatisticsRepository implements ReviewStatisticsRepository {
  async listReviewQueue(
    mode: ReviewQueueMode,
    options: { now?: string; limit?: number } = {},
  ): Promise<ReviewQueueItem[]> {
    const db = await getDatabase();
    const now = options.now ?? new Date().toISOString();
    const limit = clampLimit(options.limit, 60, 200);

    const condition = (() => {
      switch (mode) {
        case "due":
          return "p.next_review_at IS NOT NULL AND datetime(p.next_review_at) <= datetime($1)";
        case "weak":
          return "p.attempt_count > 0 AND (p.wrong_count > 0 OR p.mastery < 4)";
        case "wrong":
          return "p.wrong_count > 0";
      }
    })();

    const orderBy = (() => {
      switch (mode) {
        case "due":
          return "datetime(p.next_review_at) ASC, p.mastery ASC, p.wrong_count DESC, q.id ASC";
        case "weak":
          return `p.mastery ASC,
                  (CAST(p.correct_count AS REAL) / NULLIF(p.attempt_count, 0)) ASC,
                  p.wrong_count DESC,
                  p.attempt_count DESC,
                  q.id ASC`;
        case "wrong":
          return "p.wrong_count DESC, p.mastery ASC, p.attempt_count DESC, q.id ASC";
      }
    })();

    const bindValues = mode === "due" ? [now, limit] : [limit];
    const limitPlaceholder = mode === "due" ? "$2" : "$1";

    const rows = await db.select<ReviewRow[]>(
      `SELECT
         q.id AS question_id,
         q.content,
         c.code AS category_code,
         c.name AS category_name,
         q.is_critical,
         p.attempt_count,
         p.correct_count,
         p.wrong_count,
         p.mastery,
         p.next_review_at,
         CASE WHEN b.question_id IS NULL THEN 0 ELSE 1 END AS bookmarked
       FROM user_progress p
       JOIN questions q ON q.id = p.question_id
       JOIN categories c ON c.id = q.category_id
       LEFT JOIN bookmarks b ON b.question_id = q.id
       WHERE ${condition}
       ORDER BY ${orderBy}
       LIMIT ${limitPlaceholder}`,
      bindValues,
    );

    return rows.map((row) => this.mapReviewRow(row));
  }

  async getStatistics(
    options: { now?: string; recentExamLimit?: number } = {},
  ): Promise<StatisticsSnapshot> {
    const db = await getDatabase();
    const now = options.now ?? new Date().toISOString();
    const recentExamLimit = clampLimit(options.recentExamLimit, 8, 50);

    const [learningRows, categoryRows, criticalRows, examRows, recentExamRows, weakestQuestions] =
      await Promise.all([
        db.select<LearningOverviewRow[]>(
          `SELECT
             COUNT(q.id) AS total_questions,
             COALESCE(SUM(CASE WHEN p.attempt_count > 0 THEN 1 ELSE 0 END), 0) AS learned_questions,
             COALESCE(SUM(CASE WHEN p.mastery = 4 THEN 1 ELSE 0 END), 0) AS mastered_questions,
             COALESCE(SUM(CASE
               WHEN p.next_review_at IS NOT NULL AND datetime(p.next_review_at) <= datetime($1)
               THEN 1 ELSE 0 END), 0) AS due_questions,
             COALESCE(SUM(p.attempt_count), 0) AS attempt_count,
             COALESCE(SUM(p.correct_count), 0) AS correct_count,
             COALESCE(SUM(p.wrong_count), 0) AS wrong_count
           FROM questions q
           LEFT JOIN user_progress p ON p.question_id = q.id`,
          [now],
        ),
        db.select<CategoryRow[]>(
          `SELECT
             c.code,
             c.name,
             COUNT(q.id) AS question_count,
             COALESCE(SUM(CASE WHEN p.attempt_count > 0 THEN 1 ELSE 0 END), 0) AS learned_questions,
             COALESCE(SUM(CASE WHEN p.mastery = 4 THEN 1 ELSE 0 END), 0) AS mastered_questions,
             COALESCE(SUM(p.attempt_count), 0) AS attempt_count,
             COALESCE(SUM(p.correct_count), 0) AS correct_count,
             COALESCE(SUM(p.wrong_count), 0) AS wrong_count
           FROM categories c
           LEFT JOIN questions q ON q.category_id = c.id
           LEFT JOIN user_progress p ON p.question_id = q.id
           GROUP BY c.id, c.code, c.name, c.sort_order
           ORDER BY c.sort_order`,
        ),
        db.select<CriticalRow[]>(
          `SELECT
             COUNT(q.id) AS question_count,
             COALESCE(SUM(CASE WHEN p.attempt_count > 0 THEN 1 ELSE 0 END), 0) AS learned_questions,
             COALESCE(SUM(CASE WHEN p.mastery = 4 THEN 1 ELSE 0 END), 0) AS mastered_questions,
             COALESCE(SUM(CASE WHEN p.wrong_count > 0 THEN 1 ELSE 0 END), 0) AS wrong_questions
           FROM questions q
           LEFT JOIN user_progress p ON p.question_id = q.id
           WHERE q.is_critical = 1`,
        ),
        db.select<ExamAggregateRow[]>(
          `SELECT
             COUNT(*) AS total_exams,
             COALESCE(SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END), 0) AS passed_exams,
             AVG(CASE
               WHEN score IS NOT NULL AND question_count > 0
               THEN (CAST(score AS REAL) * 100.0 / question_count)
               ELSE NULL END) AS average_score_percent
           FROM exam_sessions
           WHERE completed_at IS NOT NULL`,
        ),
        db.select<RecentExamRow[]>(
          `SELECT id, license_type, question_count, score, passed, critical_failed, completed_at
           FROM exam_sessions
           WHERE completed_at IS NOT NULL
           ORDER BY datetime(completed_at) DESC, id DESC
           LIMIT $1`,
          [recentExamLimit],
        ),
        this.listReviewQueue("weak", { now, limit: 8 }),
      ]);

    const learningRow = learningRows[0] ?? {
      total_questions: 0,
      learned_questions: 0,
      mastered_questions: 0,
      due_questions: 0,
      attempt_count: 0,
      correct_count: 0,
      wrong_count: 0,
    };
    const learning: LearningOverviewStatistics = {
      totalQuestions: learningRow.total_questions,
      learnedQuestions: learningRow.learned_questions,
      masteredQuestions: learningRow.mastered_questions,
      dueQuestions: learningRow.due_questions,
      attemptCount: learningRow.attempt_count,
      correctCount: learningRow.correct_count,
      wrongCount: learningRow.wrong_count,
      accuracyPercent: percent(learningRow.correct_count, learningRow.attempt_count),
    };

    const categories: CategoryStatistics[] = categoryRows.map((row) => ({
      code: row.code,
      name: row.name,
      questionCount: row.question_count,
      learnedQuestions: row.learned_questions,
      masteredQuestions: row.mastered_questions,
      attemptCount: row.attempt_count,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      accuracyPercent: percent(row.correct_count, row.attempt_count),
    }));

    const criticalRow = criticalRows[0] ?? {
      question_count: 0,
      learned_questions: 0,
      mastered_questions: 0,
      wrong_questions: 0,
    };
    const critical: CriticalStatistics = {
      questionCount: criticalRow.question_count,
      learnedQuestions: criticalRow.learned_questions,
      masteredQuestions: criticalRow.mastered_questions,
      wrongQuestions: criticalRow.wrong_questions,
    };

    const examRow = examRows[0] ?? {
      total_exams: 0,
      passed_exams: 0,
      average_score_percent: null,
    };
    const exams: ExamStatistics = {
      totalExams: examRow.total_exams,
      passedExams: examRow.passed_exams,
      failedExams: Math.max(0, examRow.total_exams - examRow.passed_exams),
      passRatePercent: percent(examRow.passed_exams, examRow.total_exams),
      averageScorePercent: Math.round(examRow.average_score_percent ?? 0),
    };

    const recentExams: RecentExamStatistics[] = recentExamRows.map((row) => ({
      id: row.id,
      licenseType: row.license_type,
      questionCount: row.question_count,
      score: row.score ?? undefined,
      passed: row.passed === null ? undefined : row.passed === 1,
      criticalFailed: row.critical_failed === 1,
      completedAt: row.completed_at ?? undefined,
    }));

    return {
      learning,
      categories,
      critical,
      exams,
      recentExams,
      weakestQuestions,
    };
  }

  private mapReviewRow(row: ReviewRow): ReviewQueueItem {
    return {
      questionId: row.question_id,
      content: row.content,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      critical: row.is_critical === 1,
      attemptCount: row.attempt_count,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      mastery: row.mastery,
      nextReviewAt: row.next_review_at ?? undefined,
      bookmarked: row.bookmarked === 1,
    };
  }
}
