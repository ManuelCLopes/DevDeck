import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "../sqlite-driver";
import { runMigrations } from "../migration-runner";
import { backlogMigrations } from "./index";

const EXPECTED_TABLES = [
  "jira_connections",
  "jira_projects",
  "backlog_mappings",
  "jira_issues",
  "jira_comments",
  "jira_issue_links",
  "repository_snapshots",
  "scans",
  "scan_items",
  "evidence",
  "assessments",
  "assessment_feedback",
];

test("schema v1 creates every core table from the integration plan (section 11)", () => {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);

  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  const tableNames = new Set(rows.map((row) => row.name));

  for (const expectedTable of EXPECTED_TABLES) {
    assert.ok(tableNames.has(expectedTable), `missing table: ${expectedTable}`);
  }

  db.close();
});

test("schema v1 enforces foreign keys between issues and their comments", () => {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);

  assert.throws(() => {
    db.prepare(
      "INSERT INTO jira_comments (id, issue_key, body, jira_created_at) VALUES (?, ?, ?, ?)",
    ).run("comment-1", "DOES-NOT-EXIST", "hello", new Date().toISOString());
  });

  db.close();
});

test("schema v1's full-text index stays in sync with jira_issues via triggers", () => {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO jira_connections (id, base_url, account_email, auth_method, created_at, updated_at)
     VALUES ('conn-1', 'https://example.atlassian.net', 'dev@example.com', 'api_token', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO jira_projects (id, connection_id, project_key, name, created_at, updated_at)
     VALUES ('proj-1', 'conn-1', 'ENG', 'Engineering', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO jira_issues (issue_key, project_id, issue_type, status, summary, jira_updated_at, synced_at)
     VALUES ('ENG-1', 'proj-1', 'Task', 'Open', 'Improve widget caching', ?, ?)`,
  ).run(now, now);

  const searchResults = db
    .prepare("SELECT issue_key FROM jira_issues_fts WHERE jira_issues_fts MATCH 'caching'")
    .all() as Array<{ issue_key: string }>;
  assert.deepEqual(searchResults, [{ issue_key: "ENG-1" }]);

  db.prepare("DELETE FROM jira_issues WHERE issue_key = 'ENG-1'").run();
  const afterDelete = db
    .prepare("SELECT issue_key FROM jira_issues_fts WHERE jira_issues_fts MATCH 'caching'")
    .all();
  assert.deepEqual(afterDelete, []);

  db.close();
});
