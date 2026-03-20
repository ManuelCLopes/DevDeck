import test from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceSnapshot } from "./workspace";
import {
  collectWorkspaceNotifications,
  getWorkspaceAttentionSummary,
} from "./workspace-monitor";

function createSnapshot(overrides?: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
  return {
    activities: [],
    authoredPullRequests: [],
    generatedAt: "2026-03-18T19:00:00.000Z",
    githubStatus: {
      authenticated: true,
      connectedRepositoryCount: 1,
      message: null,
      state: "connected",
      viewerLogin: "manuel",
    },
    insights: {
      needsAttention: [],
      recentHighlights: [],
    },
    pullRequests: [],
    projects: [],
    reviews: [],
    summary: {
      healthyRepositories: 0,
      localBranches: 0,
      openPullRequests: 0,
      repositories: 0,
      staleBranches: 0,
    },
    ...overrides,
  };
}

test("collectWorkspaceNotifications emits review and approval changes", () => {
  const previousSnapshot = createSnapshot({
    pullRequests: [
      {
        author: "someone",
        authoredByViewer: false,
        baseBranch: "main",
        ciStatus: "passing",
        hasUpdatesSinceViewerReview: false,
        headBranch: "feature/pr",
        id: "repo#1",
        isViewerRequestedReviewer: false,
        lastReviewedByViewerAt: null,
        number: 1,
        projectId: "project-1",
        repo: "repo",
        repositorySlug: "example/repo",
        reviewCount: 0,
        reviewState: "reviewed",
        reviewTimeline: [],
        requestedReviewerLogins: [],
        reviewedByOthersCount: 0,
        reviewedByViewer: false,
        reviewerLogins: [],
        status: "open",
        title: "Improve workflow",
        updatedAt: "2026-03-18T19:00:00.000Z",
        url: "https://github.com/example/repo/pull/1",
      },
    ],
  });
  const nextSnapshot = createSnapshot({
    pullRequests: [
      {
        ...previousSnapshot.pullRequests[0]!,
        reviewState: "unreviewed",
        status: "approved",
        updatedAt: "2026-03-18T20:00:00.000Z",
      },
    ],
  });

  const notifications = collectWorkspaceNotifications(previousSnapshot, nextSnapshot, {
    alertFailingBuilds: true,
    notifyApproved: true,
    notifyChangesRequested: true,
    notifyReviewRequired: true,
  });

  assert.deepEqual(
    notifications.map((notification) => notification.title),
    ["Review needed: Improve workflow", "PR approved: Improve workflow"],
  );
});

test("collectWorkspaceNotifications emits failing CI alerts when status degrades", () => {
  const previousSnapshot = createSnapshot({
    projects: [
      {
        aheadBy: 0,
        awaitingReviewCount: 0,
        behindBy: 0,
        branchCount: 1,
        ciStatus: "passing",
        contributorCount7d: 1,
        currentBranch: "main",
        defaultBranch: "main",
        description: "repo",
        hasUpstream: true,
        id: "project-1",
        language: "TypeScript",
        lastActivityMessage: null,
        lastUpdated: "2026-03-18T19:00:00.000Z",
        localPath: "/tmp/repo",
        name: "repo",
        openPullRequestCount: 0,
        remoteUrl: "https://github.com/example/repo",
        reviewedByViewerCount: 0,
        staleBranchCount: 0,
        status: "healthy",
        team: "root",
        unpushedCommitCount: 0,
      },
    ],
  });
  const nextSnapshot = createSnapshot({
    projects: [
      {
        ...previousSnapshot.projects[0]!,
        ciStatus: "failing",
        status: "critical",
        lastUpdated: "2026-03-18T20:00:00.000Z",
      },
    ],
  });

  const notifications = collectWorkspaceNotifications(previousSnapshot, nextSnapshot, {
    alertFailingBuilds: true,
    notifyApproved: true,
    notifyChangesRequested: true,
    notifyReviewRequired: true,
  });

  assert.equal(notifications[0]?.title, "Failing CI on repo");
});

test("getWorkspaceAttentionSummary separates review queue and follow-up work", () => {
  const snapshot = createSnapshot({
    pullRequests: [
      {
        author: "teammate",
        authoredByViewer: false,
        baseBranch: "main",
        ciStatus: "passing",
        hasUpdatesSinceViewerReview: false,
        headBranch: "feature/review-me",
        id: "repo#1",
        isViewerRequestedReviewer: true,
        lastReviewedByViewerAt: null,
        number: 1,
        projectId: "project-1",
        repo: "repo",
        repositorySlug: "example/repo",
        reviewCount: 0,
        reviewState: "unreviewed",
        reviewTimeline: [],
        requestedReviewerLogins: ["manuel"],
        reviewedByOthersCount: 0,
        reviewedByViewer: false,
        reviewerLogins: [],
        status: "review_required",
        title: "Need review",
        updatedAt: "2026-03-18T20:00:00.000Z",
        url: "https://github.com/example/repo/pull/1",
      },
      {
        author: "teammate",
        authoredByViewer: false,
        baseBranch: "main",
        ciStatus: "failing",
        hasUpdatesSinceViewerReview: true,
        headBranch: "feature/follow-up",
        id: "repo#2",
        isViewerRequestedReviewer: false,
        lastReviewedByViewerAt: "2026-03-18T19:55:00.000Z",
        number: 2,
        projectId: "project-1",
        repo: "repo",
        repositorySlug: "example/repo",
        reviewCount: 1,
        reviewState: "reviewed_by_you",
        reviewTimeline: [],
        requestedReviewerLogins: [],
        reviewedByOthersCount: 0,
        reviewedByViewer: true,
        reviewerLogins: ["manuel"],
        status: "open",
        title: "Need follow-up",
        updatedAt: "2026-03-18T20:05:00.000Z",
        url: "https://github.com/example/repo/pull/2",
      },
    ],
  });

  assert.deepEqual(getWorkspaceAttentionSummary(snapshot), {
    needsAuthorFollowUpCount: 1,
    needsViewerReviewCount: 1,
    totalAttentionCount: 2,
  });
});
