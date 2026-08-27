import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BACKLOG_FEATURE_FLAGS,
  resolveBacklogFeatureFlags,
} from "./feature-flags";

test("resolveBacklogFeatureFlags defaults every flag to disabled with no environment overrides", () => {
  const flags = resolveBacklogFeatureFlags({});
  assert.deepEqual(flags, DEFAULT_BACKLOG_FEATURE_FLAGS);
  for (const value of Object.values(flags)) {
    assert.equal(value, false);
  }
});

test("resolveBacklogFeatureFlags honours explicit true/false environment overrides", () => {
  const flags = resolveBacklogFeatureFlags({
    DEVDECK_FEATURE_BACKLOG_INTELLIGENCE: "true",
    DEVDECK_FEATURE_JIRA_SYNC: "1",
    DEVDECK_FEATURE_MODEL_ASSESSMENT: "false",
  });

  assert.equal(flags.backlogIntelligenceEnabled, true);
  assert.equal(flags.jiraSyncEnabled, true);
  assert.equal(flags.modelAssessmentEnabled, false);
  assert.equal(flags.rulesAssessmentEnabled, false);
});

test("resolveBacklogFeatureFlags ignores unrecognised values and falls back to the default", () => {
  const flags = resolveBacklogFeatureFlags({
    DEVDECK_FEATURE_BACKLOG_INTELLIGENCE: "maybe",
  });

  assert.equal(flags.backlogIntelligenceEnabled, false);
});

test("resolveBacklogFeatureFlags never mutates the shared default object", () => {
  resolveBacklogFeatureFlags({ DEVDECK_FEATURE_BACKLOG_INTELLIGENCE: "true" });
  assert.equal(DEFAULT_BACKLOG_FEATURE_FLAGS.backlogIntelligenceEnabled, false);
});
