import type { WorkspaceGitHubState, WorkspaceGitHubStatus } from "@shared/workspace";

interface GitHubStatusMeta {
  className: string;
  label: string;
}

const META_BY_STATE: Record<WorkspaceGitHubState, GitHubStatusMeta> = {
  connected: {
    className: "bg-chart-1/10 text-chart-1 border-chart-1/20",
    label: "Connected",
  },
  error: {
    className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    label: "Unavailable",
  },
  missing_cli: {
    className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    label: "CLI Missing",
  },
  unauthenticated: {
    className: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    label: "Sign In Required",
  },
  unsupported: {
    className: "bg-secondary text-muted-foreground border-border/60",
    label: "Desktop Only",
  },
};

export function getGitHubStatusMeta(
  status: Pick<WorkspaceGitHubStatus, "state"> | null | undefined,
) {
  return META_BY_STATE[status?.state ?? "unsupported"];
}
