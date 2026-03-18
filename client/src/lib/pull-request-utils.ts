import type {
  WorkspaceCiStatus,
  WorkspacePullRequestItem,
  WorkspacePullRequestStatus,
} from "@shared/workspace";

export type PullRequestFocus =
  | "all"
  | "needs_my_review"
  | "needs_my_follow_up"
  | "authored_by_me"
  | "changes_requested"
  | "reviewed_by_me"
  | "waiting_on_others";

export function getPullRequestStatusMeta(status: WorkspacePullRequestStatus) {
  switch (status) {
    case "approved":
      return {
        className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
        label: "approved",
      };
    case "changes_requested":
      return {
        className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
        label: "changes requested",
      };
    case "draft":
      return {
        className: "bg-secondary text-muted-foreground border-border/60",
        label: "draft",
      };
    case "review_required":
      return {
        className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
        label: "review required",
      };
    default:
      return {
        className: "bg-secondary text-foreground border-border/60",
        label: "open",
      };
  }
}

export function getPullRequestReviewSummary(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    | "reviewCount"
    | "reviewState"
    | "reviewedByOthersCount"
    | "reviewedByViewer"
  >,
) {
  const reviewedByViewer = pullRequest.reviewedByViewer ?? false;
  const reviewedByOthersCount = pullRequest.reviewedByOthersCount ?? 0;
  const reviewCount =
    pullRequest.reviewCount ??
    reviewedByOthersCount + (reviewedByViewer ? 1 : 0);
  const reviewState =
    pullRequest.reviewState ??
    (reviewedByViewer
      ? "reviewed_by_you"
      : reviewCount > 0
        ? "reviewed"
        : "unreviewed");

  if (reviewState === "reviewed_by_you") {
    return {
      className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
      label:
        reviewedByOthersCount > 0
          ? `you + ${reviewedByOthersCount} reviewer${reviewedByOthersCount === 1 ? "" : "s"}`
          : "you reviewed",
    };
  }

  if (reviewState === "reviewed") {
    return {
      className: "bg-secondary text-foreground border-border/60",
      label: `${reviewCount} reviewer${reviewCount === 1 ? "" : "s"}`,
    };
  }

  return {
    className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    label: "no reviews yet",
  };
}

export function getPullRequestCiStatusMeta(status: WorkspaceCiStatus) {
  switch (status) {
    case "passing":
      return {
        className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
        label: "checks passing",
      };
    case "failing":
      return {
        className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
        label: "checks failing",
      };
    case "pending":
      return {
        className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
        label: "checks pending",
      };
    default:
      return {
        className: "bg-secondary text-muted-foreground border-border/60",
        label: "checks unknown",
      };
  }
}

export function getPullRequestReviewEventMeta(state: string) {
  switch (state) {
    case "APPROVED":
      return {
        className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
        label: "approved",
      };
    case "CHANGES_REQUESTED":
      return {
        className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
        label: "changes requested",
      };
    case "COMMENTED":
      return {
        className: "bg-secondary text-foreground border-border/60",
        label: "commented",
      };
    case "DISMISSED":
      return {
        className: "bg-secondary text-muted-foreground border-border/60",
        label: "dismissed",
      };
    default:
      return {
        className: "bg-secondary text-muted-foreground border-border/60",
        label: state.toLowerCase().replaceAll("_", " "),
      };
  }
}

export function pullRequestNeedsViewerReview(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    | "authoredByViewer"
    | "isViewerRequestedReviewer"
    | "reviewState"
    | "reviewedByViewer"
    | "status"
  >,
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

export function pullRequestNeedsAuthorFollowUp(
  pullRequest: Pick<WorkspacePullRequestItem, "authoredByViewer" | "status">,
) {
  return pullRequest.authoredByViewer && pullRequest.status === "changes_requested";
}

export function pullRequestWaitingOnOthers(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    | "authoredByViewer"
    | "isViewerRequestedReviewer"
    | "reviewState"
    | "reviewedByViewer"
    | "status"
  >,
) {
  if (pullRequest.status === "draft") {
    return false;
  }

  return (
    !pullRequestNeedsViewerReview(pullRequest) &&
    !pullRequestNeedsAuthorFollowUp(pullRequest)
  );
}

export function filterPullRequestsByFocus(
  pullRequests: WorkspacePullRequestItem[],
  focus: PullRequestFocus,
) {
  switch (focus) {
    case "needs_my_review":
      return pullRequests.filter(pullRequestNeedsViewerReview);
    case "needs_my_follow_up":
      return pullRequests.filter(pullRequestNeedsAuthorFollowUp);
    case "authored_by_me":
      return pullRequests.filter((pullRequest) => pullRequest.authoredByViewer);
    case "changes_requested":
      return pullRequests.filter(
        (pullRequest) => pullRequest.status === "changes_requested",
      );
    case "reviewed_by_me":
      return pullRequests.filter((pullRequest) => pullRequest.reviewedByViewer);
    case "waiting_on_others":
      return pullRequests.filter(pullRequestWaitingOnOthers);
    default:
      return pullRequests;
  }
}

export function getPullRequestFollowUpMeta(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    | "authoredByViewer"
    | "isViewerRequestedReviewer"
    | "reviewState"
    | "reviewedByViewer"
    | "status"
  >,
) {
  if (pullRequestNeedsAuthorFollowUp(pullRequest)) {
    return {
      className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
      label: "needs your update",
    };
  }

  if (pullRequestNeedsViewerReview(pullRequest)) {
    return {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: pullRequest.isViewerRequestedReviewer
        ? "your review requested"
        : "review recommended",
    };
  }

  if (pullRequest.reviewedByViewer) {
    return {
      className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
      label: "you reviewed",
    };
  }

  return {
    className: "bg-secondary text-muted-foreground border-border/60",
    label: "waiting on others",
  };
}
