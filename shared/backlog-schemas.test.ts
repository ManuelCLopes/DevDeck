import test from "node:test";
import assert from "node:assert/strict";
import { toConfidenceBand } from "./backlog";
import {
  backlogClassificationSchema,
  backlogSummarySchema,
  repositoryMappingRuleSchema,
} from "./backlog-schemas";

test("backlogClassificationSchema accepts every documented classification", () => {
  for (const classification of [
    "valid",
    "possibly_implemented",
    "partially_implemented",
    "possibly_obsolete",
    "possible_duplicate",
    "needs_rewrite",
    "insufficient_evidence",
  ]) {
    assert.equal(backlogClassificationSchema.parse(classification), classification);
  }
});

test("backlogClassificationSchema rejects an unknown classification", () => {
  assert.throws(() => backlogClassificationSchema.parse("obsolete"));
});

test("repositoryMappingRuleSchema accepts every match type and rejects a bad shape", () => {
  const base = {
    enabled: true,
    id: "rule-1",
    jiraProjectKey: "ENG",
    localProjectIds: ["project-1"],
    priority: 1,
  };

  assert.doesNotThrow(() =>
    repositoryMappingRuleSchema.parse({ ...base, match: { type: "project_default" } }),
  );
  assert.doesNotThrow(() =>
    repositoryMappingRuleSchema.parse({
      ...base,
      match: { type: "component", value: "billing-service" },
    }),
  );
  assert.throws(() =>
    // A "component" match requires a value.
    repositoryMappingRuleSchema.parse({ ...base, match: { type: "component" } }),
  );
});

test("backlogSummarySchema rejects negative counts", () => {
  assert.throws(() =>
    backlogSummarySchema.parse({
      connectedJiraProjectCount: -1,
      lastScanAt: null,
      mappedRepositoryCount: 0,
      pendingReviewIssueCount: 0,
      syncedIssueCount: 0,
    }),
  );
});

test("toConfidenceBand matches the display bands from the integration plan", () => {
  assert.equal(toConfidenceBand(0.95), "high");
  assert.equal(toConfidenceBand(0.85), "high");
  assert.equal(toConfidenceBand(0.84), "medium");
  assert.equal(toConfidenceBand(0.65), "medium");
  assert.equal(toConfidenceBand(0.64), "low");
  assert.equal(toConfidenceBand(0), "low");
});
