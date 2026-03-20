import { Suspense, lazy, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectRow from "@/components/dashboard/ProjectRow";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { usePullRequestWatchlist } from "@/hooks/use-pull-request-watchlist";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import {
  getMarkedPullRequestIds,
  setPullRequestMarkedForReview,
} from "@/lib/pull-request-watchlist";
import { getCiStatusMeta } from "@/lib/project-health";
import {
  getPullRequestSignalBadges,
  pullRequestNeedsAuthorFollowUp,
  pullRequestNeedsViewerReview,
} from "@/lib/pull-request-utils";
import { formatDistanceToNow } from "date-fns";
import { Link, useSearch } from "wouter";
import {
  Activity,
  ArrowUpRight,
  Bookmark,
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
} from "lucide-react";

const PullRequestDetailDialog = lazy(
  () => import("@/components/pull-requests/PullRequestDetailDialog"),
);

export default function Dashboard() {
  const [viewMode, setViewMode] = usePersistentState<"grid" | "list">(
    "devdeck:dashboard:view-mode",
    "grid",
  );
  const [filterTeam, setFilterTeam] = usePersistentState<string | "All">(
    "devdeck:dashboard:filter-team",
    "All",
  );
  const [selectedPullRequestId, setSelectedPullRequestId] = useState<string | null>(null);
  const search = useSearch();
  const focusedProjectId = new URLSearchParams(search).get("project");
  const workspaceSelection = useWorkspaceSelection();
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();
  const pullRequestWatchlist = usePullRequestWatchlist();

  const projects = snapshot?.projects ?? [];
  const pullRequests = snapshot?.pullRequests ?? [];
  const focusedProject = projects.find((project) => project.id === focusedProjectId) ?? null;
  const visibleProjects = focusedProject ? [focusedProject] : projects;
  const visiblePullRequests = focusedProject
    ? pullRequests.filter((pullRequest) => pullRequest.projectId === focusedProject.id)
    : pullRequests;
  const markedPullRequestIds = useMemo(
    () => getMarkedPullRequestIds(pullRequestWatchlist),
    [pullRequestWatchlist],
  );
  const selectedPullRequest =
    visiblePullRequests.find((pullRequest) => pullRequest.id === selectedPullRequestId) ??
    null;
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
  const focusedProjectHasBranchOnlyActivity = focusedProjectActivities.some(
    (activity) => activity.commitIntegrationStatus === "not_in_default_branch",
  );
  const focusedProjectPullRequests = focusedProject ? visiblePullRequests : [];
  const activeProjectsPageSize = viewMode === "grid" ? 6 : 8;
  const draftPullRequestCount = visiblePullRequests.filter(
    (pullRequest) => pullRequest.status === "draft",
  ).length;
  const attentionPullRequestCount = visiblePullRequests.filter(
    (pullRequest) =>
      pullRequestNeedsViewerReview(pullRequest) ||
      pullRequestNeedsAuthorFollowUp(pullRequest),
  ).length;
  const unreviewedPullRequestCount = visiblePullRequests.filter(
    (pullRequest) => (pullRequest.reviewState ?? "unreviewed") === "unreviewed",
  ).length;
  const needsViewerReviewCount = visiblePullRequests.filter(
    pullRequestNeedsViewerReview,
  ).length;
  const needsAuthorFollowUpCount = visiblePullRequests.filter(
    pullRequestNeedsAuthorFollowUp,
  ).length;
  const reviewedByViewerCount = visiblePullRequests.filter(
    (pullRequest) => pullRequest.reviewedByViewer,
  ).length;
  const markedPullRequestCount = visiblePullRequests.filter((pullRequest) =>
    markedPullRequestIds.has(pullRequest.id),
  ).length;
  const reviewedByOthersCount = visiblePullRequests.filter(
    (pullRequest) => (pullRequest.reviewedByOthersCount ?? 0) > 0,
  ).length;
  const workspaceLabel = workspaceSelection?.rootPath ?? workspaceSelection?.rootName ?? "~/Developer";
  const overviewPullRequestsPagination = usePagination(
    visiblePullRequests,
    6,
    {
      resetKey: focusedProjectId ?? "workspace",
      storageKey: `devdeck:dashboard:overview-prs:${focusedProjectId ?? "workspace"}`,
    },
  );
  const activeProjectsPagination = usePagination(
    filteredProjects,
    activeProjectsPageSize,
    {
      resetKey: `${focusedProjectId ?? "workspace"}:${filterTeam}:${viewMode}`,
      storageKey: `devdeck:dashboard:projects:${viewMode}:${filterTeam}`,
    },
  );
  const focusedActivityPagination = usePagination(
    focusedProjectActivities,
    4,
    {
      resetKey: focusedProjectId,
      storageKey: `devdeck:dashboard:activity:${focusedProjectId ?? "workspace"}`,
    },
  );
  const focusedPullRequestsPagination = usePagination(
    focusedProjectPullRequests,
    4,
    {
      resetKey: focusedProjectId,
      storageKey: `devdeck:dashboard:pull-requests:${focusedProjectId ?? "workspace"}`,
    },
  );

  const handleOpenPullRequest = async (targetUrl: string) => {
    const desktopApi = getDesktopApi();
    if (desktopApi) {
      await desktopApi.openExternal(targetUrl);
      return;
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const handleToggleMarkedPullRequest = (pullRequestId: string) => {
    setPullRequestMarkedForReview(
      pullRequestId,
      !markedPullRequestIds.has(pullRequestId),
    );
  };

  return (
    <AppLayout>
      <>
        <div className="min-w-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
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

          <div className="flex flex-wrap items-center gap-2">
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
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Current branch</span>
                      <span className="min-w-0 break-all text-right font-mono text-foreground">{focusedProject.currentBranch}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Default branch</span>
                      <span className="min-w-0 break-all text-right font-mono text-foreground">{focusedProject.defaultBranch}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Tracked branches</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">{focusedProject.branchCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Collaboration Pulse
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Contributors (7d)</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">{focusedProject.contributorCount7d}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Open pull requests</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">{focusedProjectPullRequests.length}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Marked by you</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">
                        {focusedProjectPullRequests.filter((pullRequest) =>
                          markedPullRequestIds.has(pullRequest.id),
                        ).length}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Needs your review</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">
                        {focusedProjectPullRequests.filter(
                          pullRequestNeedsViewerReview,
                        ).length}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Needs your follow-up</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">
                        {focusedProjectPullRequests.filter(
                          pullRequestNeedsAuthorFollowUp,
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
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Default branch checks</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        getCiStatusMeta(focusedProject.ciStatus).className
                      }`}>
                        {getCiStatusMeta(focusedProject.ciStatus).label}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Language</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">{focusedProject.language}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Branch sync</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">
                        {focusedProject.hasUpstream
                          ? `${focusedProject.aheadBy} ahead · ${focusedProject.behindBy} behind`
                          : "No upstream"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Remote</span>
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-right text-foreground">
                        {focusedProject.remoteUrl ? <Globe className="w-3.5 h-3.5 text-chart-1" /> : <Link2Off className="w-3.5 h-3.5 text-chart-3" />}
                        {focusedProject.remoteUrl ? "Configured" : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Last updated</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">
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
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-semibold tracking-tight">Recent Local Activity</h2>
                    </div>
                    {focusedProjectHasBranchOnlyActivity ? (
                      <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        <span className="h-0.5 w-4 rounded-full bg-chart-2" />
                        {focusedProject.defaultBranch === "main"
                          ? "Not in main"
                          : `Not in ${focusedProject.defaultBranch}`}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {focusedActivityPagination.paginatedItems.map((activity) => {
                      const shortCommitSha = activity.commitSha?.slice(0, 7) ?? null;
                      const hasBranchOnlyCommit =
                        activity.commitIntegrationStatus === "not_in_default_branch";

                      return (
                        <div
                          key={activity.id}
                          className={`relative overflow-hidden rounded-lg border border-border/60 p-3 ${
                            hasBranchOnlyCommit ? "bg-chart-2/5" : "bg-secondary/20"
                          }`}
                        >
                          {hasBranchOnlyCommit ? (
                            <div
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-1.5 rounded-l-lg bg-chart-2"
                            />
                          ) : null}
                          <div className={hasBranchOnlyCommit ? "pl-1" : ""}>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <p className="min-w-0 text-sm font-medium text-foreground break-words">{activity.title}</p>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{activity.description}</p>
                            {shortCommitSha && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-border/60 bg-white px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {shortCommitSha}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                      const markedForReview = markedPullRequestIds.has(pullRequest.id);
                      const signalBadges = getPullRequestSignalBadges(
                        pullRequest,
                        markedForReview,
                      );

                      return (
                        <div
                          key={pullRequest.id}
                          className="rounded-lg border border-border/60 p-3 bg-secondary/20 cursor-pointer hover:border-black/15 transition-colors"
                          onClick={() => setSelectedPullRequestId(pullRequest.id)}
                        >
                        <div className="flex flex-col gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground break-words">
                              #{pullRequest.number} {pullRequest.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {pullRequest.headBranch} into {pullRequest.baseBranch}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {signalBadges.map((badge) => (
                              <span
                                key={badge.label}
                                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenPullRequest(pullRequest.url);
                              }}
                              className="h-8 px-2.5 rounded-md text-[11px] font-medium bg-white border border-border/60 hover:bg-black/5 transition-colors"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleMarkedPullRequest(pullRequest.id);
                              }}
                              className={`h-8 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                                markedForReview
                                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                                  : "border-border/60 bg-white text-foreground hover:bg-black/5"
                              }`}
                            >
                              {markedForReview ? "Marked" : "Mark"}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
                          <span className="min-w-0 break-words">{pullRequest.authoredByViewer ? "Opened by you" : pullRequest.author ?? "Unknown author"}</span>
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

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Needs Your Review
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-chart-2">
                      {needsViewerReviewCount}
                    </span>
                    <span className="text-xs text-muted-foreground">review queue</span>
                  </div>
                </div>
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Needs Your Follow-Up
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-chart-3">
                      {needsAuthorFollowUpCount}
                    </span>
                    <span className="text-xs text-muted-foreground">author action</span>
                  </div>
                </div>
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Marked For Review
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-primary">
                      {markedPullRequestCount}
                    </span>
                    <span className="text-xs text-muted-foreground">your shortlist</span>
                  </div>
                </div>
                <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Reviewed By You
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight">
                      {reviewedByViewerCount}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {reviewedByOthersCount} touched by teammates
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                <div className="space-y-3">
                    {overviewPullRequestsPagination.paginatedItems.map((pullRequest) => {
                      const markedForReview = markedPullRequestIds.has(pullRequest.id);
                      const signalBadges = getPullRequestSignalBadges(
                        pullRequest,
                        markedForReview,
                      );

                      return (
                      <div
                        key={pullRequest.id}
                        className="rounded-lg border border-border/60 p-3 bg-secondary/20 cursor-pointer hover:border-black/15 transition-colors"
                        onClick={() => setSelectedPullRequestId(pullRequest.id)}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground break-words">
                              #{pullRequest.number} {pullRequest.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {pullRequest.repo} · {pullRequest.headBranch} into {pullRequest.baseBranch}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {signalBadges.map((badge) => (
                              <span
                                key={badge.label}
                                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenPullRequest(pullRequest.url);
                              }}
                              className="h-8 px-2.5 rounded-md text-[11px] font-medium bg-white border border-border/60 hover:bg-black/5 transition-colors"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleMarkedPullRequest(pullRequest.id);
                              }}
                              className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                                markedForReview
                                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                                  : "border-border/60 bg-white text-foreground hover:bg-black/5"
                              }`}
                            >
                              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
                              {markedForReview ? "Marked" : "Mark"}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
                          <span className="min-w-0 break-words">{pullRequest.authoredByViewer ? "Opened by you" : pullRequest.author ?? "Unknown author"}</span>
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
                <div className="overflow-hidden rounded-xl border border-border/60 bg-white px-4 py-1 shadow-sm">
                  <div className="overflow-x-auto">
                    <div className="min-w-[820px]">
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
        {selectedPullRequest ? (
          <Suspense fallback={null}>
            <PullRequestDetailDialog
              open={Boolean(selectedPullRequest)}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedPullRequestId(null);
                }
              }}
              pullRequest={selectedPullRequest}
            />
          </Suspense>
        ) : null}
      </>
    </AppLayout>
  );
}
