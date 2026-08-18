import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "./sqlite-driver";
import { getAppliedMigrationVersion, runMigrations } from "./migration-runner";

function createInMemoryConnection() {
  return openSqliteConnection({ path: ":memory:" });
}

test("runMigrations applies migrations in order and records the resulting version", () => {
  const db = createInMemoryConnection();
  const order: string[] = [];

  const result = runMigrations(db, [
    {
      version: 1,
      name: "create_widgets",
      up(connection) {
        order.push("create_widgets");
        connection.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
      },
    },
    {
      version: 2,
      name: "add_widget_name",
      up(connection) {
        order.push("add_widget_name");
        connection.exec("ALTER TABLE widgets ADD COLUMN name TEXT");
      },
    },
  ]);

  assert.deepEqual(order, ["create_widgets", "add_widget_name"]);
  assert.equal(result.fromVersion, 0);
  assert.equal(result.toVersion, 2);
  assert.deepEqual(result.appliedMigrations, ["create_widgets", "add_widget_name"]);
  assert.equal(getAppliedMigrationVersion(db), 2);

  db.close();
});

test("runMigrations is idempotent: re-running with the same migrations applies nothing", () => {
  const db = createInMemoryConnection();
  const migrations = [
    {
      version: 1,
      name: "create_widgets",
      up(connection: import("./sqlite-driver").SqliteConnection) {
        connection.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
      },
    },
  ];

  runMigrations(db, migrations);
  const secondRun = runMigrations(db, migrations);

  assert.deepEqual(secondRun.appliedMigrations, []);
  assert.equal(secondRun.fromVersion, 1);
  assert.equal(secondRun.toVersion, 1);

  db.close();
});

test("runMigrations only applies migrations newer than the current version", () => {
  const db = createInMemoryConnection();
  const migrationV1 = {
    version: 1,
    name: "create_widgets",
    up(connection: import("./sqlite-driver").SqliteConnection) {
      connection.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
    },
  };
  const migrationV2 = {
    version: 2,
    name: "create_gadgets",
    up(connection: import("./sqlite-driver").SqliteConnection) {
      connection.exec("CREATE TABLE gadgets (id INTEGER PRIMARY KEY)");
    },
  };

  runMigrations(db, [migrationV1]);
  const secondRun = runMigrations(db, [migrationV1, migrationV2]);

  assert.deepEqual(secondRun.appliedMigrations, ["create_gadgets"]);
  assert.equal(secondRun.fromVersion, 1);
  assert.equal(secondRun.toVersion, 2);

  db.close();
});

test("runMigrations rejects a non-contiguous version sequence", () => {
  const db = createInMemoryConnection();

  assert.throws(() =>
    runMigrations(db, [
      {
        version: 1,
        name: "create_widgets",
        up(connection) {
          connection.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
        },
      },
      {
        version: 3,
        name: "skips_version_two",
        up() {
          // Unreachable: validation must fail before this runs.
        },
      },
    ]),
  );

  db.close();
});

test("runMigrations rolls back a failing migration inside its own transaction", () => {
  const db = createInMemoryConnection();

  assert.throws(() =>
    runMigrations(db, [
      {
        version: 1,
        name: "half_broken",
        up(connection) {
          connection.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
          connection.exec("this is not valid sql");
        },
      },
    ]),
  );

  // The table creation must have rolled back with the rest of the transaction.
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widgets'")
    .all();
  assert.equal(tables.length, 0);
  assert.equal(getAppliedMigrationVersion(db), 0);

  db.close();
});
