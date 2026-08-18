import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDevDeckUserDataPath } from "../user-data-path";
import { openSqliteConnection, type SqliteConnection } from "./sqlite-driver";
import {
  getAppliedMigrationVersion,
  runMigrations,
  type MigrationRunResult,
} from "./migration-runner";
import { backlogMigrations } from "./migrations";

export function getBacklogDatabasePath(): string {
  const explicitPath = process.env.DEVDECK_BACKLOG_DB_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  return path.join(getDevDeckUserDataPath(), "backlog-intelligence.sqlite");
}

/**
 * Copies the database file (and its WAL/SHM siblings, if present) to a
 * timestamped backup before a destructive migration runs — see
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 11 ("pre-migration
 * backup"). A fresh database (no file yet, or an in-memory path) has
 * nothing to back up.
 */
function backupBeforeMigration(databasePath: string): void {
  if (databasePath === ":memory:" || !existsSync(databasePath)) {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const suffix of ["", "-wal", "-shm"]) {
    const sourcePath = `${databasePath}${suffix}`;
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, `${sourcePath}.${timestamp}.bak`);
    }
  }
}

export interface BacklogDatabaseHandle {
  connection: SqliteConnection;
  databasePath: string;
  migrationResult: MigrationRunResult;
  close(): void;
}

export interface OpenBacklogDatabaseOptions {
  /** Overrides the resolved path, mainly for tests. Pass ":memory:" for an ephemeral database. */
  databasePath?: string;
}

/**
 * Opens (creating if necessary) the Backlog Intelligence database, backs
 * it up if a migration is about to run, applies pending migrations, and
 * returns a ready-to-use handle.
 *
 * Only Electron's main process should call this — the renderer never
 * touches SQLite directly (ADR-0002).
 */
export function openBacklogDatabase(
  options: OpenBacklogDatabaseOptions = {},
): BacklogDatabaseHandle {
  const databasePath = options.databasePath ?? getBacklogDatabasePath();

  // Snapshot existence before opening: better-sqlite3 creates the file
  // the instant it opens a path that doesn't exist yet, so checking after
  // openSqliteConnection would always see a file and back up a database
  // that never actually held prior data.
  const databaseFileExistedBeforeOpen =
    databasePath !== ":memory:" && existsSync(databasePath);

  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const connection = openSqliteConnection({ path: databasePath });

  const currentVersion = getAppliedMigrationVersion(connection);
  const hasPendingMigrations = backlogMigrations.some(
    (migration) => migration.version > currentVersion,
  );
  if (hasPendingMigrations && databaseFileExistedBeforeOpen) {
    backupBeforeMigration(databasePath);
  }

  const migrationResult = runMigrations(connection, backlogMigrations);

  return {
    connection,
    databasePath,
    migrationResult,
    close() {
      connection.close();
    },
  };
}
