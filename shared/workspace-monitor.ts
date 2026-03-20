import type { WorkspaceSnapshot } from "./workspace";

export interface WorkspaceMonitorPreferences {
  alertFailingBuilds: boolean;
  notifyApproved: boolean;
  notifyChangesRequested: boolean;
  notifyReviewRequired: boolean;
}

export interface WorkspaceNotificationPayload {
  body?: string;
  key: string;
  title: string;
}

export interface WorkspaceAttentionSummary {
  needsAuthorFollowUpCount: number;
  needsViewerReviewCount: number;
  totalAttentionCount: number;
}

interface PullRequestAlertState {
  reviewState: string;
  status: string;
}

function pullRequestNeedsViewerReview(
  pullRequest: WorkspaceSnapshot["pullRequests"][number],
) {
  if (pullRequest.authoredByViewer || pullRequest.reviewedByViewer) {
    return false;
  }

  return (
    pullRequest.isViewerRequestedReviewer ||
    (pullRequest.status === "review_required" &&
      pullRequest.reviewState === "unreviewed")
  );
}

function pullRequestNeedsAuthorFollowUp(
  pullRequest: WorkspaceSnapshot["pullRequests"][number],
) {
  return (
    !pullRequest.authoredByViewer &&
    pullRequest.reviewedByViewer &&
    pullRequest.hasUpdatesSinceViewerReview
  );
}

export function getWorkspaceAttentionSummary(snapshot: WorkspaceSnapshot) {
  const needsViewerReviewCount = snapshot.pullRequests.filter(
    pullRequestNeedsViewerReview,
  ).length;
  const needsAuthorFollowUpCount = snapshot.pullRequests.filter(
    pullRequestNeedsAuthorFollowUp,
  ).length;

  return {
    needsAuthorFollowUpCount,
    needsViewerReviewCount,
    totalAttentionCount: needsViewerReviewCount + needsAuthorFollowUpCount,
  } satisfies WorkspaceAttentionSummary;
}

export function collectWorkspaceNotifications(
  previousSnapshot: WorkspaceSnapshot | null,
  nextSnapshot: WorkspaceSnapshot,
  preferences: WorkspaceMonitorPreferences,
) {
  if (!previousSnapshot) {
    return [] as WorkspaceNotificationPayload[];
  }

  const notifications: WorkspaceNotificationPayload[] = [];
  const previousPullRequests = new Map<string, PullRequestAlertState>(
    previousSnapshot.pullRequests.map((pullRequest) => [
      pullRequest.id,
      {
        reviewState: pullRequest.reviewState,
        status: pullRequest.status,
      },
    ]),
  );
  const previousProjectCiStatuses = new Map(
    previousSnapshot.projects.map((project) => [project.id, project.ciStatus]),
  );

  for (const pullRequest of nextSnapshot.pullRequests) {
    const previousPullRequest = previousPullRequests.get(pullRequest.id);

    if (
      preferences.notifyReviewRequired &&
      (!previousPullRequest || previousPullRequest.reviewState !== pullRequest.reviewState) &&
      pullRequest.reviewState === "unreviewed"
    ) {
      notifications.push({
        body: `${pullRequest.repo} · #${pullRequest.number}`,
        key: `review-required:${pullRequest.id}:${pullRequest.updatedAt}`,
        title: `Review needed: ${pullRequest.title}`,
      });
    }

    if (
      preferences.notifyChangesRequested &&
      previousPullRequest?.status !== pullRequest.status &&
      pullRequest.status === "changes_requested"
    ) {
      notifications.push({
        body: `${pullRequest.repo} · #${pullRequest.number}`,
        key: `changes-requested:${pullRequest.id}:${pullRequest.updatedAt}`,
        title: `Changes requested on ${pullRequest.title}`,
      });
    }

    if (
      preferences.notifyApproved &&
      previousPullRequest?.status !== pullRequest.status &&
      pullRequest.status === "approved"
    ) {
      notifications.push({
        body: `${pullRequest.repo} · #${pullRequest.number}`,
        key: `approved:${pullRequest.id}:${pullRequest.updatedAt}`,
        title: `PR approved: ${pullRequest.title}`,
      });
    }
  }

  if (preferences.alertFailingBuilds) {
    for (const project of nextSnapshot.projects) {
      const previousCiStatus = previousProjectCiStatuses.get(project.id);
      if (previousCiStatus !== "failing" && project.ciStatus === "failing") {
        notifications.push({
          body: project.remoteUrl ?? project.localPath,
          key: `failing-ci:${project.id}:${project.lastUpdated}`,
          title: `Failing CI on ${project.name}`,
        });
      }
    }
  }

  return notifications;
}
