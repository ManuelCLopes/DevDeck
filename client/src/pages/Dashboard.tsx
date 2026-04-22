import { Suspense, lazy, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectRow from "@/components/dashboard/ProjectRow";
import PullRequestQueueControl from "@/components/pull-requests/PullRequestQueueControl";
import {
  PullRequestCiStatusIcon,
  PullRequestListStatusIcon,
} from "@/components/pull-requests/PullRequestStatusIndicators";
import SessionLaunchButton from "@/components/sessions/SessionLaunchButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { toast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { navigateInApp } from "@/lib/app-navigation";
import { getDesktopApi } from "@/lib/desktop";
import {
  buildCreateSessionPath,
  DEV_SESSIONS_STORAGE_KEY,
  findPullRequestDevSession,
  normalizeDevSessions,
} from "@/lib/dev-sessions";
import { setPullRequestClaimed } from "@/lib/pull-request-actions";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import { getCiStatusMeta } from "@/lib/project-health";
import {
  filterPullRequestsByDependabotVisibility,
  getAuthoredPullRequestStatusMeta,
  getPullRequestQueueStatus,
  pullRequestHasNoReviews,
  pullRequestNeedsFollowUp,
  pullRequestNeedsViewerReview,
  SHOW_DEPENDABOT_PULL_REQUESTS_STORAGE_KEY,
} from "@/lib/pull-request-utils";
import { formatDistanceToNow } from "date-fns";
import type { WorkspacePullRequestItem } from "@shared/workspace";
import { Link, useLocation, useSearch } from "wouter";
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  Clock3,
  Filter,
  FolderGit2,
  GitBranch,
  Github,
  Globe,
  HardDrive,
  LayoutGrid,
  Link2Off,
  List,
  MessageSquare,
  Users,
  X,
} from "lucide-react";

const PullRequestDetailDialog = lazy(
  () => import("@/components/pull-requests/PullRequestDetailDialog"),
);

type DashboardIndicatorDialogId =
  | "needs_review"
  | "needs_follow_up"
  | "claimed_by_you";

