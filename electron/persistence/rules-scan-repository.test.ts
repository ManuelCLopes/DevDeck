import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "./sqlite-driver";
import { runMigrations } from "./migration-runner";
import { backlogMigrations } from "./migrations";
import { upsertJiraConnection, upsertJiraIssues, upsertJiraProjectConfig } from "./jira-repository";
import {
  cancelRulesScan,
  completeRulesScan,
  completeScanItem,
  createRulesScan,
  failRulesScan,
  failScanItem,
  getRulesScan,
  listRulesScansForProject,
  reconcileOrphanedRulesScans,
  startScanItem,
} from "./rules-scan-repository";

function createTestDatabase() {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });
  const projectConfig = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "project = ENG",
    name: "Engineering",
    projectKey: "ENG",
  });
  return { db, projectConfig };
}

// scan_items.issue_key has a NOT NULL FK to jira_issues — an issue must
// be synced before a scan can track a scan_item for it.
function seedIssue(db: ReturnType<typeof createTestDatabase>["db"], projectId: string, issueKey: string) {
  upsertJiraIssues(db, [
    {
      comments: [],
      links: [],
      record: {
        components: [],
        description: null,
        issueKey,
        issueType: "Task",
        jiraUpdatedAt: "2026-08-01T00:00:00.000Z",
        labels: [],
        outOfScope: false,
        parentIssueKey: null,
        projectId,
        status: "Open",
        summary: `Summary for ${issueKey}`,
        syncedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  ]);
}

test("createRulesScan starts a scan in the running state", () => {
  const { db, projectConfig } = createTestDatabase();
  const scanId = createRulesScan(db, projectConfig.id, "1");

  const scan = getRulesScan(db, scanId);
  assert.equal(scan?.status, "running");
  assert.equal(scan?.jiraProjectId, projectConfig.id);
  assert.equal(scan?.completedAt, null);

  db.close();
});

test("completeRulesScan marks the scan completed with a timestamp", () => {
  const { db, projectConfig } = createTestDatabase();
  const scanId = createRulesScan(db, projectConfig.id, "1");

  completeRulesScan(db, scanId);

  const scan = getRulesScan(db, scanId);
  assert.equal(scan?.status, "completed");
  assert.ok(scan?.completedAt);

  db.close();
});

test("failRulesScan records the error code", () => {
  const { db, projectConfig } = createTestDatabase();
  const scanId = createRulesScan(db, projectConfig.id, "1");

  failRulesScan(db, scanId, "UNEXPECTED_ERROR");

  const scan = getRulesScan(db, scanId);
  assert.equal(scan?.status, "failed");
  assert.equal(scan?.errorCode, "UNEXPECTED_ERROR");

  db.close();
});

test("cancelRulesScan records a cancellation timestamp", () => {
  const { db, projectConfig } = createTestDatabase();
  const scanId = createRulesScan(db, projectConfig.id, "1");

  cancelRulesScan(db, scanId);

  const scan = getRulesScan(db, scanId);
  assert.equal(scan?.status, "cancelled");
  assert.ok(scan?.cancelledAt);

  db.close();
});

test("scan items are isolated per issue — one failure doesn't affect another item's completed count", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  seedIssue(db, projectConfig.id, "ENG-2");
  const scanId = createRulesScan(db, projectConfig.id, "1");

  const okItem = startScanItem(db, scanId, "ENG-1");
  completeScanItem(db, okItem);

  const badItem = startScanItem(db, scanId, "ENG-2");
  failScanItem(db, badItem, "ASSESSMENT_FAILED");

  const scan = getRulesScan(db, scanId);
  assert.equal(scan?.assessedIssueCount, 1);
  assert.equal(scan?.failedIssueCount, 1);

  db.close();
});

test("listRulesScansForProject returns scans newest-first, scoped to the project", () => {
  const { db, projectConfig } = createTestDatabase();
  const otherProject = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: null,
    name: "Ops",
    projectKey: "OPS",
  });

  const first = createRulesScan(db, projectConfig.id, "1");
  completeRulesScan(db, first);
  const second = createRulesScan(db, projectConfig.id, "1");
  completeRulesScan(db, second);
  const otherScan = createRulesScan(db, otherProject.id, "1");
  completeRulesScan(db, otherScan);

  const scans = listRulesScansForProject(db, projectConfig.id);
  assert.deepEqual(
    scans.map((scan) => scan.id),
    [second, first],
  );

  db.close();
});

test("reconcileOrphanedRulesScans marks a scan left running (app quit mid-scan) as cancelled", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  seedIssue(db, projectConfig.id, "ENG-2");

  const scanId = createRulesScan(db, projectConfig.id, "1");
  const completedItem = startScanItem(db, scanId, "ENG-1");
  completeScanItem(db, completedItem);
  // Still "running" when the app quit — never got to complete or fail.
  startScanItem(db, scanId, "ENG-2");

  const reconciledCount = reconcileOrphanedRulesScans(db);
  assert.equal(reconciledCount, 1);

  const scan = getRulesScan(db, scanId);
  assert.equal(scan?.status, "cancelled");
  assert.ok(scan?.cancelledAt);
  // The already-completed item is untouched; only the orphaned one is
  // reconciled.
  assert.equal(scan?.assessedIssueCount, 1);
  assert.equal(scan?.failedIssueCount, 1);

  db.close();
});

test("reconcileOrphanedRulesScans leaves already-terminal scans and other scan types alone", () => {
  const { db, projectConfig } = createTestDatabase();

  const completed = createRulesScan(db, projectConfig.id, "1");
  completeRulesScan(db, completed);
  const cancelled = createRulesScan(db, projectConfig.id, "1");
  cancelRulesScan(db, cancelled);
  const failed = createRulesScan(db, projectConfig.id, "1");
  failRulesScan(db, failed, "SOME_ERROR");

  assert.equal(reconcileOrphanedRulesScans(db), 0);
  assert.equal(getRulesScan(db, completed)?.status, "completed");
  assert.equal(getRulesScan(db, cancelled)?.status, "cancelled");
  assert.equal(getRulesScan(db, failed)?.status, "failed");

  db.close();
});
