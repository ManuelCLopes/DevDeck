import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPullRequestsByFocus,
  getPullRequestCiStatusMeta,
  getPullRequestFollowUpMeta,
  getPullRequestReviewSummary,
  getPullRequestSignalBadges,
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

test("getPullRequestCiStatusMeta exposes readable CI labels", () => {
  assert.equal(getPullRequestCiStatusMeta("passing").label, "checks passing");
  assert.equal(getPullRequestCiStatusMeta("failing").label, "checks failing");
});

test("getPullRequestSignalBadges keeps only key PR signals", () => {
  assert.deepEqual(
    getPullRequestSignalBadges(
      {
        ciStatus: "passing",
        reviewCount: 0,
        reviewState: "unreviewed",
        reviewedByOthersCount: 0,
        reviewedByViewer: false,
      },
      true,
    ),
    [
      {
        className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
        label: "no reviews",
      },
      {
        className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
        label: "checks passing",
      },
      {
        className: "bg-primary/10 text-primary border-primary/20",
        label: "marked for review",
      },
    ],
  );
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

test("filterPullRequestsByFocus narrows changes requested pull requests", () => {
  const pullRequests = [
    {
      status: "changes_requested",
    },
    {
      status: "approved",
    },
  ];

  assert.equal(
    filterPullRequestsByFocus(
      pullRequests as never,
      "changes_requested",
    ).length,
    1,
  );
});

test("filterPullRequestsByFocus narrows marked pull requests", () => {
  const pullRequests = [
    {
      id: "repo-one#12",
      status: "open",
    },
    {
      id: "repo-two#8",
      status: "review_required",
    },
  ];

  assert.equal(
    filterPullRequestsByFocus(
      pullRequests as never,
      "marked_for_review",
      new Set(["repo-two#8"]),
    ).length,
    1,
  );
});

test("filterPullRequestsByFocus narrows no review pull requests", () => {
  const pullRequests = [
    {
      ciStatus: "failing",
      id: "repo-one#12",
      reviewCount: 0,
      reviewState: "unreviewed",
      reviewedByOthersCount: 0,
      reviewedByViewer: false,
    },
    {
      ciStatus: "passing",
      id: "repo-two#8",
      reviewCount: 2,
      reviewState: "reviewed",
      reviewedByOthersCount: 2,
      reviewedByViewer: false,
    },
  ];

  assert.equal(
    filterPullRequestsByFocus(
      pullRequests as never,
      "no_reviews",
    ).length,
    1,
  );
});

test("filterPullRequestsByFocus narrows CI status pull requests", () => {
  const pullRequests = [
    {
      ciStatus: "failing",
      id: "repo-one#12",
    },
    {
      ciStatus: "passing",
      id: "repo-two#8",
    },
  ];

  assert.equal(
    filterPullRequestsByFocus(
      pullRequests as never,
      "checks_failing",
    ).length,
    1,
  );
  assert.equal(
    filterPullRequestsByFocus(
      pullRequests as never,
      "checks_passing",
    ).length,
    1,
  );
});
