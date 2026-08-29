import test from "node:test";
import assert from "node:assert/strict";
import {
  getIssueAssessmentRequestSchema,
  listAssessmentHistoryRequestSchema,
  listRulesScansRequestSchema,
  startRulesScanRequestSchema,
  submitAssessmentFeedbackRequestSchema,
} from "./assessment-schemas";

test("startRulesScanRequestSchema requires a non-empty jiraProjectId", () => {
  assert.doesNotThrow(() => startRulesScanRequestSchema.parse({ jiraProjectId: "project-1" }));
  assert.throws(() => startRulesScanRequestSchema.parse({ jiraProjectId: "" }));
});

test("getIssueAssessmentRequestSchema requires a non-empty issueKey", () => {
  assert.doesNotThrow(() => getIssueAssessmentRequestSchema.parse({ issueKey: "ENG-1" }));
  assert.throws(() => getIssueAssessmentRequestSchema.parse({ issueKey: "" }));
});

test("listAssessmentHistoryRequestSchema accepts an optional bounded limit", () => {
  assert.doesNotThrow(() => listAssessmentHistoryRequestSchema.parse({ issueKey: "ENG-1" }));
  assert.doesNotThrow(() =>
    listAssessmentHistoryRequestSchema.parse({ issueKey: "ENG-1", limit: 10 }),
  );
  assert.throws(() =>
    listAssessmentHistoryRequestSchema.parse({ issueKey: "ENG-1", limit: 0 }),
  );
  assert.throws(() =>
    listAssessmentHistoryRequestSchema.parse({ issueKey: "ENG-1", limit: 51 }),
  );
});

test("listRulesScansRequestSchema requires a non-empty jiraProjectId", () => {
  assert.doesNotThrow(() => listRulesScansRequestSchema.parse({ jiraProjectId: "project-1" }));
  assert.throws(() => listRulesScansRequestSchema.parse({ jiraProjectId: "" }));
});

test("submitAssessmentFeedbackRequestSchema accepts every decision and rejects an unknown one", () => {
  for (const decision of ["accepted", "corrected", "rejected"]) {
    assert.doesNotThrow(() =>
      submitAssessmentFeedbackRequestSchema.parse({
        assessmentId: "assessment-1",
        decision,
      }),
    );
  }
  assert.throws(() =>
    submitAssessmentFeedbackRequestSchema.parse({
      assessmentId: "assessment-1",
      decision: "ignored",
    }),
  );
});

test("submitAssessmentFeedbackRequestSchema accepts a corrected classification and a note", () => {
  assert.doesNotThrow(() =>
    submitAssessmentFeedbackRequestSchema.parse({
      assessmentId: "assessment-1",
      correctedClassification: "possibly_obsolete",
      decision: "corrected",
      note: "Confirmed removed in the last release.",
    }),
  );
});
