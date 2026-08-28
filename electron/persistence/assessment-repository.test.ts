import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "./sqlite-driver";
import { runMigrations } from "./migration-runner";
import { backlogMigrations } from "./migrations";
import { upsertJiraConnection, upsertJiraIssues, upsertJiraProjectConfig } from "./jira-repository";
import { createRulesScan } from "./rules-scan-repository";
import {
  getLatestAssessmentForIssue,
  getProjectAssessmentSummary,
  insertAssessment,
  insertAssessmentFeedback,
  listAssessmentFeedback,
  listAssessmentHistoryForIssue,
  type InsertAssessmentInput,
} from "./assessment-repository";

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

// assessments.issue_key has a NOT NULL FK to jira_issues — an issue
// must be synced before it can be assessed, matching the real flow
// (an assessment is only offered from an already-synced issue).
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

function buildAssessmentInput(overrides: Partial<InsertAssessmentInput> = {}): InsertAssessmentInput {
  return {
    classification: "possibly_implemented",
    confidence: 0.8,
    confidenceBand: "medium",
    contradictions: [],
    engineVersion: "1",
    evidenceIds: ["evidence-1"],
    issueKey: "ENG-1",
    openQuestions: [],
    rationale: "Found a commit that references this issue.",
    repositorySnapshotIds: ["snapshot-1"],
    scanId: "scan-1",
    suggestedAction: "investigate",
    summary: "Likely already implemented.",
    ...overrides,
  };
}

test("insertAssessment persists and round-trips every field, including JSON columns", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  const scanId = createRulesScan(db, projectConfig.id, "1");

  const inserted = insertAssessment(
    db,
    buildAssessmentInput({
      contradictions: ["conflicting evidence"],
      openQuestions: ["needs human review"],
      scanId,
    }),
  );

  const fetched = getLatestAssessmentForIssue(db, "ENG-1");
  assert.deepEqual(fetched, inserted);
  assert.equal(fetched?.classification, "possibly_implemented");
  assert.deepEqual(fetched?.evidenceIds, ["evidence-1"]);
  assert.deepEqual(fetched?.contradictions, ["conflicting evidence"]);
  assert.deepEqual(fetched?.openQuestions, ["needs human review"]);
  assert.equal(fetched?.stale, false);

  db.close();
});

test("getLatestAssessmentForIssue returns the most recent of several assessments", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  const firstScan = createRulesScan(db, projectConfig.id, "1");
  const secondScan = createRulesScan(db, projectConfig.id, "1");

  insertAssessment(
    db,
    buildAssessmentInput({ classification: "insufficient_evidence", scanId: firstScan }),
  );
  const latest = insertAssessment(
    db,
    buildAssessmentInput({ classification: "possibly_implemented", scanId: secondScan }),
  );

  const fetched = getLatestAssessmentForIssue(db, "ENG-1");
  assert.equal(fetched?.id, latest.id);
  assert.equal(fetched?.classification, "possibly_implemented");

  db.close();
});

test("listAssessmentHistoryForIssue returns every assessment newest-first", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  const firstScan = createRulesScan(db, projectConfig.id, "1");
  const secondScan = createRulesScan(db, projectConfig.id, "1");

  const first = insertAssessment(db, buildAssessmentInput({ scanId: firstScan }));
  const second = insertAssessment(db, buildAssessmentInput({ scanId: secondScan }));

  const history = listAssessmentHistoryForIssue(db, "ENG-1");
  assert.deepEqual(
    history.map((assessment) => assessment.id),
    [second.id, first.id],
  );

  db.close();
});

test("getProjectAssessmentSummary counts only each issue's latest assessment", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  seedIssue(db, projectConfig.id, "ENG-2");

  const firstScan = createRulesScan(db, projectConfig.id, "1");
  insertAssessment(
    db,
    buildAssessmentInput({
      classification: "insufficient_evidence",
      issueKey: "ENG-1",
      scanId: firstScan,
    }),
  );
  insertAssessment(
    db,
    buildAssessmentInput({
      classification: "possible_duplicate",
      issueKey: "ENG-2",
      scanId: firstScan,
    }),
  );

  const secondScan = createRulesScan(db, projectConfig.id, "1");
  insertAssessment(
    db,
    buildAssessmentInput({
      classification: "possibly_implemented",
      issueKey: "ENG-1",
      scanId: secondScan,
    }),
  );

  const summary = getProjectAssessmentSummary(db, projectConfig.id);
  assert.equal(summary.countsByClassification.possibly_implemented, 1);
  assert.equal(summary.countsByClassification.possible_duplicate, 1);
  // ENG-1's first (insufficient_evidence) assessment must not still be counted.
  assert.equal(summary.countsByClassification.insufficient_evidence, 0);
  assert.ok(summary.lastScanAt);

  db.close();
});

test("getProjectAssessmentSummary starts every classification at zero for a project with no scans", () => {
  const { db, projectConfig } = createTestDatabase();

  const summary = getProjectAssessmentSummary(db, projectConfig.id);
  assert.equal(summary.lastScanAt, null);
  assert.equal(
    Object.values(summary.countsByClassification).every((count) => count === 0),
    true,
  );

  db.close();
});

test("assessment feedback is inserted and listed oldest-first", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  const scanId = createRulesScan(db, projectConfig.id, "1");
  const assessment = insertAssessment(db, buildAssessmentInput({ scanId }));

  insertAssessmentFeedback(db, { assessmentId: assessment.id, decision: "accepted" });
  insertAssessmentFeedback(db, {
    assessmentId: assessment.id,
    correctedClassification: "possibly_obsolete",
    decision: "corrected",
    note: "Actually looks obsolete.",
  });

  const feedback = listAssessmentFeedback(db, assessment.id);
  assert.equal(feedback.length, 2);
  assert.equal(feedback[0].decision, "accepted");
  assert.equal(feedback[1].decision, "corrected");
  assert.equal(feedback[1].correctedClassification, "possibly_obsolete");
  assert.equal(feedback[1].note, "Actually looks obsolete.");

  db.close();
});

test("deleting an assessment's scan cascades to its feedback", () => {
  const { db, projectConfig } = createTestDatabase();
  seedIssue(db, projectConfig.id, "ENG-1");
  const scanId = createRulesScan(db, projectConfig.id, "1");
  const assessment = insertAssessment(db, buildAssessmentInput({ scanId }));
  insertAssessmentFeedback(db, { assessmentId: assessment.id, decision: "accepted" });

  db.prepare("DELETE FROM scans WHERE id = ?").run(scanId);

  assert.equal(getLatestAssessmentForIssue(db, "ENG-1"), null);
  assert.deepEqual(listAssessmentFeedback(db, assessment.id), []);

  db.close();
});
