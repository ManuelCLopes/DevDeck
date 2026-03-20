import type { WorkspaceCiStatus, WorkspaceProject } from "@shared/workspace";

export interface ProjectAttentionMeta {
  className: string;
  label: string;
}

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
  return getProjectAttentionMeta(project).label;
}

export function getProjectAttentionMeta(project: Pick<
  WorkspaceProject,
  "awaitingReviewCount" | "ciStatus" | "staleBranchCount" | "unpushedCommitCount"
>): ProjectAttentionMeta {
  if (project.ciStatus === "failing") {
    return {
      className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
      label: "CI failing",
    };
  }

  if (project.awaitingReviewCount > 0) {
    return {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: `${project.awaitingReviewCount} PR${project.awaitingReviewCount === 1 ? "" : "s"} waiting`,
    };
  }

  if (project.unpushedCommitCount > 0) {
    return {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: `${project.unpushedCommitCount} unpushed`,
    };
  }

  if (project.staleBranchCount > 0) {
    return {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: `${project.staleBranchCount} stale branch${project.staleBranchCount === 1 ? "" : "es"}`,
    };
  }

  if (project.ciStatus === "pending") {
    return {
      className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
      label: "CI pending",
    };
  }

  return {
    className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
    label: "Clear",
  };
}
