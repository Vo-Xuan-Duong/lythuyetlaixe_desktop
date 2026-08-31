import type { TrafficSignGroupCode, TrafficSignRecord } from "../../domain/entities/trafficSign";
import { resolveTrafficSignAssetUrl } from "../assets/TrafficSignAssetStore";
import { getLocalTrafficSignsState } from "../database/TrafficSignsImporter";
import { getDatabase } from "../database/database";

interface TrafficSignRow {
  code: string;
  name: string;
  group_code: TrafficSignGroupCode;
  meaning: string;
  recognition: string | null;
  scope: string | null;
  exceptions_json: string;
  notes: string | null;
  image_path: string | null;
  keywords_json: string;
  source_version: string;
}

export interface TrafficSignCatalogItem extends TrafficSignRecord {
  imageUrl?: string;
}

export interface TrafficSignCatalogQuery {
  groupCode?: TrafficSignGroupCode;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TrafficSignCatalogResult {
  items: TrafficSignCatalogItem[];
  total: number;
}

interface CountRow {
  count: number;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export class SqliteTrafficSignsRepository {
  async list(query: TrafficSignCatalogQuery = {}): Promise<TrafficSignCatalogResult> {
    const db = await getDatabase();
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (query.groupCode) {
      params.push(query.groupCode);
      where.push(`group_code = $${params.length}`);
    }

    const search = query.search?.trim().toLowerCase();
    if (search) {
      params.push(`%${search}%`);
      const index = params.length;
      where.push(`(LOWER(code) LIKE $${index} OR LOWER(name) LIKE $${index} OR LOWER(meaning) LIKE $${index} OR LOWER(keywords_json) LIKE $${index})`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const countRows = await db.select<CountRow[]>(`SELECT COUNT(*) AS count FROM traffic_signs ${clause}`, params);
    const total = countRows[0]?.count ?? 0;

    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);
    const rowParams = [...params, limit, offset];
    const rows = await db.select<TrafficSignRow[]>(
      `SELECT code, name, group_code, meaning, recognition, scope, exceptions_json,
              notes, image_path, keywords_json, source_version
       FROM traffic_signs
       ${clause}
       ORDER BY group_code, code
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );

    const local = await getLocalTrafficSignsState();
    const version = local.version;
    const items = await Promise.all(rows.map(async (row): Promise<TrafficSignCatalogItem> => ({
      code: row.code,
      name: row.name,
      groupCode: row.group_code,
      meaning: row.meaning,
      recognition: row.recognition ?? undefined,
      scope: row.scope ?? undefined,
      exceptions: parseStringArray(row.exceptions_json),
      notes: row.notes ?? undefined,
      image: row.image_path ?? undefined,
      imageUrl: version && row.image_path
        ? await resolveTrafficSignAssetUrl(version, row.image_path)
        : undefined,
      keywords: parseStringArray(row.keywords_json),
      sourceVersion: row.source_version,
    })));

    return { items, total };
  }
}
