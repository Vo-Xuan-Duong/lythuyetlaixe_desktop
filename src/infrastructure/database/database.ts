import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:lythuyetlaixe.db";

let databasePromise: Promise<Database> | undefined;

export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(DATABASE_URL);
  }

  return databasePromise;
}

export const databaseUrl = DATABASE_URL;
