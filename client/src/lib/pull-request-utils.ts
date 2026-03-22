import type {
  WorkspaceAuthoredPullRequestStatus,
  WorkspaceCiStatus,
  WorkspacePullRequestItem,
  WorkspacePullRequestStatus,
} from "@shared/workspace";
import type {
  PullRequestWatchStatus,
  PullRequestWatchlist,
} from "@/lib/pull-request-watchlist";

export type PullRequestFocus =
  | "all"
  | "my_queue"
  | "marked_for_review"
  | "in_review"
  | "done"
  | "no_reviews"
  | "checks_failing"
  | "checks_passing"
  | "needs_my_review"
  | "needs_my_follow_up"
  | "authored_by_me"
  | "changes_requested"
  | "reviewed_by_me"
  | "waiting_on_others";

interface PullRequestBadgeMeta {
  className: string;
  label: string;
}

function normalizePullRequestWatchlist(value?: PullRequestWatchlist | null) {
  return value ?? {};
}

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

export function pullRequestHasNoReviews(
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

  return reviewState === "unreviewed";
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

export function getPullRequestWatchStatusMeta(status: PullRequestWatchStatus) {
  switch (status) {
    case "in_review":
      return {
        className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
        label: "in review",
      };
    case "done":
      return {
        className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
        label: "done",
      };
    default:
      return {
        className: "bg-primary/10 text-primary border-primary/20",
        label: "marked",
      };
  }
}

export function getAuthoredPullRequestStatusMeta(
  status: WorkspaceAuthoredPullRequestStatus,
) {
  switch (status) {
    case "draft":
      return {
        className: "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a]",
        label: "Draft",
      };
    case "waiting_for_review":
      return {
        className: "border-[#1a7f37]/20 bg-[#dafbe1] text-[#1a7f37]",
        label: "Waiting for review",
      };
    case "reviewed":
      return {
        className: "border-[#0969da]/20 bg-[#ddf4ff] text-[#0969da]",
        label: "Reviewed",
      };
    case "changes_requested":
      return {
        className: "border-[#cf222e]/20 bg-[#ffebe9] text-[#cf222e]",
        label: "Changes requested",
      };
    case "approved":
      return {
        className: "border-[#1a7f37]/20 bg-[#dafbe1] text-[#1a7f37]",
        label: "Approved",
      };
    case "merged":
      return {
        className: "border-[#8250df]/20 bg-[#fbefff] text-[#8250df]",
        label: "Merged",
      };
    case "closed":
      return {
        className: "border-[#cf222e]/20 bg-[#ffebe9] text-[#cf222e]",
        label: "Closed",
      };
    default:
      return {
        className: "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a]",
        label: "Open",
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

export function pullRequestNeedsFollowUp(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    "authoredByViewer" | "hasUpdatesSinceViewerReview" | "reviewedByViewer"
  >,
) {
  return (
    !pullRequest.authoredByViewer &&
    pullRequest.reviewedByViewer &&
    pullRequest.hasUpdatesSinceViewerReview
  );
}

export function pullRequestWaitingOnOthers(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    | "authoredByViewer"
    | "hasUpdatesSinceViewerReview"
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
    !pullRequestNeedsAuthorFollowUp(pullRequest) &&
    !pullRequestNeedsFollowUp(pullRequest)
  );
}

export function filterPullRequestsByFocus(
  pullRequests: WorkspacePullRequestItem[],
  focus: PullRequestFocus,
  watchlist: PullRequestWatchlist = {},
) {
  const normalizedWatchlist = normalizePullRequestWatchlist(watchlist);

  switch (focus) {
    case "my_queue":
      return pullRequests.filter((pullRequest) => Boolean(normalizedWatchlist[pullRequest.id]));
    case "marked_for_review":
      return pullRequests.filter((pullRequest) =>
        normalizedWatchlist[pullRequest.id]?.status === "marked",
      );
    case "in_review":
      return pullRequests.filter((pullRequest) =>
        normalizedWatchlist[pullRequest.id]?.status === "in_review",
      );
    case "done":
      return pullRequests.filter((pullRequest) =>
        normalizedWatchlist[pullRequest.id]?.status === "done",
      );
    case "no_reviews":
      return pullRequests.filter(pullRequestHasNoReviews);
    case "checks_failing":
      return pullRequests.filter(
        (pullRequest) => pullRequest.ciStatus === "failing",
      );
    case "checks_passing":
      return pullRequests.filter(
        (pullRequest) => pullRequest.ciStatus === "passing",
      );
    case "needs_my_review":
      return pullRequests.filter(pullRequestNeedsViewerReview);
    case "needs_my_follow_up":
      return pullRequests.filter(pullRequestNeedsFollowUp);
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
    | "hasUpdatesSinceViewerReview"
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

  if (pullRequestNeedsFollowUp(pullRequest)) {
    return {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: "needs your follow-up",
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

export function getPullRequestWatchMeta(markedForReview: boolean) {
  return markedForReview
    ? getPullRequestWatchStatusMeta("marked")
    : {
        className: "bg-secondary text-muted-foreground border-border/60",
        label: "not marked",
      };
}

export function getPullRequestSignalBadges(
  pullRequest: Pick<
    WorkspacePullRequestItem,
    | "ciStatus"
    | "reviewCount"
    | "reviewState"
    | "reviewedByOthersCount"
    | "reviewedByViewer"
  >,
  watchStatus: PullRequestWatchStatus | null,
): PullRequestBadgeMeta[] {
  const badges: PullRequestBadgeMeta[] = [];

  if (pullRequestHasNoReviews(pullRequest)) {
    badges.push({
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: "no reviews",
    });
  }

  if (pullRequest.ciStatus === "passing" || pullRequest.ciStatus === "failing") {
    badges.push(getPullRequestCiStatusMeta(pullRequest.ciStatus));
  }

  if (watchStatus) {
    badges.push(getPullRequestWatchStatusMeta(watchStatus));
  }

  return badges;
}
