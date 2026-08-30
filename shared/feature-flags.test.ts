import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BACKLOG_FEATURE_FLAGS,
  resolveBacklogFeatureFlags,
} from "./feature-flags";

test("resolveBacklogFeatureFlags defaults built phases (1-4) on and unbuilt phases (5+) off with no environment overrides", () => {
  const flags = resolveBacklogFeatureFlags({});
  assert.deepEqual(flags, DEFAULT_BACKLOG_FEATURE_FLAGS);
  assert.equal(flags.backlogIntelligenceEnabled, true);
  assert.equal(flags.jiraSyncEnabled, true);
  assert.equal(flags.repositoryIndexEnabled, true);
  assert.equal(flags.rulesAssessmentEnabled, true);
  assert.equal(flags.modelAssessmentEnabled, false);
  assert.equal(flags.backgroundSyncEnabled, false);
  assert.equal(flags.jiraWriteBackEnabled, false);
  assert.equal(flags.semanticIndexEnabled, false);
});

test("resolveBacklogFeatureFlags honours explicit true/false environment overrides", () => {
  const flags = resolveBacklogFeatureFlags({
    DEVDECK_FEATURE_BACKLOG_INTELLIGENCE: "false",
    DEVDECK_FEATURE_JIRA_SYNC: "0",
    DEVDECK_FEATURE_MODEL_ASSESSMENT: "true",
  });

  assert.equal(flags.backlogIntelligenceEnabled, false);
  assert.equal(flags.jiraSyncEnabled, false);
  assert.equal(flags.modelAssessmentEnabled, true);
  assert.equal(flags.rulesAssessmentEnabled, true);
});

test("resolveBacklogFeatureFlags ignores unrecognised values and falls back to the default", () => {
  const flags = resolveBacklogFeatureFlags({
    DEVDECK_FEATURE_BACKLOG_INTELLIGENCE: "maybe",
  });

  assert.equal(flags.backlogIntelligenceEnabled, true);
});

test("resolveBacklogFeatureFlags never mutates the shared default object", () => {
  resolveBacklogFeatureFlags({ DEVDECK_FEATURE_BACKLOG_INTELLIGENCE: "false" });
  assert.equal(DEFAULT_BACKLOG_FEATURE_FLAGS.backlogIntelligenceEnabled, true);
});
