import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:lythuyetlaixe.db";

let databasePromise: Promise<Database> | undefined;
let writeQueue: Promise<void> = Promise.resolve();

export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(DATABASE_URL);
  }

  return databasePromise;
}

/**
 * Serializes all application-level SQLite mutations that share the single
 * Tauri SQL database handle. This prevents two async feature flows from
 * interleaving BEGIN/COMMIT boundaries or accidentally writing inside another
 * feature's transaction (for example the two independent dataset bootstraps).
 */
export async function withDatabaseWriteLock<T>(
  work: (db: Database) => Promise<T>,
): Promise<T> {
  let release!: () => void;
  const previous = writeQueue;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    const db = await getDatabase();
    return await work(db);
  } finally {
    release();
  }
}

export const databaseUrl = DATABASE_URL;
