import type { SqliteConnection } from "./sqlite-driver";

export interface Migration {
  /** Monotonically increasing, starting at 1. Enforced by runMigrations. */
  version: number;
  /** Short, human-readable name shown in diagnostics and migration logs. */
  name: string;
  /** Applies the migration. Runs inside a transaction managed by the caller. */
  up: (db: SqliteConnection) => void;
}

export interface MigrationRunResult {
  appliedMigrations: string[];
  fromVersion: number;
  toVersion: number;
}

const MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
`;

function assertOrderedAndUnique(migrations: Migration[]): void {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (let index = 0; index < sorted.length; index += 1) {
    const expectedVersion = index + 1;
    if (sorted[index].version !== expectedVersion) {
      throw new Error(
        `Migrations must be numbered contiguously starting at 1. Expected version ${expectedVersion}, found ${sorted[index].version} ("${sorted[index].name}").`,
      );
    }
  }
}

function getCurrentSchemaVersion(db: SqliteConnection): number {
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version: number | null };
  return row.version ?? 0;
}

/**
 * Applies pending migrations in order inside individual transactions, and
 * records each applied version so a restart never re-applies a migration
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 11: "versioned
 * migrations" and "startup schema-version guard").
 *
 * Safe to call on every startup: with nothing pending it is a no-op.
 */
export function runMigrations(
  db: SqliteConnection,
  migrations: Migration[],
): MigrationRunResult {
  assertOrderedAndUnique(migrations);
  db.exec(MIGRATIONS_TABLE_DDL);

  const fromVersion = getCurrentSchemaVersion(db);
  const pending = migrations
    .filter((migration) => migration.version > fromVersion)
    .sort((a, b) => a.version - b.version);

  const appliedMigrations: string[] = [];
  const insertMigrationRecord = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of pending) {
    const applyMigration = db.transaction(() => {
      migration.up(db);
      insertMigrationRecord.run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
    applyMigration();
    appliedMigrations.push(migration.name);
  }

  return {
    appliedMigrations,
    fromVersion,
    toVersion: getCurrentSchemaVersion(db),
  };
}

export function getAppliedMigrationVersion(db: SqliteConnection): number {
  db.exec(MIGRATIONS_TABLE_DDL);
  return getCurrentSchemaVersion(db);
}
