import test from "node:test";
import assert from "node:assert/strict";
import {
  getCiStatusMeta,
  getProjectAttentionMeta,
  getProjectAttentionSummary,
} from "./project-health";

test("getCiStatusMeta exposes failing CI as critical", () => {
  assert.deepEqual(getCiStatusMeta("failing"), {
    className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    label: "CI failing",
  });
});

test("getProjectAttentionSummary prioritizes failing CI", () => {
  assert.equal(
    getProjectAttentionSummary({
      awaitingReviewCount: 2,
      ciStatus: "failing",
      staleBranchCount: 1,
      unpushedCommitCount: 4,
    }),
    "CI failing",
  );
});

test("getProjectAttentionSummary falls back to branch sync and stale work", () => {
  assert.equal(
    getProjectAttentionSummary({
      awaitingReviewCount: 0,
      ciStatus: "passing",
      staleBranchCount: 0,
      unpushedCommitCount: 3,
    }),
    "3 unpushed",
  );
});

test("getProjectAttentionMeta exposes badge styling for waiting work", () => {
  assert.deepEqual(
    getProjectAttentionMeta({
      awaitingReviewCount: 1,
      ciStatus: "passing",
      staleBranchCount: 0,
      unpushedCommitCount: 0,
    }),
    {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: "1 PR waiting",
    },
  );
});
