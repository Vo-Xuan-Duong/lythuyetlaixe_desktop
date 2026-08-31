import type {
  ReviewQueueItem,
  ReviewQueueMode,
  StatisticsSnapshot,
} from "../entities/reviewStatistics";

export interface ReviewStatisticsRepository {
  listReviewQueue(
    mode: ReviewQueueMode,
    options?: { now?: string; limit?: number },
  ): Promise<ReviewQueueItem[]>;
  getStatistics(options?: { now?: string; recentExamLimit?: number }): Promise<StatisticsSnapshot>;
}
