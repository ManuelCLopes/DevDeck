import { useEffect, useRef } from "react";
import { getDesktopApi } from "@/lib/desktop";
import type { AppPreferences } from "@/lib/app-preferences";
import type { WorkspaceSnapshot } from "@shared/workspace";

interface PullRequestAlertState {
  reviewState: string;
  status: string;
}

export function useWorkspaceAlerts(
  snapshot: WorkspaceSnapshot | null | undefined,
  preferences: AppPreferences,
) {
  const previousPullRequestsRef = useRef<Map<string, PullRequestAlertState> | null>(null);
  const previousProjectCiStatusRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (!desktopApi?.showNotification) {
      return;
    }

    const currentPullRequests = new Map(
      snapshot.pullRequests.map((pullRequest) => [
        pullRequest.id,
        {
          reviewState: pullRequest.reviewState,
          status: pullRequest.status,
        },
      ]),
    );
    const currentProjectCiStatus = new Map(
      snapshot.projects.map((project) => [project.id, project.ciStatus]),
    );

    if (!previousPullRequestsRef.current || !previousProjectCiStatusRef.current) {
      previousPullRequestsRef.current = currentPullRequests;
      previousProjectCiStatusRef.current = currentProjectCiStatus;
      return;
    }

    for (const pullRequest of snapshot.pullRequests) {
      const previousPullRequest = previousPullRequestsRef.current.get(pullRequest.id);

      if (
        preferences.notifyReviewRequired &&
        (!previousPullRequest || previousPullRequest.reviewState !== pullRequest.reviewState) &&
        pullRequest.reviewState === "unreviewed"
      ) {
        void desktopApi.showNotification({
          body: `${pullRequest.repo} · #${pullRequest.number}`,
          title: `Review needed: ${pullRequest.title}`,
        });
      }

      if (
        preferences.notifyChangesRequested &&
        previousPullRequest?.status !== pullRequest.status &&
        pullRequest.status === "changes_requested"
      ) {
        void desktopApi.showNotification({
          body: `${pullRequest.repo} · #${pullRequest.number}`,
          title: `Changes requested on ${pullRequest.title}`,
        });
      }

      if (
        preferences.notifyApproved &&
        previousPullRequest?.status !== pullRequest.status &&
        pullRequest.status === "approved"
      ) {
        void desktopApi.showNotification({
          body: `${pullRequest.repo} · #${pullRequest.number}`,
          title: `PR approved: ${pullRequest.title}`,
        });
      }
    }

    if (preferences.alertFailingBuilds) {
      for (const project of snapshot.projects) {
        const previousCiStatus = previousProjectCiStatusRef.current.get(project.id);
        if (previousCiStatus !== "failing" && project.ciStatus === "failing") {
          void desktopApi.showNotification({
            body: project.remoteUrl ?? project.localPath,
            title: `Failing CI on ${project.name}`,
          });
        }
      }
    }

    previousPullRequestsRef.current = currentPullRequests;
    previousProjectCiStatusRef.current = currentProjectCiStatus;
  }, [preferences, snapshot]);
}
