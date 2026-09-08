// Server-only module: opens the local SQLite handle. Never import from a Client Component.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.TRACKER_DB_PATH ?? path.join(DATA_DIR, 'tracker.db');
const SCHEMA_PATH = path.join(process.cwd(), 'lib', 'db', 'schema.sql');

type GlobalWithDb = typeof globalThis & {
  __elevenlabsTrackerDb?: Database.Database;
  __elevenlabsTrackerSeeded?: boolean;
};

const globalRef = globalThis as GlobalWithDb;

/**
 * Additive column migrations. `CREATE TABLE IF NOT EXISTS` leaves an existing
 * table untouched, so columns added after a database was first created have to
 * be applied explicitly. Each step is idempotent.
 */
function migrate(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(workspaces)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'source')) {
    db.exec("ALTER TABLE workspaces ADD COLUMN source TEXT NOT NULL DEFAULT 'synthetic'");
  }
}

function createConnection(): Database.Database {
  if (DB_PATH !== ':memory:') {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(db);
  return db;
}

/**
 * Returns the process-wide SQLite handle, creating the file and applying the
 * schema on first call. Cached on globalThis so Next.js dev-server module
 * reloads reuse one connection instead of leaking handles.
 */
export function getDb(): Database.Database {
  if (!globalRef.__elevenlabsTrackerDb) {
    globalRef.__elevenlabsTrackerDb = createConnection();
  }
  return globalRef.__elevenlabsTrackerDb;
}

/** True once the auto-seed has run in this process. */
export function isSeedMarked(): boolean {
  return globalRef.__elevenlabsTrackerSeeded === true;
}

export function markSeeded(): void {
  globalRef.__elevenlabsTrackerSeeded = true;
}

/** Drops all rows. Used by the simulator's "reset dataset" action. */
export function truncateAll(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM interventions;
    DELETE FROM telemetry_events;
    DELETE FROM agents;
    DELETE FROM workspaces;
  `);
  globalRef.__elevenlabsTrackerSeeded = false;
}

export { DB_PATH };
