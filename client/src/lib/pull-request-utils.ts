import type {
  WorkspacePullRequestItem,
  WorkspacePullRequestStatus,
} from "@shared/workspace";

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