export default function Dashboard() {
  const formatCount = (value: number) => new Intl.NumberFormat().format(value);
  const [, setLocation] = useLocation();
  const [showDependabotPullRequests, setShowDependabotPullRequests] =
    usePersistentState<boolean>(SHOW_DEPENDABOT_PULL_REQUESTS_STORAGE_KEY, true);
  const [viewMode, setViewMode] = usePersistentState<"grid" | "list">(
    "devdeck:dashboard:view-mode",
    "grid",
  );
  const [filterTeam, setFilterTeam] = usePersistentState<string | "All">(
    "devdeck:dashboard:filter-team",
    "All",
  );
  const [selectedPullRequestId, setSelectedPullRequestId] = useState<string | null>(null);
  const [activeIndicatorDialog, setActiveIndicatorDialog] =
    useState<DashboardIndicatorDialogId | null>(null);
  const [selectedOverviewRepoFilters, setSelectedOverviewRepoFilters] =
    usePersistentState<string[]>("devdeck:dashboard:overview-repo-filters", []);
  const [devSessions] = usePersistentState(DEV_SESSIONS_STORAGE_KEY, [], {
    deserialize: (value) => normalizeDevSessions(JSON.parse(value)),
  });
  const search = useSearch();
  const focusedProjectId = new URLSearchParams(search).get("project");
  const workspaceSelection = useWorkspaceSelection();
  const { data: snapshot, isLoading } = useWorkspaceSnapshot();

  const projects = snapshot?.projects ?? [];
  const allPullRequests = snapshot?.pullRequests ?? [];
  const pullRequests = useMemo(
    () =>
      filterPullRequestsByDependabotVisibility(
        allPullRequests,
        showDependabotPullRequests,
      ),
    [allPullRequests, showDependabotPullRequests],
  );
  const authoredPullRequests = snapshot?.authoredPullRequests ?? [];
  const focusedProject = projects.find((project) => project.id === focusedProjectId) ?? null;
  const visibleProjects = focusedProject ? [focusedProject] : projects;
  const visiblePullRequests = focusedProject
    ? pullRequests.filter((pullRequest) => pullRequest.projectId === focusedProject.id)
    : pullRequests;
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

  const reposWithoutRemoteCount = visibleProjects.filter(
    (project) => !project.remoteUrl,
  ).length;
  const focusedProjectActivities = focusedProject
    ? (snapshot?.activities ?? []).filter((activity) => activity.repo === focusedProject.name)
    : [];
  const focusedProjectHasBranchOnlyActivity = focusedProjectActivities.some(
    (activity) => activity.commitIntegrationStatus === "not_in_default_branch",
  );
  const focusedProjectPullRequests = focusedProject ? visiblePullRequests : [];
  const activeProjectsPageSize = viewMode === "grid" ? 6 : 8;
  const needsViewerReviewCount = visiblePullRequests.filter(
    pullRequestNeedsViewerReview,
  ).length;
  const needsReviewPullRequests = useMemo(
    () => visiblePullRequests.filter(pullRequestNeedsViewerReview),
    [visiblePullRequests],
  );
  const needsFollowUpPullRequests = useMemo(
    () => visiblePullRequests.filter(pullRequestNeedsFollowUp),
    [visiblePullRequests],
  );
  const claimedPullRequests = useMemo(
    () =>
      visiblePullRequests.filter((pullRequest) =>
        getPullRequestQueueStatus(pullRequest) === "claimed",
      ),
    [visiblePullRequests],
  );
  const needsFollowUpCount = needsFollowUpPullRequests.length;
  const claimedPullRequestCount = claimedPullRequests.length;
  const workspaceLabel = workspaceSelection?.rootPath ?? workspaceSelection?.rootName ?? "~/Developer";
  const overviewRepoFilteredPullRequests = useMemo(
    () =>
      selectedOverviewRepoFilters.length === 0
        ? visiblePullRequests
        : visiblePullRequests.filter((pullRequest) =>
            selectedOverviewRepoFilters.includes(pullRequest.repo),
          ),
    [selectedOverviewRepoFilters, visiblePullRequests],
  );
  const overviewPullRequestsPagination = usePagination(
    overviewRepoFilteredPullRequests,
    6,
    {
      resetKey: `${focusedProjectId ?? "workspace"}:${selectedOverviewRepoFilters.join("|")}`,
      storageKey: `devdeck:dashboard:overview-prs:${focusedProjectId ?? "workspace"}`,
    },
  );
  const authoredPullRequestsPagination = usePagination(
    authoredPullRequests,
    5,
    {
      resetKey: focusedProjectId ?? "workspace",
      storageKey: "devdeck:dashboard:authored-prs",
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

  const handleSetPullRequestClaimed = async (
    pullRequest: Pick<
      WorkspacePullRequestItem,
      "claim" | "number" | "repo" | "repositorySlug"
    >,
    claimed: boolean,
  ) => {
    await setPullRequestClaimed(pullRequest, claimed);
    toast({
      title: claimed ? "Review claimed" : "Claim removed",
      description: claimed
        ? `${pullRequest.repo} #${pullRequest.number} is now claimed for review.`
        : `${pullRequest.repo} #${pullRequest.number} is no longer claimed by you.`,
    });
  };

  const addOverviewRepoFilter = (repo: string) => {
    setSelectedOverviewRepoFilters((current) =>
      current.includes(repo) ? current : [...current, repo],
    );
  };

  const removeOverviewRepoFilter = (repo: string) => {
    setSelectedOverviewRepoFilters((current) =>
      current.filter((item) => item !== repo),
    );
  };

  const activeIndicatorDialogConfig = useMemo(() => {
    if (!activeIndicatorDialog) {
      return null;
    }

    const dialogById: Record<
      DashboardIndicatorDialogId,
      {
        description: string;
        emptyMessage: string;
        pullRequests: WorkspacePullRequestItem[];
        title: string;
      }
    > = {
      claimed_by_you: {
        description: "Pull requests you claimed so the team can see you are taking them.",
        emptyMessage: "You have not claimed any pull requests yet.",
        pullRequests: claimedPullRequests,
        title: "Claimed By You",
      },
      needs_follow_up: {
        description:
          "Pull requests you reviewed that changed afterward and now need another pass.",
        emptyMessage: "Nothing currently needs your follow-up.",
        pullRequests: needsFollowUpPullRequests,
        title: "Needs Your Follow-Up",
      },
      needs_review: {
        description: "Pull requests currently waiting for your review in this workspace.",
        emptyMessage: "Nothing currently needs your review.",
        pullRequests: needsReviewPullRequests,
        title: "Needs Review",
      },
    };

    return dialogById[activeIndicatorDialog];
  }, [activeIndicatorDialog, claimedPullRequests, needsFollowUpPullRequests, needsReviewPullRequests]);

  const handleInspectIndicatorPullRequest = (pullRequestId: string) => {
    setActiveIndicatorDialog(null);
    setSelectedPullRequestId(pullRequestId);
  };

  return (
    <AppLayout>
      <>
        <div className="min-w-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">
              {focusedProject ? `${focusedProject.name} Overview` : "Repository Overview"}
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
                  All Repositories
                </a>
              </Link>
            )}
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
                      <span className="text-muted-foreground">In your queue</span>
                      <span className="min-w-0 text-right font-semibold text-foreground">
                        {focusedProjectPullRequests.filter(
                          (pullRequest) => getPullRequestQueueStatus(pullRequest) !== null,
                        ).length}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-muted-foreground">Needs review</span>
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
                          pullRequestNeedsFollowUp,
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
                            <div className="flex flex-col gap-1">
                              <p className="min-w-0 text-sm font-medium text-foreground break-words">{activity.title}</p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{activity.description}</p>
                            <div className="mt-3 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                              <div className="flex flex-wrap items-center gap-2">
                                {shortCommitSha && (
                                  <span className="inline-flex items-center rounded-full border border-border/60 bg-white px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    {shortCommitSha}
                                  </span>
                                )}
                              </div>
                              <span className="whitespace-nowrap text-right">
                                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                              </span>
                            </div>
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
                      const queueStatus = getPullRequestQueueStatus(pullRequest);
                      const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                      return (
                        <div
                          key={pullRequest.id}
                          className="relative overflow-hidden rounded-lg border border-border/60 p-3 bg-secondary/20 cursor-pointer hover:border-black/15 transition-colors"
                          onClick={() => setSelectedPullRequestId(pullRequest.id)}
                        >
                        {hasNoReviews ? (
                          <div
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1.5 bg-muted-foreground/30"
                          />
                        ) : null}
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-5 text-foreground break-words">
                                #{pullRequest.number} {pullRequest.title}
                                <PullRequestCiStatusIcon
                                  className="ml-1 align-[-0.125em]"
                                  status={pullRequest.ciStatus}
                                />
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {pullRequest.headBranch} into {pullRequest.baseBranch}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 self-start">
                              <div onClick={(event) => event.stopPropagation()}>
                                <PullRequestQueueControl
                                  claimedReviewerLogin={
                                    pullRequest.claimedByViewer
                                      ? null
                                      : pullRequest.claim?.reviewerLogin ?? null
                                  }
                                  onClaimChange={
                                    queueStatus === "claimed" || queueStatus === null
                                      ? (claimed) =>
                                          void handleSetPullRequestClaimed(
                                            pullRequest,
                                            claimed,
                                          )
                                      : undefined
                                  }
                                  status={queueStatus}
                                />
                              </div>
                              <SessionLaunchButton
                                className="h-8 w-8"
                                createPath={buildCreateSessionPath(
                                  pullRequest.projectId,
                                  pullRequest.id,
                                )}
                                existingSession={findPullRequestDevSession(
                                  devSessions,
                                  pullRequest.id,
                                )}
                                iconOnly
                                onNavigate={(path) => navigateInApp(path, setLocation)}
                                size="icon"
                                variant="outline"
                              />
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleOpenPullRequest(pullRequest.url);
                                }}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-white px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                              >
                                <Github className="h-3.5 w-3.5" />
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                          <span className="min-w-0 break-words">
                            {pullRequest.authoredByViewer
                              ? "Opened by you"
                              : pullRequest.author ?? "Unknown author"}
                          </span>
                          <span className="whitespace-nowrap text-right">
                            {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="relative overflow-hidden rounded-xl border border-border/50 bg-white/60 p-4 shadow-sm backdrop-blur-md">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Monitored Repos
                  </h3>
                  <span className="rounded-full border border-border/60 bg-secondary/50 px-2.5 py-1 text-sm font-semibold tabular-nums text-foreground/85">
                    {formatCount(visibleProjects.length)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reposWithoutRemoteCount > 0
                    ? `${reposWithoutRemoteCount} without remote`
                    : "all with origin remote"}
                </p>
                <div className="absolute -right-4 -bottom-4 opacity-5">
                  <FolderGit2 className="w-24 h-24" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveIndicatorDialog("needs_review")}
                className="rounded-xl border border-border/50 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Needs Review
                  </h3>
                  <span className="rounded-full border border-chart-2/20 bg-chart-2/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-chart-2">
                    {formatCount(needsViewerReviewCount)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">review queue</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveIndicatorDialog("needs_follow_up")}
                className="rounded-xl border border-border/50 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Needs Your Follow-Up
                  </h3>
                  <span className="rounded-full border border-chart-3/20 bg-chart-3/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-chart-3">
                    {formatCount(needsFollowUpCount)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">updated since review</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveIndicatorDialog("claimed_by_you")}
                className="rounded-xl border border-border/50 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Claimed By You
                  </h3>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-primary">
                    {formatCount(claimedPullRequestCount)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">team-visible ownership</p>
              </button>
            </div>

            <section>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Link href="/reviews">
                    <a className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary">
                      Pull Request Radar
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  </Link>
                  <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-border">
                    {overviewRepoFilteredPullRequests.length}
                  </span>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {selectedOverviewRepoFilters.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedOverviewRepoFilters.map((repo) => (
                      <button
                        key={repo}
                        type="button"
                        onClick={() => removeOverviewRepoFilter(repo)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${getProjectTagClassName(repo)}`}
                      >
                        <span>{repo}</span>
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="ml-auto inline-flex items-center text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setShowDependabotPullRequests((current) => !current)}
                    className="font-medium text-muted-foreground/80 transition-colors hover:text-foreground hover:underline"
                  >
                    {showDependabotPullRequests
                      ? "Hide Dependabot PRs"
                      : "Show Dependabot PRs"}
                  </button>
                </div>
              </div>

              <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
                <div className="space-y-3">
                    {overviewPullRequestsPagination.paginatedItems.map((pullRequest) => {
                      const queueStatus = getPullRequestQueueStatus(pullRequest);
                      const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                      return (
                      <div
                        key={pullRequest.id}
                        className="relative overflow-hidden rounded-lg border border-border/60 p-3 bg-secondary/20 cursor-pointer hover:border-black/15 transition-colors"
                        onClick={() => setSelectedPullRequestId(pullRequest.id)}
                      >
                        {hasNoReviews ? (
                          <div
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1.5 bg-muted-foreground/30"
                          />
                        ) : null}
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-5 text-foreground break-words">
                                #{pullRequest.number} {pullRequest.title}
                                <PullRequestCiStatusIcon
                                  className="ml-1 align-[-0.125em]"
                                  status={pullRequest.ciStatus}
                                />
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    addOverviewRepoFilter(pullRequest.repo);
                                  }}
                                  className={getProjectTagClassName(pullRequest.repo)}
                                >
                                  {pullRequest.repo}
                                </button>
                                <span className="break-words">
                                  {pullRequest.headBranch} into {pullRequest.baseBranch}
                                </span>
                              </div>
                            </div>
                            <div className="inline-flex flex-shrink-0 flex-nowrap items-center gap-2 self-start">
                              <div onClick={(event) => event.stopPropagation()}>
                                <PullRequestQueueControl
                                  claimedReviewerLogin={
                                    pullRequest.claimedByViewer
                                      ? null
                                      : pullRequest.claim?.reviewerLogin ?? null
                                  }
                                  onClaimChange={
                                    queueStatus === "claimed" || queueStatus === null
                                      ? (claimed) =>
                                          void handleSetPullRequestClaimed(
                                            pullRequest,
                                            claimed,
                                          )
                                      : undefined
                                  }
                                  status={queueStatus}
                                />
                              </div>
                              <SessionLaunchButton
                                className="h-8 w-8"
                                createPath={buildCreateSessionPath(
                                  pullRequest.projectId,
                                  pullRequest.id,
                                )}
                                existingSession={findPullRequestDevSession(
                                  devSessions,
                                  pullRequest.id,
                                )}
                                iconOnly
                                onNavigate={(path) => navigateInApp(path, setLocation)}
                                size="icon"
                                variant="outline"
                              />
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleOpenPullRequest(pullRequest.url);
                                }}
                                className="inline-flex h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-md border border-border/60 bg-white px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                              >
                                <Github className="h-3.5 w-3.5" />
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                          <span className="min-w-0 break-words">
                            {pullRequest.authoredByViewer
                              ? "Opened by you"
                              : pullRequest.author ?? "Unknown author"}
                          </span>
                          <span className="whitespace-nowrap text-right">
                            {formatDistanceToNow(new Date(pullRequest.updatedAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {overviewRepoFilteredPullRequests.length === 0 && (
                    <div className="rounded-lg border border-border/60 border-dashed p-4 text-sm text-muted-foreground">
                      {selectedOverviewRepoFilters.length > 0
                        ? "No pull requests match the selected repository filters."
                        : "No open GitHub pull requests were found for the monitored repositories."}
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
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">Your PRs</h2>
                  <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {authoredPullRequests.length}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
                <div className="space-y-3">
                  {authoredPullRequestsPagination.paginatedItems.map((pullRequest) => {
                    const statusMeta = getAuthoredPullRequestStatusMeta(pullRequest.status);

                    return (
                      <div
                        key={pullRequest.id}
                        className="rounded-lg border border-border/60 bg-secondary/20 p-3"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground break-words">
                                #{pullRequest.number} {pullRequest.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {pullRequest.repo}
                                {pullRequest.ownership === "automation" &&
                                pullRequest.author
                                  ? ` · opened by ${pullRequest.author}`
                                  : ""}
                                {" · "}
                                {pullRequest.headBranch} into {pullRequest.baseBranch}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 self-start">
                              <button
                                type="button"
                                onClick={() => void handleOpenPullRequest(pullRequest.url)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-white px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                              >
                                <Github className="h-3.5 w-3.5" />
                                View
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="rounded-full border border-border/60 bg-white px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                              {pullRequest.reviewCount} review{pullRequest.reviewCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end text-[11px] text-muted-foreground">
                          <span className="whitespace-nowrap text-right">
                            {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {authoredPullRequests.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                      No pull requests assigned to you were found in the monitored repositories.
                    </div>
                  )}
                </div>
                <PaginationControls
                  currentPage={authoredPullRequestsPagination.currentPage}
                  onPageChange={authoredPullRequestsPagination.setCurrentPage}
                  pageSize={authoredPullRequestsPagination.pageSize}
                  totalItems={authoredPullRequestsPagination.totalItems}
                  label="your pull requests"
                />
              </div>
            </section>

            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">Active Repositories</h2>
                  <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-border">
                    {filteredProjects.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="bg-secondary/40 p-0.5 rounded-md flex items-center border border-border/40 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-[4px] transition-all shadow-sm ${viewMode === "grid" ? "bg-white/80 backdrop-blur-md text-foreground border border-black/5" : "text-muted-foreground hover:text-foreground bg-transparent border-transparent"}`}
                      aria-label="Show repositories as cards"
                      title="Grid view"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-[4px] transition-all shadow-sm ${viewMode === "list" ? "bg-white/80 backdrop-blur-md text-foreground border border-black/5" : "text-muted-foreground hover:text-foreground bg-transparent border-transparent"}`}
                      aria-label="Show repositories as rows"
                      title="List view"
                    >
                      <List className="w-4 h-4" />
                    </button>
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
                label="repositories"
              />

              {filteredProjects.length === 0 && !isLoading && (
                <div className="text-center py-12 bg-white border border-border/50 border-dashed rounded-xl mt-4">
                  <p className="text-muted-foreground text-sm">
                    {projects.length === 0
                      ? "No repositories have been indexed yet. Pick a workspace in onboarding or settings."
                      : `No repositories found for ${filterTeam}.`}
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        </div>
        <Dialog
          open={Boolean(activeIndicatorDialogConfig)}
          onOpenChange={(open) => {
            if (!open) {
              setActiveIndicatorDialog(null);
            }
          }}
        >
          <DialogContent className="max-h-[min(88vh,860px)] max-w-[min(92vw,56rem)] overflow-hidden border-border/60 bg-white/95 p-0 backdrop-blur-md">
            {activeIndicatorDialogConfig ? (
              <div className="flex min-h-0 min-w-0 flex-col">
                <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6 pr-14">
                  <div className="flex items-center gap-2">
                    <DialogTitle>{activeIndicatorDialogConfig.title}</DialogTitle>
                    <span className="rounded-sm border border-border/60 bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                      {formatCount(activeIndicatorDialogConfig.pullRequests.length)}
                    </span>
                  </div>
                  <DialogDescription>
                    {activeIndicatorDialogConfig.description}
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <div className="space-y-3">
                    {activeIndicatorDialogConfig.pullRequests.map((pullRequest) => {
                      const queueStatus = getPullRequestQueueStatus(pullRequest);
                      const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                      return (
                        <div
                          key={`dashboard-indicator:${pullRequest.id}`}
                          onClick={() => handleInspectIndicatorPullRequest(pullRequest.id)}
                          className="relative overflow-hidden rounded-xl border border-border/60 bg-white p-4 transition-colors hover:bg-black/[0.02] cursor-pointer"
                        >
                          {hasNoReviews ? (
                            <div
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-1.5 bg-muted-foreground/30"
                            />
                          ) : null}
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 space-y-2">
                                <p className="text-sm font-medium leading-5 text-foreground break-words">
                                  #{pullRequest.number} {pullRequest.title}
                                    <PullRequestCiStatusIcon
                                      className="ml-1 align-[-0.125em]"
                                      status={pullRequest.ciStatus}
                                    />
                                  </p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className={getProjectTagClassName(pullRequest.repo)}>
                                    {pullRequest.repo}
                                  </span>
                                  <span className="break-words">
                                    {pullRequest.headBranch} into {pullRequest.baseBranch}
                                  </span>
                                </div>
                              </div>
                              <div
                                className="flex flex-wrap items-center gap-2 self-start"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <PullRequestQueueControl
                                  claimedReviewerLogin={
                                    pullRequest.claimedByViewer
                                      ? null
                                      : pullRequest.claim?.reviewerLogin ?? null
                                  }
                                  onClaimChange={
                                    queueStatus === "claimed" || queueStatus === null
                                      ? (claimed) =>
                                          void handleSetPullRequestClaimed(
                                            pullRequest,
                                            claimed,
                                          )
                                      : undefined
                                  }
                                  status={queueStatus}
                                />
                                <SessionLaunchButton
                                  className="h-8 w-8"
                                  createPath={buildCreateSessionPath(
                                    pullRequest.projectId,
                                    pullRequest.id,
                                  )}
                                  existingSession={findPullRequestDevSession(
                                    devSessions,
                                    pullRequest.id,
                                  )}
                                  iconOnly
                                  onNavigate={(path) => navigateInApp(path, setLocation)}
                                  size="icon"
                                  variant="outline"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleOpenPullRequest(pullRequest.url)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-white px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                                >
                                  <Github className="h-3.5 w-3.5" />
                                  View
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                              <span className="min-w-0 break-words">
                                {pullRequest.authoredByViewer
                                  ? "Opened by you"
                                  : pullRequest.author ?? "Unknown author"}
                              </span>
                              <span className="whitespace-nowrap text-right">
                                {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                                  addSuffix: true,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {activeIndicatorDialogConfig.pullRequests.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                        {activeIndicatorDialogConfig.emptyMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
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
