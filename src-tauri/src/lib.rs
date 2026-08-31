use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:lythuyetlaixe.db";

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial_learning_schema",
        sql: r#"
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS dataset_metadata (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY NOT NULL,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY NOT NULL,
                category_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                image_path TEXT,
                is_critical INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0, 1)),
                source_version TEXT NOT NULL,
                explanation TEXT,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_id INTEGER NOT NULL,
                answer_key TEXT NOT NULL,
                content TEXT NOT NULL,
                is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
                UNIQUE (question_id, answer_key),
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS question_license_types (
                question_id INTEGER NOT NULL,
                license_type TEXT NOT NULL,
                PRIMARY KEY (question_id, license_type),
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_progress (
                question_id INTEGER PRIMARY KEY NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                correct_count INTEGER NOT NULL DEFAULT 0,
                wrong_count INTEGER NOT NULL DEFAULT 0,
                mastery INTEGER NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 4),
                last_answered_at TEXT,
                next_review_at TEXT,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bookmarks (
                question_id INTEGER PRIMARY KEY NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS exam_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_type TEXT NOT NULL,
                question_count INTEGER NOT NULL,
                score INTEGER,
                passed INTEGER CHECK (passed IN (0, 1)),
                critical_failed INTEGER NOT NULL DEFAULT 0 CHECK (critical_failed IN (0, 1)),
                started_at TEXT NOT NULL,
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS exam_answers (
                exam_session_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                selected_answer_key TEXT,
                is_correct INTEGER CHECK (is_correct IN (0, 1)),
                PRIMARY KEY (exam_session_id, question_id),
                FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
            CREATE INDEX IF NOT EXISTS idx_questions_critical ON questions(is_critical);
            CREATE INDEX IF NOT EXISTS idx_progress_mastery ON user_progress(mastery);
            CREATE INDEX IF NOT EXISTS idx_progress_next_review ON user_progress(next_review_at);
        "#,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
