import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getBacklogDatabasePath, openBacklogDatabase } from "./backlog-db";

test("getBacklogDatabasePath honours DEVDECK_BACKLOG_DB_PATH", () => {
  const previous = process.env.DEVDECK_BACKLOG_DB_PATH;
  process.env.DEVDECK_BACKLOG_DB_PATH = "/tmp/example.sqlite";
  try {
    assert.equal(getBacklogDatabasePath(), "/tmp/example.sqlite");
  } finally {
    if (previous === undefined) {
      delete process.env.DEVDECK_BACKLOG_DB_PATH;
    } else {
      process.env.DEVDECK_BACKLOG_DB_PATH = previous;
    }
  }
});

test("openBacklogDatabase creates a fresh database and applies schema v1", () => {
  const directory = mkdtempSync(join(tmpdir(), "devdeck-backlog-db-"));
  const databasePath = join(directory, "backlog-intelligence.sqlite");

  try {
    const handle = openBacklogDatabase({ databasePath });

    assert.ok(existsSync(databasePath));
    assert.equal(handle.migrationResult.toVersion, 1);
    assert.deepEqual(handle.migrationResult.appliedMigrations, ["init_backlog_schema"]);

    const scanTable = handle.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scans'")
      .get();
    assert.ok(scanTable);

    handle.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("openBacklogDatabase is idempotent across restarts and skips a redundant backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "devdeck-backlog-db-"));
  const databasePath = join(directory, "backlog-intelligence.sqlite");

  try {
    openBacklogDatabase({ databasePath }).close();
    const secondHandle = openBacklogDatabase({ databasePath });

    assert.equal(secondHandle.migrationResult.fromVersion, 1);
    assert.deepEqual(secondHandle.migrationResult.appliedMigrations, []);

    const backupFiles = readdirSync(directory).filter((name) => name.endsWith(".bak"));
    assert.deepEqual(backupFiles, []);

    secondHandle.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("openBacklogDatabase supports an in-memory database for tests", () => {
  const handle = openBacklogDatabase({ databasePath: ":memory:" });
  assert.equal(handle.databasePath, ":memory:");
  assert.equal(handle.migrationResult.toVersion, 1);
  handle.close();
});
