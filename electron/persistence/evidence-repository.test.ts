import test from "node:test";
import assert from "node:assert/strict";
import type { EvidenceItem } from "../../shared/evidence";
import { openSqliteConnection } from "./sqlite-driver";
import { runMigrations } from "./migration-runner";
import { backlogMigrations } from "./migrations";
import {
  upsertJiraConnection,
  upsertJiraIssues,
  upsertJiraProjectConfig,
} from "./jira-repository";
import {
  getEvidenceForIssue,
  getOrCreateManualScan,
  replaceEvidenceForIssue,
} from "./evidence-repository";

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

/** scan_items.issue_key has a NOT NULL FK to jira_issues — evidence can only be attached to an already-synced issue, matching the real UI flow (issue detail only offers "gather evidence" for a synced issue). */
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

test("getOrCreateManualScan reuses the same scan for a given Jira project", () => {
  const { db, projectConfig } = createTestDatabase();
  const first = getOrCreateManualScan(db, projectConfig.id);
  const second = getOrCreateManualScan(db, projectConfig.id);
  assert.equal(first, second);
  db.close();
});

test("replaceEvidenceForIssue persists evidence retrievable by getEvidenceForIssue", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence()]);

  const stored = getEvidenceForIssue(db, projectConfig.id, "ENG-1");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].sourceId, "abc123");
  assert.equal(stored[0].title, "Fixed the bug");

  db.close();
});

test("replaceEvidenceForIssue fully replaces (not accumulates) on a re-gather", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [
    buildEvidence({ id: "evidence-1", sourceId: "first-run" }),
  ]);
  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [
    buildEvidence({ id: "evidence-2", sourceId: "second-run" }),
  ]);

  const stored = getEvidenceForIssue(db, projectConfig.id, "ENG-1");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].sourceId, "second-run");

  db.close();
});

test("getEvidenceForIssue orders high-strength evidence before low, not alphabetically", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [
    buildEvidence({ id: "e-low", strength: "low", title: "low" }),
    buildEvidence({ id: "e-high", strength: "high", title: "high" }),
    buildEvidence({ id: "e-medium", strength: "medium", title: "medium" }),
  ]);

  const stored = getEvidenceForIssue(db, projectConfig.id, "ENG-1");
  assert.deepEqual(
    stored.map((item) => item.strength),
    ["high", "medium", "low"],
  );

  db.close();
});

test("getEvidenceForIssue returns an empty array for an issue with nothing gathered", () => {
  const { db, projectConfig } = createTestDatabase();
  assert.deepEqual(getEvidenceForIssue(db, projectConfig.id, "ENG-999"), []);
  db.close();
});

test("evidence is scoped per issue — gathering for one issue doesn't touch another's", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  seedIssue(db, projectConfig.id, "ENG-2");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence({ id: "e-1" })]);
  replaceEvidenceForIssue(db, projectConfig.id, "ENG-2", [
    buildEvidence({ id: "e-2", sourceId: "other-issue" }),
  ]);

  assert.equal(getEvidenceForIssue(db, projectConfig.id, "ENG-1").length, 1);
  assert.equal(getEvidenceForIssue(db, projectConfig.id, "ENG-2")[0].sourceId, "other-issue");

  db.close();
});
