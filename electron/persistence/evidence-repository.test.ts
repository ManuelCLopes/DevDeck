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
  getUnavailableRepositoriesForIssue,
  replaceEvidenceForIssue,
} from "./evidence-repository";
import { insertAssessment } from "./assessment-repository";
import { createRulesScan } from "./rules-scan-repository";

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

test("replaceEvidenceForIssue preserves an evidence row still cited by an assessment, even after a re-gather", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [
    buildEvidence({ id: "cited-evidence", sourceId: "first-run" }),
  ]);

  // A rules scan assessed the issue and cited that evidence row —
  // evidence-gather.ts's evidence.id values are fresh randomUUIDs every
  // gather, so nothing else keeps this id alive except the citation.
  const scanId = createRulesScan(db, projectConfig.id, "1");
  insertAssessment(db, {
    classification: "possibly_implemented",
    confidence: 0.8,
    confidenceBand: "medium",
    contradictions: [],
    engineVersion: "1",
    evidenceIds: ["cited-evidence"],
    issueKey: "ENG-1",
    openQuestions: [],
    rationale: "Found a commit that references this issue.",
    repositorySnapshotIds: [],
    scanId,
    suggestedAction: "investigate",
    summary: "Likely already implemented.",
  });

  // A later re-gather finds a brand-new evidence row (a fresh randomUUID)
  // for the same underlying commit — the cited row must survive.
  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [
    buildEvidence({ id: "second-run-evidence", sourceId: "second-run" }),
  ]);

  const stored = getEvidenceForIssue(db, projectConfig.id, "ENG-1");
  const storedIds = stored.map((item) => item.id).sort();
  assert.deepEqual(storedIds, ["cited-evidence", "second-run-evidence"]);

  db.close();
});

test("replaceEvidenceForIssue still fully replaces evidence no assessment cites", () => {
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

test("getUnavailableRepositoriesForIssue returns an empty array when nothing failed or nothing was ever gathered", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  // No gather has run yet.
  assert.deepEqual(getUnavailableRepositoriesForIssue(db, projectConfig.id, "ENG-1"), []);

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence()]);
  // A gather ran and nothing failed.
  assert.deepEqual(getUnavailableRepositoriesForIssue(db, projectConfig.id, "ENG-1"), []);

  db.close();
});

test("getUnavailableRepositoriesForIssue persists and reads back a gather's partial failures", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence()], [
    { message: "not a git repository", repositoryPath: "/does/not/exist" },
  ]);

  const unavailable = getUnavailableRepositoriesForIssue(db, projectConfig.id, "ENG-1");
  assert.deepEqual(unavailable, [
    { message: "not a git repository", repositoryPath: "/does/not/exist" },
  ]);

  db.close();
});

test("getUnavailableRepositoriesForIssue clears a stale failure once a re-gather succeeds fully", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");

  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence()], [
    { message: "not a git repository", repositoryPath: "/does/not/exist" },
  ]);
  replaceEvidenceForIssue(db, projectConfig.id, "ENG-1", [buildEvidence()]);

  assert.deepEqual(getUnavailableRepositoriesForIssue(db, projectConfig.id, "ENG-1"), []);

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
