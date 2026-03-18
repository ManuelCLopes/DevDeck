import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectRow from "@/components/dashboard/ProjectRow";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import { getWorkspaceSelection } from "@/lib/workspace-selection";
import { formatDistanceToNow } from "date-fns";
import { Link, useSearch } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  Clock3,
  Filter,
  FolderGit2,
  GitBranch,
  Globe,
  HardDrive,
  LayoutGrid,
  Link2Off,
  List,
  MessageSquare,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";

function getPullRequestReviewSummary(pullRequest: {
  authoredByViewer?: boolean;
  reviewCount?: number;
  reviewState?: "unreviewed" | "reviewed" | "reviewed_by_you";
  reviewedByOthersCount?: number;
  reviewedByViewer?: boolean;
}) {
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

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterTeam, setFilterTeam] = useState<string | "All">("All");
  const search = useSearch();
  const focusedProjectId = new URLSearchParams(search).get("project");
  const workspaceSelection = getWorkspaceSelection();
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();

  const projects = snapshot?.projects ?? [];
  const pullRequests = snapshot?.pullRequests ?? [];
  const focusedProject = projects.find((project) => project.id === focusedProjectId) ?? null;
  const visibleProjects = focusedProject ? [focusedProject] : projects;
  const visiblePullRequests = focusedProject
    ? pullRequests.filter((pullRequest) => pullRequest.projectId === focusedProject.id)
    : pullRequests;
  const teams = ["All", ...Array.from(new Set(projects.map((project) => project.team)))];
  const filteredProjects =
    focusedProject
      ? visibleProjects
      : filterTeam === "All"
        ? visibleProjects
        : visibleProjects.filter((project) => project.team === filterTeam);

  const healthyCount = visibleProjects.filter((project) => project.status === "healthy").length;
  const warningCount = visibleProjects.filter((project) => project.status === "warning").length;
  const criticalCount = visibleProjects.filter((project) => project.status === "critical").length;
  const visibleBranchCount = visibleProjects.reduce(
    (total, project) => total + project.branchCount,
    0,
  );
  const focusedProjectActivities = focusedProject
    ? (snapshot?.activities ?? []).filter((activity) => activity.repo === focusedProject.name)
    : [];
  const focusedProjectPullRequests = focusedProject ? visiblePullRequests : [];
  const activeProjectsPageSize = viewMode === "grid" ? 6 : 8;
  const draftPullRequestCount = visiblePullRequests.filter(
    (pullRequest) => pullRequest.status === "draft",
  ).length;
  const attentionPullRequestCount = visiblePullRequests.filter(
    (pullRequest) =>
      pullRequest.status === "changes_requested" ||
      pullRequest.status === "review_required",
  ).length;
  const unreviewedPullRequestCount = visiblePullRequests.filter(
    (pullRequest) => (pullRequest.reviewState ?? "unreviewed") === "unreviewed",
  ).length;
  const reviewedByViewerCount = visiblePullRequests.filter(
    (pullRequest) => pullRequest.reviewedByViewer,
  ).length;
  const reviewedByOthersCount = visiblePullRequests.filter(
    (pullRequest) => (pullRequest.reviewedByOthersCount ?? 0) > 0,
  ).length;
  const workspaceLabel = workspaceSelection?.rootPath ?? workspaceSelection?.rootName ?? "~/Developer";
  const needsAttention = focusedProject
    ? {
        title: focusedProject.remoteUrl
          ? `${focusedProject.name} status: ${focusedProject.status}`
          : `${focusedProject.name} has no origin remote`,
        description: focusedProject.remoteUrl
          ? focusedProject.lastActivityMessage ?? `Current branch: ${focusedProject.currentBranch}`
          : "Connect a remote if you want hosted review and sync metadata.",
      }
    : snapshot?.insights.needsAttention[0] ?? null;
  const recentHighlight = focusedProject
    ? {
        title: `${focusedProject.name} was active ${focusedProject.status === "healthy" ? "recently" : "earlier"}`,
        description:
          focusedProject.lastActivityMessage ?? `Current branch: ${focusedProject.currentBranch}`,
      }
    : snapshot?.insights.recentHighlights[0] ?? null;
  const pullRequestStatusClasses = {
    approved: "bg-chart-1/10 text-chart-1 border-chart-1/20",
    changes_requested: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    draft: "bg-secondary text-muted-foreground border-border/60",
    open: "bg-secondary text-foreground border-border/60",
    review_required: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  } as const;
  const pullRequestStatusLabels = {
    approved: "approved",
    changes_requested: "changes requested",
    draft: "draft",
    open: "open",
    review_required: "review required",
  } as const;
  const overviewPullRequestsPagination = usePagination(
    visiblePullRequests,
    6,
    focusedProjectId ?? "workspace",
  );
  const activeProjectsPagination = usePagination(
    filteredProjects,
    activeProjectsPageSize,
    `${focusedProjectId ?? "workspace"}:${filterTeam}:${viewMode}`,
  );
  const focusedActivityPagination = usePagination(
    focusedProjectActivities,
    4,
    focusedProjectId,
  );
  const focusedPullRequestsPagination = usePagination(
    focusedProjectPullRequests,
    4,
    focusedProjectId,
  );

  const handleOpenPullRequest = async (targetUrl: string) => {
    const desktopApi = getDesktopApi();
    if (desktopApi) {
      await desktopApi.openExternal(targetUrl);
      return;
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">
              {focusedProject ? `${focusedProject.name} Overview` : "Project Overview"}
            </h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              {focusedProject
                ? focusedProject.localPath
                : `DevDeck is monitoring ${workspaceLabel}${projects.length > 0 ? ` · ${projects.length} repositories` : ""}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {focusedProject && (
              <Link href="/">
                <a className="h-8 px-3 rounded-md text-xs font-medium bg-white/80 backdrop-blur-md border border-border/60 hover:bg-black/5 shadow-sm transition-colors whitespace-nowrap inline-flex items-center gap-1.5">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  All Projects
                </a>
              </Link>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              className="h-8 px-3 rounded-md text-xs font-medium bg-white/80 backdrop-blur-md border border-border/60 hover:bg-black/5 shadow-sm transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <div className="bg-secondary/40 p-0.5 rounded-md flex items-center border border-border/40 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-[4px] transition-all shadow-sm ${viewMode === "grid" ? "bg-white/80 backdrop-blur-md text-foreground border border-black/5" : "text-muted-foreground hover:text-foreground bg-transparent border-transparent"}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-[4px] transition-all shadow-sm ${viewMode === "list" ? "bg-white/80 backdrop-blur-md text-foreground border border-black/5" : "text-muted-foreground hover:text-foreground bg-transparent border-transparent"}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/60 backdrop-blur-md border border-border/50 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Monitored Repos</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{visibleProjects.length}</span>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5">
              <FolderGit2 className="w-24 h-24" />
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/50 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Repository Health</h3>
            <div className="flex items-center gap-4 text-sm font-medium mt-auto pb-1">
              <div className="flex items-center gap-1.5 text-chart-1"><div className="w-2 h-2 rounded-full bg-chart-1 shadow-[0_0_8px_rgba(39,201,63,0.5)]" />{healthyCount}</div>
              <div className="flex items-center gap-1.5 text-chart-2"><div className="w-2 h-2 rounded-full bg-chart-2 shadow-[0_0_8px_rgba(255,189,46,0.5)]" />{warningCount}</div>
              <div className="flex items-center gap-1.5 text-chart-3"><div className="w-2 h-2 rounded-full bg-chart-3 shadow-[0_0_8px_rgba(255,95,86,0.5)]" />{criticalCount}</div>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/50 rounded-xl p-4 shadow-sm">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Local Branches</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">{visibleBranchCount}</span>
              {!focusedProject ? (
                <span className="text-xs text-muted-foreground">
                  {snapshot?.summary.staleBranches ?? 0} stale
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {focusedProject.branchCount} tracked
                </span>
              )}
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/50 rounded-xl p-4 shadow-sm">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Open Pull Requests</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">
                {visiblePullRequests.length}
              </span>
              <span className="text-[10px] font-semibold bg-secondary px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground">
                {attentionPullRequestCount > 0
                  ? `${attentionPullRequestCount} need attention`
                  : draftPullRequestCount > 0
                    ? `${draftPullRequestCount} drafts`
                    : "live on GitHub"}
              </span>
            </div>
          </div>
        </div>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold tracking-tight">System Signals</h2>
            <div className="h-px flex-1 bg-border/50 ml-2"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 relative overflow-hidden group hover:border-red-200 transition-colors shadow-sm backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="bg-white/80 dark:bg-black/20 p-1.5 rounded-lg text-red-600 shadow-sm border border-red-100/50 dark:border-red-900/30">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-700 dark:text-red-400 mb-0.5 text-sm">
                    {needsAttention?.title ?? "No urgent repository issues detected"}
                  </h3>
                  <p className="text-xs text-muted-foreground/80">
                    {needsAttention?.description ?? "Connect a workspace to surface stale branches and missing remotes here."}
                  </p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-red-500 absolute top-4 right-4 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
            </div>

            <div className="bg-secondary/30 dark:bg-secondary/10 border border-border/60 rounded-xl p-4 relative overflow-hidden group hover:border-border transition-colors shadow-sm backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="bg-white/80 dark:bg-black/20 p-1.5 rounded-lg text-foreground shadow-sm border border-border/50">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-0.5 text-sm">
                    {recentHighlight?.title ?? "Waiting for your first workspace scan"}
                  </h3>
                  <p className="text-xs text-muted-foreground/80">
                    {recentHighlight?.description ?? "Once DevDeck indexes your repositories, this panel will highlight fresh activity."}
                  </p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground absolute top-4 right-4 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
            </div>
          </div>
        </section>

        {focusedProject ? (
          <>
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold tracking-tight">Repository Snapshot</h2>
                <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-border">
                  live local data
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <GitBranch className="w-3.5 h-3.5 text-primary" />
                    Branch Context
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Current branch</span>
                      <span className="font-mono text-foreground">{focusedProject.currentBranch}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Default branch</span>
                      <span className="font-mono text-foreground">{focusedProject.defaultBranch}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Tracked branches</span>
                      <span className="font-semibold text-foreground">{focusedProject.branchCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Collaboration Pulse
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Contributors (7d)</span>
                      <span className="font-semibold text-foreground">{focusedProject.contributorCount7d}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Open pull requests</span>
                      <span className="font-semibold text-foreground">{focusedProjectPullRequests.length}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Awaiting first review</span>
                      <span className="font-semibold text-foreground">
                        {focusedProjectPullRequests.filter(
                          (pullRequest) =>
                            (pullRequest.reviewState ?? "unreviewed") === "unreviewed",
                        ).length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Reviewed by you</span>
                      <span className="font-semibold text-foreground">
                        {focusedProjectPullRequests.filter(
                          (pullRequest) => pullRequest.reviewedByViewer,
                        ).length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock3 className="w-3.5 h-3.5 text-primary" />
                    Repository Wiring
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Language</span>
                      <span className="font-semibold text-foreground">{focusedProject.language}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Remote</span>
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        {focusedProject.remoteUrl ? <Globe className="w-3.5 h-3.5 text-chart-1" /> : <Link2Off className="w-3.5 h-3.5 text-chart-3" />}
                        {focusedProject.remoteUrl ? "Configured" : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Last updated</span>
                      <span className="font-semibold text-foreground">
                        {formatDistanceToNow(new Date(focusedProject.lastUpdated), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold tracking-tight">Recent Local Activity</h2>
                  </div>

                  <div className="space-y-3">
                    {focusedActivityPagination.paginatedItems.map((activity) => (
                      <div key={activity.id} className="rounded-lg border border-border/60 p-3 bg-secondary/20">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-medium text-foreground">{activity.title}</p>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                      </div>
                    ))}
                    {focusedProjectActivities.length === 0 && (
                      <div className="rounded-lg border border-border/60 border-dashed p-4 text-sm text-muted-foreground">
                        No recent local activity was detected for this repository.
                      </div>
                    )}
                  </div>
                  <PaginationControls
                    currentPage={focusedActivityPagination.currentPage}
                    onPageChange={focusedActivityPagination.setCurrentPage}
                    pageSize={focusedActivityPagination.pageSize}
                    totalItems={focusedActivityPagination.totalItems}
                    label="activity items"
                  />
                </div>

                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold tracking-tight">Open Pull Requests</h2>
                  </div>

                  <div className="space-y-3">
                    {focusedPullRequestsPagination.paginatedItems.map((pullRequest) => {
                      const reviewSummary = getPullRequestReviewSummary(pullRequest);

                      return (
                        <div key={pullRequest.id} className="rounded-lg border border-border/60 p-3 bg-secondary/20">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              #{pullRequest.number} {pullRequest.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {pullRequest.headBranch} into {pullRequest.baseBranch}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${
                              pullRequestStatusClasses[pullRequest.status]
                            }`}>
                              {pullRequestStatusLabels[pullRequest.status]}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${
                              reviewSummary.className
                            }`}>
                              {reviewSummary.label}
                            </span>
                            {pullRequest.authoredByViewer && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap bg-secondary text-muted-foreground border-border/60">
                                you opened
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleOpenPullRequest(pullRequest.url)}
                              className="h-8 px-2.5 rounded-md text-[11px] font-medium bg-white border border-border/60 hover:bg-black/5 transition-colors"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-3 text-[11px] text-muted-foreground">
                          <span>{pullRequest.authoredByViewer ? "Opened by you" : pullRequest.author ?? "Unknown author"}</span>
                          <span>{formatDistanceToNow(new Date(pullRequest.updatedAt), { addSuffix: true })}</span>
                        </div>
                      </div>
                      );
                    })}
                    {focusedProjectPullRequests.length === 0 && (
                      <div className="rounded-lg border border-border/60 border-dashed p-4 text-sm text-muted-foreground">
                        No open GitHub pull requests were found for this repository.
                      </div>
                    )}
                  </div>
                  <PaginationControls
                    currentPage={focusedPullRequestsPagination.currentPage}
                    onPageChange={focusedPullRequestsPagination.setCurrentPage}
                    pageSize={focusedPullRequestsPagination.pageSize}
                    totalItems={focusedPullRequestsPagination.totalItems}
                    label="pull requests"
                  />
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">Pull Request Radar</h2>
                  <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-border">
                    {visiblePullRequests.length}
                  </span>
                </div>
                <Link href="/reviews">
                  <a className="text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1.5">
                    Open PR Inbox
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Awaiting First Review
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-chart-2">
                      {unreviewedPullRequestCount}
                    </span>
                    <span className="text-xs text-muted-foreground">no reviewer yet</span>
                  </div>
                </div>
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Reviewed By You
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-chart-1">
                      {reviewedByViewerCount}
                    </span>
                    <span className="text-xs text-muted-foreground">follow-up candidates</span>
                  </div>
                </div>
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Team Reviewed
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight">
                      {reviewedByOthersCount}
                    </span>
                    <span className="text-xs text-muted-foreground">already touched</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                <div className="space-y-3">
                  {overviewPullRequestsPagination.paginatedItems.map((pullRequest) => {
                    const reviewSummary = getPullRequestReviewSummary(pullRequest);

                    return (
                      <div key={pullRequest.id} className="rounded-lg border border-border/60 p-3 bg-secondary/20">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              #{pullRequest.number} {pullRequest.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {pullRequest.repo} · {pullRequest.headBranch} into {pullRequest.baseBranch}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${
                              pullRequestStatusClasses[pullRequest.status]
                            }`}>
                              {pullRequestStatusLabels[pullRequest.status]}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${
                              reviewSummary.className
                            }`}>
                              {reviewSummary.label}
                            </span>
                            {pullRequest.authoredByViewer && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap bg-secondary text-muted-foreground border-border/60">
                                you opened
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleOpenPullRequest(pullRequest.url)}
                              className="h-8 px-2.5 rounded-md text-[11px] font-medium bg-white border border-border/60 hover:bg-black/5 transition-colors"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-3 text-[11px] text-muted-foreground">
                          <span>{pullRequest.authoredByViewer ? "Opened by you" : pullRequest.author ?? "Unknown author"}</span>
                          <span>{formatDistanceToNow(new Date(pullRequest.updatedAt), { addSuffix: true })}</span>
                        </div>
                      </div>
                    );
                  })}
                  {visiblePullRequests.length === 0 && (
                    <div className="rounded-lg border border-border/60 border-dashed p-4 text-sm text-muted-foreground">
                      No open GitHub pull requests were found for the monitored repositories.
                    </div>
                  )}
                </div>
                <PaginationControls
                  currentPage={overviewPullRequestsPagination.currentPage}
                  onPageChange={overviewPullRequestsPagination.setCurrentPage}
                  pageSize={overviewPullRequestsPagination.pageSize}
                  totalItems={overviewPullRequestsPagination.totalItems}
                  label="pull requests"
                />
              </div>
            </section>

            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">Active Projects</h2>
                  <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-border">
                    {filteredProjects.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1 flex-shrink-0" />
                  {teams.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => setFilterTeam(team)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-all border ${filterTeam === team ? "bg-foreground text-background border-foreground shadow-sm" : "bg-white text-muted-foreground hover:text-foreground border-border hover:border-black/20"}`}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-12 bg-white border border-border/50 rounded-xl mt-4 text-sm text-muted-foreground">
                  Scanning your workspace...
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeProjectsPagination.paginatedItems.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-border/60 rounded-xl px-4 py-1 shadow-sm overflow-hidden">
                  <div className="hidden md:grid grid-cols-12 gap-4 py-2.5 border-b border-border/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-4 lg:col-span-3 ml-5">Repository</div>
                    <div className="col-span-3 lg:col-span-2">Branches</div>
                    <div className="col-span-2 lg:col-span-2">Contributors</div>
                    <div className="hidden lg:block col-span-3">Remote</div>
                    <div className="col-span-3 lg:col-span-2 text-right">Last Updated</div>
                  </div>
                  <div className="flex flex-col">
                    {activeProjectsPagination.paginatedItems.map((project) => (
                      <ProjectRow key={project.id} project={project} />
                    ))}
                  </div>
                </div>
              )}

              <PaginationControls
                currentPage={activeProjectsPagination.currentPage}
                onPageChange={activeProjectsPagination.setCurrentPage}
                pageSize={activeProjectsPagination.pageSize}
                totalItems={activeProjectsPagination.totalItems}
                label="projects"
              />

              {filteredProjects.length === 0 && !isLoading && (
                <div className="text-center py-12 bg-white border border-border/50 border-dashed rounded-xl mt-4">
                  <p className="text-muted-foreground text-sm">
                    {projects.length === 0
                      ? "No repositories have been indexed yet. Pick a workspace in onboarding or settings."
                      : `No projects found for ${filterTeam}.`}
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
