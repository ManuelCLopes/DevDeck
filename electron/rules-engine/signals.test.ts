import test from "node:test";
import assert from "node:assert/strict";
import type { EvidenceItem } from "../../shared/evidence";
import type { JiraIssueDetail } from "../../shared/jira";
import {
  computeAssessmentSignals,
  computeDuplicateSignals,
  computeImplementationSignals,
  computeInsufficientEvidenceSignal,
  computeObsolescenceSignal,
} from "./signals";

function buildIssue(overrides: Partial<JiraIssueDetail> = {}): JiraIssueDetail {
  return {
    comments: [],
    links: [],
    record: {
      components: [],
      description: null,
      issueKey: "ENG-1",
      issueType: "Task",
      jiraUpdatedAt: "2026-08-01T00:00:00.000Z",
      labels: [],
      outOfScope: false,
      parentIssueKey: null,
      projectId: "project-config-1",
      status: "Open",
      summary: "Do the thing",
      syncedAt: "2026-08-19T00:00:00.000Z",
    },
    ...overrides,
  };
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
    repositorySnapshotId: "snapshot-1",
    sourceId: null,
    sourceUrl: null,
    strength: "high",
    symbol: null,
    title: null,
    ...overrides,
  };
}

test("computeImplementationSignals prefers a high-strength commit/PR match over code matches", () => {
  const commit = buildEvidence({ id: "commit-1", kind: "git_commit", strength: "high" });
  const codeMatch = buildEvidence({ id: "code-1", kind: "code_file", strength: "low" });

  const signals = computeImplementationSignals([commit, codeMatch]);

  assert.equal(signals.length, 1);
  assert.equal(signals[0].classification, "possibly_implemented");
  assert.deepEqual(signals[0].evidenceIds, ["commit-1"]);
  assert.ok(signals[0].score > 0.45);
});

test("computeImplementationSignals falls back to code matches when there is no commit or PR evidence", () => {
  const codeMatches = [
    buildEvidence({ id: "code-1", kind: "code_file", strength: "low" }),
    buildEvidence({ id: "code-2", kind: "code_file", strength: "low" }),
  ];

  const signals = computeImplementationSignals(codeMatches);

  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0].evidenceIds, ["code-1", "code-2"]);
  assert.equal(signals[0].score, 0.45);
});

test("computeImplementationSignals produces nothing when there is no relevant evidence", () => {
  const prEvidence = buildEvidence({ kind: "github_pull_request", strength: "low" });
  assert.deepEqual(computeImplementationSignals([prEvidence]), []);
  assert.deepEqual(computeImplementationSignals([]), []);
});

test("computeObsolescenceSignal fires only when the issue is marked out of scope", () => {
  assert.deepEqual(computeObsolescenceSignal(buildIssue()), []);

  const signals = computeObsolescenceSignal(
    buildIssue({ record: { ...buildIssue().record, outOfScope: true } }),
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].classification, "possibly_obsolete");
  assert.deepEqual(signals[0].evidenceIds, []);
});

test("computeDuplicateSignals fires one signal per duplicate-typed link, ignoring other link types", () => {
  const issue = buildIssue({
    links: [
      { id: "link-1", issueKey: "ENG-1", linkType: "duplicates", relatedIssueKey: "ENG-2" },
      {
        id: "link-2",
        issueKey: "ENG-1",
        linkType: "is duplicated by",
        relatedIssueKey: "ENG-3",
      },
      { id: "link-3", issueKey: "ENG-1", linkType: "blocks", relatedIssueKey: "ENG-4" },
    ],
  });

  const signals = computeDuplicateSignals(issue);

  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.classification === "possible_duplicate"));
  assert.match(signals[0].explanation, /ENG-2/);
  assert.match(signals[1].explanation, /ENG-3/);
});

test("computeInsufficientEvidenceSignal fires only when there is no evidence at all", () => {
  assert.equal(computeInsufficientEvidenceSignal([]).length, 1);
  assert.deepEqual(computeInsufficientEvidenceSignal([buildEvidence()]), []);
});

test("computeAssessmentSignals falls back to insufficient evidence only when nothing else fired", () => {
  const signals = computeAssessmentSignals(buildIssue(), []);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].classification, "insufficient_evidence");
});

test("computeAssessmentSignals combines every rule that fires, including contradictory ones", () => {
  const outOfScopeIssue = buildIssue({ record: { ...buildIssue().record, outOfScope: true } });
  const commit = buildEvidence({ id: "commit-1", kind: "git_commit", strength: "high" });

  const signals = computeAssessmentSignals(outOfScopeIssue, [commit]);

  const classifications = signals.map((signal) => signal.classification).sort();
  assert.deepEqual(classifications, ["possibly_implemented", "possibly_obsolete"]);
});
