import type {
  LearningCatalogQuery,
  LearningCatalogResult,
  LearningCategorySummary,
} from "../entities/learningCatalog";

export interface LearningCatalogRepository {
  list(query?: LearningCatalogQuery): Promise<LearningCatalogResult>;
  listCategories(): Promise<LearningCategorySummary[]>;
}
