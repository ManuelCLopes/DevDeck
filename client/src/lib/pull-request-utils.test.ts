import test from "node:test";
import assert from "node:assert/strict";
import {
  getPullRequestReviewSummary,
  getPullRequestStatusMeta,
} from "./pull-request-utils";

test("getPullRequestReviewSummary marks unreviewed PRs clearly", () => {
  assert.deepEqual(
    getPullRequestReviewSummary({
      reviewCount: 0,
      reviewState: "unreviewed",
      reviewedByOthersCount: 0,
      reviewedByViewer: false,
    }),
    {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: "no reviews yet",
    },
  );
});

test("getPullRequestReviewSummary prioritizes viewer reviews", () => {
  assert.deepEqual(
    getPullRequestReviewSummary({
      reviewCount: 3,
      reviewState: "reviewed_by_you",
      reviewedByOthersCount: 2,
      reviewedByViewer: true,
    }),
    {
      className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
      label: "you + 2 reviewers",
    },
  );
});

test("getPullRequestStatusMeta exposes readable labels", () => {
  assert.equal(getPullRequestStatusMeta("changes_requested").label, "changes requested");
  assert.equal(getPullRequestStatusMeta("approved").label, "approved");
});
