import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, exists } from "@tauri-apps/plugin-fs";
import { isPermissionGranted } from "@tauri-apps/plugin-notification";
import { getDefaultExamLicense } from "../preferences/AppPreferences";
import { getDatabase } from "../database/database";

export type DiagnosticLevel = "pass" | "warn" | "fail" | "info";

export interface RuntimeDiagnosticItem {
  id: string;
  label: string;
  level: DiagnosticLevel;
  summary: string;
  detail?: string;
}

interface CountRow {
  count: number;
}

interface MetadataRow {
  key: string;
  value: string;
}

const EXPECTED_QUESTION_COUNT = 600;
const EXPECTED_CRITICAL_COUNT = 60;
const EXPECTED_CATEGORY_COUNT = 6;
const MANIFEST_URL = import.meta.env.VITE_DATASET_MANIFEST_URL?.trim() ?? "";

function looksLikeSha256(value?: string | null): boolean {
  return /^[a-f0-9]{64}$/i.test((value ?? "").trim().replace(/^sha256:/i, ""));
}

async function databaseDiagnostics(): Promise<RuntimeDiagnosticItem[]> {
  try {
    const db = await getDatabase();
    const [
      questionRows,
      criticalRows,
      categoryRows,
      imageRows,
      invalidAnswerRows,
      missingLicenseRows,
      metadataRows,
    ] = await Promise.all([
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM questions"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM questions WHERE is_critical = 1"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM categories"),
      db.select<CountRow[]>("SELECT COUNT(*) AS count FROM questions WHERE image_path IS NOT NULL AND TRIM(image_path) <> ''"),
      db.select<CountRow[]>(
        `SELECT COUNT(*) AS count
         FROM (
           SELECT q.id
           FROM questions q
           LEFT JOIN answers a ON a.question_id = q.id
           GROUP BY q.id
           HAVING SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) <> 1
         ) invalid_questions`,
      ),
      db.select<CountRow[]>(
        `SELECT COUNT(*) AS count
         FROM questions q
         WHERE NOT EXISTS (
           SELECT 1 FROM question_license_types qlt WHERE qlt.question_id = q.id
         )`,
      ),
      db.select<MetadataRow[]>(
        `SELECT key, value
         FROM dataset_metadata
         WHERE key IN (
           'dataset', 'version', 'validFrom', 'sourceSha256',
           'contentSha256', 'assetSha256', 'importedAt'
         )`,
      ),
    ]);

    const questionCount = questionRows[0]?.count ?? 0;
    const criticalCount = criticalRows[0]?.count ?? 0;
    const categoryCount = categoryRows[0]?.count ?? 0;
    const imageCount = imageRows[0]?.count ?? 0;
    const invalidAnswerCount = invalidAnswerRows[0]?.count ?? 0;
    const missingLicenseCount = missingLicenseRows[0]?.count ?? 0;
    const metadata = new Map(metadataRows.map((row) => [row.key, row.value]));
    const version = metadata.get("version") ?? "";
    const sourceSha256 = metadata.get("sourceSha256") ?? "";
    const contentSha256 = metadata.get("contentSha256") ?? "";
    const assetSha256 = metadata.get("assetSha256") ?? "";

    const items: RuntimeDiagnosticItem[] = [
      {
        id: "sqlite",
        label: "SQLite",
        level: "pass",
        summary: "Database có thể truy cập.",
        detail: metadata.get("dataset") ? `Dataset: ${metadata.get("dataset")}` : undefined,
      },
      {
        id: "questions",
        label: "Bộ câu hỏi local",
        level: questionCount === EXPECTED_QUESTION_COUNT ? "pass" : "fail",
        summary: `${questionCount}/${EXPECTED_QUESTION_COUNT} câu.`,
      },
      {
        id: "critical",
        label: "Câu điểm liệt",
        level: criticalCount === EXPECTED_CRITICAL_COUNT ? "pass" : "fail",
        summary: `${criticalCount}/${EXPECTED_CRITICAL_COUNT} câu.`,
      },
      {
        id: "categories",
        label: "Nhóm kiến thức",
        level: categoryCount === EXPECTED_CATEGORY_COUNT ? "pass" : "fail",
        summary: `${categoryCount}/${EXPECTED_CATEGORY_COUNT} nhóm.`,
      },
      {
        id: "correct-answer-shape",
        label: "Đáp án đúng",
        level: invalidAnswerCount === 0 && questionCount > 0 ? "pass" : "fail",
        summary:
          invalidAnswerCount === 0 && questionCount > 0
            ? "Mỗi câu local có đúng 1 đáp án đúng."
            : `${invalidAnswerCount} câu không có đúng chính xác 1 đáp án đúng.`,
      },
      {
        id: "license-mapping",
        label: "Ánh xạ hạng GPLX",
        level: missingLicenseCount === 0 && questionCount > 0 ? "pass" : "fail",
        summary:
          missingLicenseCount === 0 && questionCount > 0
            ? "Mọi câu local đều có ít nhất một hạng GPLX."
            : `${missingLicenseCount} câu chưa có hạng GPLX.`,
      },
      {
        id: "metadata",
        label: "Dataset metadata",
        level: version ? "pass" : "fail",
        summary: version ? `Version ${version}.` : "Thiếu version local.",
        detail: metadata.get("importedAt") ? `Imported: ${metadata.get("importedAt")}` : undefined,
      },
      {
        id: "content-checksum",
        label: "questions.json checksum",
        level: looksLikeSha256(contentSha256) ? "pass" : "warn",
        summary: looksLikeSha256(contentSha256)
          ? "Có contentSha256 hợp lệ cho package đã cài."
          : "Thiếu contentSha256 hợp lệ; remote immutable comparison chưa thể xác minh đầy đủ.",
      },
      {
        id: "source-checksum",
        label: "PDF provenance checksum",
        level: looksLikeSha256(sourceSha256) ? "pass" : "warn",
        summary: looksLikeSha256(sourceSha256)
          ? "Có sourceSha256 của tài liệu PDF nguồn."
          : "Chưa có provenance SHA-256 của PDF nguồn trong metadata local.",
      },
    ];

    if (imageCount > 0) {
      if (!looksLikeSha256(assetSha256)) {
        items.push({
          id: "assets",
          label: "Asset cache",
          level: "fail",
          summary: `${imageCount} câu tham chiếu ảnh nhưng thiếu assetSha256 hợp lệ.`,
        });
      } else if (version) {
        const assetRoot = `dataset-assets/${version}`;
        const installed = await exists(assetRoot, { baseDir: BaseDirectory.AppData });
        items.push({
          id: "assets",
          label: "Asset cache",
          level: installed ? "pass" : "fail",
          summary: installed
            ? `${imageCount} câu có ảnh; asset directory của dataset ${version} tồn tại.`
            : `Metadata có asset checksum nhưng thiếu ${assetRoot}.`,
        });
      }
    } else {
      items.push({
        id: "assets",
        label: "Asset cache",
        level: "info",
        summary: "Không có câu local nào tham chiếu ảnh.",
      });
    }

    return items;
  } catch (error) {
    return [
      {
        id: "sqlite",
        label: "SQLite",
        level: "fail",
        summary: "Không thể đọc database local.",
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

async function preferenceDiagnostic(): Promise<RuntimeDiagnosticItem> {
  try {
    const license = await getDefaultExamLicense();
    return {
      id: "store",
      label: "Device preferences",
      level: "pass",
      summary: `Đọc preference thành công. Hạng mặc định: ${license}.`,
    };
  } catch (error) {
    return {
      id: "store",
      label: "Device preferences",
      level: "fail",
      summary: "Không thể đọc preference store.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function notificationDiagnostic(): Promise<RuntimeDiagnosticItem> {
  try {
    const granted = await isPermissionGranted();
    return {
      id: "notification",
      label: "Notification",
      level: granted ? "pass" : "warn",
      summary: granted
        ? "Quyền notification đã được cấp."
        : "Quyền notification chưa được cấp; dùng nút gửi thử để request permission.",
    };
  } catch (error) {
    return {
      id: "notification",
      label: "Notification",
      level: "warn",
      summary: "Không đọc được trạng thái notification trên runtime hiện tại.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runRuntimeDiagnostics(): Promise<RuntimeDiagnosticItem[]> {
  if (!isTauri()) {
    return [
      {
        id: "runtime",
        label: "Runtime",
        level: "info",
        summary: "Browser preview: native diagnostics chỉ chạy trong Tauri.",
      },
      {
        id: "remote-endpoint",
        label: "Remote dataset endpoint",
        level: MANIFEST_URL ? "pass" : "warn",
        summary: MANIFEST_URL ? "VITE_DATASET_MANIFEST_URL đã được cấu hình." : "Chưa cấu hình manifest URL.",
        detail: MANIFEST_URL || undefined,
      },
    ];
  }

  const [databaseItems, preferenceItem, notificationItem] = await Promise.all([
    databaseDiagnostics(),
    preferenceDiagnostic(),
    notificationDiagnostic(),
  ]);

  return [
    {
      id: "runtime",
      label: "Runtime",
      level: "pass",
      summary: "Tauri native runtime đang hoạt động.",
    },
    {
      id: "remote-endpoint",
      label: "Remote dataset endpoint",
      level: MANIFEST_URL ? "pass" : "warn",
      summary: MANIFEST_URL ? "VITE_DATASET_MANIFEST_URL đã được cấu hình." : "Chưa cấu hình manifest URL.",
      detail: MANIFEST_URL || undefined,
    },
    ...databaseItems,
    preferenceItem,
    notificationItem,
  ];
}
