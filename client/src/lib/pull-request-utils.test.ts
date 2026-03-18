import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPullRequestsByFocus,
  getPullRequestFollowUpMeta,
  getPullRequestReviewSummary,
  getPullRequestStatusMeta,
  pullRequestNeedsAuthorFollowUp,
  pullRequestNeedsViewerReview,
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

test("pullRequestNeedsViewerReview prefers direct review responsibility", () => {
  assert.equal(
    pullRequestNeedsViewerReview({
      authoredByViewer: false,
      isViewerRequestedReviewer: true,
      reviewState: "unreviewed",
      reviewedByViewer: false,
      status: "review_required",
    }),
    true,
  );
});

test("pullRequestNeedsAuthorFollowUp detects changes requested on your PR", () => {
  assert.equal(
    pullRequestNeedsAuthorFollowUp({
      authoredByViewer: true,
      status: "changes_requested",
    }),
    true,
  );
});

test("getPullRequestFollowUpMeta exposes waiting labels", () => {
  assert.deepEqual(
    getPullRequestFollowUpMeta({
      authoredByViewer: false,
      isViewerRequestedReviewer: false,
      reviewState: "reviewed_by_you",
      reviewedByViewer: true,
      status: "approved",
    }),
    {
      className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
      label: "you reviewed",
    },
  );
});

test("filterPullRequestsByFocus narrows authored pull requests", () => {
  const pullRequests = [
    {
      authoredByViewer: true,
      isViewerRequestedReviewer: false,
      reviewState: "unreviewed",
      reviewedByViewer: false,
      status: "open",
    },
    {
      authoredByViewer: false,
      isViewerRequestedReviewer: true,
      reviewState: "unreviewed",
      reviewedByViewer: false,
      status: "review_required",
    },
  ];

  assert.equal(
    filterPullRequestsByFocus(
      pullRequests as never,
      "authored_by_me",
    ).length,
    1,
  );
});
