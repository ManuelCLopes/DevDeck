import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPullRequestsByDependabotVisibility,
  filterPullRequestsByFocus,
  getAuthoredPullRequestStatusMeta,
  getPullRequestCiStatusMeta,
  getPullRequestDerivedQueueState,
  getPullRequestFollowUpMeta,
  getPullRequestReviewSummary,
  getPullRequestSignalBadges,
  getPullRequestStatusMeta,
  isDependabotPullRequest,
  pullRequestNeedsAuthorFollowUp,
  pullRequestNeedsFollowUp,
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
      "marked",
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
        label: "marked",
      },
    ],
  );
});

test("getPullRequestDerivedQueueState marks reviewed pull requests awaiting follow-up", () => {
  assert.equal(
    getPullRequestDerivedQueueState(
      {
        authoredByViewer: false,
        hasUpdatesSinceViewerReview: true,
        reviewedByViewer: true,
      },
      "reviewed",
    ),
    "awaiting_follow_up",
  );
});

test("getPullRequestSignalBadges surfaces awaiting follow-up for reviewed queue items", () => {
  assert.deepEqual(
    getPullRequestSignalBadges(
      {
        authoredByViewer: false,
        ciStatus: "pending",
        hasUpdatesSinceViewerReview: true,
        reviewCount: 1,
        reviewState: "reviewed_by_you",
        reviewedByOthersCount: 0,
        reviewedByViewer: true,
      },
      "reviewed",
    ),
    [
      {
        className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
        label: "awaiting follow-up",
      },
    ],
  );
});

test("getAuthoredPullRequestStatusMeta exposes follow-up specific authored labels", () => {
  assert.equal(
    getAuthoredPullRequestStatusMeta("waiting_for_review").label,
    "Waiting for review",
  );
  assert.equal(
    getAuthoredPullRequestStatusMeta("changes_requested").label,
    "Changes requested",
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

test("pullRequestNeedsFollowUp detects updated PRs after your review", () => {
  assert.equal(
    pullRequestNeedsFollowUp({
      authoredByViewer: false,
      hasUpdatesSinceViewerReview: true,
      reviewedByViewer: true,
    }),
    true,
  );
});

test("getPullRequestFollowUpMeta exposes waiting labels", () => {
  assert.deepEqual(
    getPullRequestFollowUpMeta({
      authoredByViewer: false,
      hasUpdatesSinceViewerReview: false,
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

test("getPullRequestFollowUpMeta prioritizes post-review follow-up", () => {
  assert.deepEqual(
    getPullRequestFollowUpMeta({
      authoredByViewer: false,
      hasUpdatesSinceViewerReview: true,
      isViewerRequestedReviewer: false,
      reviewState: "reviewed_by_you",
      reviewedByViewer: true,
      status: "open",
    }),
    {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: "needs your follow-up",
    },
  );
});

test("isDependabotPullRequest detects dependabot authors", () => {
  assert.equal(
    isDependabotPullRequest({
      author: "dependabot[bot]",
    } as never),
    true,
  );
  assert.equal(
    isDependabotPullRequest({
      author: "teammate",
    } as never),
    false,
  );
});

test("filterPullRequestsByDependabotVisibility hides dependabot items when disabled", () => {
  const pullRequests = [
    {
      author: "dependabot[bot]",
      id: "repo-one#12",
    },
    {
      author: "teammate",
      id: "repo-two#8",
    },
  ];

  assert.equal(
    filterPullRequestsByDependabotVisibility(
      pullRequests as never,
      false,
    ).length,
    1,
  );
  assert.equal(
    filterPullRequestsByDependabotVisibility(
      pullRequests as never,
      true,
    ).length,
    2,
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
      {
        "repo-two#8": {
          markedAt: "2026-03-18T20:00:00.000Z",
          status: "marked",
          updatedAt: "2026-03-18T20:00:00.000Z",
        },
      },
    ).length,
    1,
  );
});

test("filterPullRequestsByFocus narrows queue state filters", () => {
  const pullRequests = [
    {
      id: "repo-one#12",
      status: "open",
    },
    {
      id: "repo-two#8",
      status: "review_required",
    },
    {
      id: "repo-three#3",
      status: "approved",
    },
  ];

  const watchlist = {
    "repo-one#12": {
      markedAt: "2026-03-18T20:00:00.000Z",
      status: "marked" as const,
      updatedAt: "2026-03-18T20:00:00.000Z",
    },
    "repo-two#8": {
      markedAt: "2026-03-18T20:00:00.000Z",
      status: "reviewed" as const,
      updatedAt: "2026-03-18T20:00:00.000Z",
    },
    "repo-three#3": {
      markedAt: "2026-03-18T20:00:00.000Z",
      status: "reviewed" as const,
      updatedAt: "2026-03-18T20:00:00.000Z",
    },
  };

  assert.equal(
    filterPullRequestsByFocus(pullRequests as never, "my_queue", watchlist).length,
    3,
  );
  assert.equal(
    filterPullRequestsByFocus(pullRequests as never, "reviewed", watchlist).length,
    2,
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
