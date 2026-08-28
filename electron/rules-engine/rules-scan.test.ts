import test from "node:test";
import assert from "node:assert/strict";
import type { EvidenceItem } from "../../shared/evidence";
import { openSqliteConnection } from "../persistence/sqlite-driver";
import { runMigrations } from "../persistence/migration-runner";
import { backlogMigrations } from "../persistence/migrations";
import {
  markJiraIssuesOutOfScope,
  upsertJiraConnection,
  upsertJiraIssues,
  upsertJiraProjectConfig,
} from "../persistence/jira-repository";
import { replaceEvidenceForIssue } from "../persistence/evidence-repository";
import { getLatestAssessmentForIssue, getProjectAssessmentSummary } from "../persistence/assessment-repository";
import { getRulesScan, listRulesScansForProject } from "../persistence/rules-scan-repository";
import { runRulesScan } from "./rules-scan";

function setUp() {
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

// upsertJiraIssues always inserts with out_of_scope = 0 (see
// jira-repository.ts) — outOfScope can only be flipped afterwards via
// markJiraIssuesOutOfScope, the same way a real full sync does it.
function seedIssue(db: ReturnType<typeof setUp>["db"], projectId: string, issueKey: string) {
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

function buildEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    collectedAt: "2026-08-19T00:00:00.000Z",
    collectorVersion: "1",
    excerpt: null,
    filePath: null,
    id: "evidence-1",
    kind: "git_commit",
    metadata: {},
    query: "ENG-1",
    repositorySnapshotId: null,
    sourceId: "abc123",
    sourceUrl: null,
    strength: "high",
    symbol: null,
    title: "Fixed the bug",
    ...overrides,
  };
}

test("runRulesScan assesses every synced issue, one assessment per issue, and completes the scan", async () => {
  const { db, projectConfig } = setUp();
  seedIssue(db, projectConfig.id, "ENG-1");
  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence({ id: "e-1" })]);

  seedIssue(db, projectConfig.id, "ENG-2");
  seedIssue(db, projectConfig.id, "ENG-3");
  // Simulate a full sync that dropped ENG-2 from its JQL results —
  // the same way runFullJiraSync marks issues out of scope.
  markJiraIssuesOutOfScope(db, projectConfig.id, ["ENG-1", "ENG-3"]);

  const result = await runRulesScan({ db, jiraProjectId: projectConfig.id });

  assert.equal(result.assessedIssueCount, 3);
  assert.deepEqual(result.failedIssues, []);
  assert.equal(result.cancelled, false);

  assert.equal(getLatestAssessmentForIssue(db, "ENG-1")?.classification, "possibly_implemented");
  assert.equal(getLatestAssessmentForIssue(db, "ENG-2")?.classification, "possibly_obsolete");
  assert.equal(getLatestAssessmentForIssue(db, "ENG-3")?.classification, "insufficient_evidence");

  const scans = listRulesScansForProject(db, projectConfig.id);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].status, "completed");
  assert.equal(scans[0].assessedIssueCount, 3);
  assert.equal(scans[0].failedIssueCount, 0);

  const summary = getProjectAssessmentSummary(db, projectConfig.id);
  assert.equal(summary.countsByClassification.possibly_implemented, 1);
  assert.equal(summary.countsByClassification.possibly_obsolete, 1);
  assert.equal(summary.countsByClassification.insufficient_evidence, 1);

  db.close();
});

test("runRulesScan reports monotonically increasing progress ending at 1", async () => {
  const { db, projectConfig } = setUp();
  seedIssue(db, projectConfig.id, "ENG-1");
  seedIssue(db, projectConfig.id, "ENG-2");
  const progressUpdates: number[] = [];

  await runRulesScan({
    db,
    jiraProjectId: projectConfig.id,
    onProgress: (progress) => progressUpdates.push(progress),
  });

  assert.deepEqual(progressUpdates, [0.5, 1]);

  db.close();
});

test("runRulesScan stops and marks the scan cancelled when the signal is already aborted", async () => {
  const { db, projectConfig } = setUp();
  seedIssue(db, projectConfig.id, "ENG-1");
  const controller = new AbortController();
  controller.abort();

  const result = await runRulesScan({
    db,
    jiraProjectId: projectConfig.id,
    signal: controller.signal,
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.assessedIssueCount, 0);
  assert.equal(getRulesScan(db, result.scanId)?.status, "cancelled");
  assert.equal(getLatestAssessmentForIssue(db, "ENG-1"), null);

  db.close();
});

test("runRulesScan completes immediately for a project with no synced issues", async () => {
  const { db, projectConfig } = setUp();

  const result = await runRulesScan({ db, jiraProjectId: projectConfig.id });

  assert.equal(result.assessedIssueCount, 0);
  assert.deepEqual(result.failedIssues, []);
  assert.equal(getRulesScan(db, result.scanId)?.status, "completed");

  db.close();
});

test("runRulesScan creates a new scan (and new assessments) on every run, preserving history", async () => {
  const { db, projectConfig } = setUp();
  seedIssue(db, projectConfig.id, "ENG-1");

  const first = await runRulesScan({ db, jiraProjectId: projectConfig.id });
  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence({ id: "e-1" })]);
  const second = await runRulesScan({ db, jiraProjectId: projectConfig.id });

  assert.notEqual(first.scanId, second.scanId);
  assert.equal(listRulesScansForProject(db, projectConfig.id).length, 2);
  // The latest assessment reflects the second run's evidence.
  assert.equal(getLatestAssessmentForIssue(db, "ENG-1")?.classification, "possibly_implemented");
  assert.equal(getLatestAssessmentForIssue(db, "ENG-1")?.scanId, second.scanId);

  db.close();
});
