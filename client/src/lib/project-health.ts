import type { WorkspaceCiStatus, WorkspaceProject } from "@shared/workspace";

export function getCiStatusMeta(status: WorkspaceCiStatus) {
  switch (status) {
    case "passing":
      return {
        className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
        label: "CI passing",
      };
    case "failing":
      return {
        className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
        label: "CI failing",
      };
    case "pending":
      return {
        className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
        label: "CI pending",
      };
    default:
      return {
        className: "bg-secondary text-muted-foreground border-border/60",
        label: "CI unknown",
      };
  }
}

export function getProjectAttentionSummary(project: Pick<
  WorkspaceProject,
  "awaitingReviewCount" | "ciStatus" | "staleBranchCount" | "unpushedCommitCount"
>) {
  if (project.awaitingReviewCount > 0) {
    return `${project.awaitingReviewCount} PR${project.awaitingReviewCount === 1 ? "" : "s"} waiting`;
  }

  if (project.ciStatus === "failing") {
    return "failing CI";
  }

  if (project.unpushedCommitCount > 0) {
    return `${project.unpushedCommitCount} unpushed`;
  }

  if (project.staleBranchCount > 0) {
    return `${project.staleBranchCount} stale branch${project.staleBranchCount === 1 ? "" : "es"}`;
  }

  return "clear";
}
