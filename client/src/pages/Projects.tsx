import { Suspense, lazy, useEffect, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { usePullRequestWatchlist } from "@/hooks/use-pull-request-watchlist";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import { getCiStatusMeta, getProjectAttentionMeta } from "@/lib/project-health";
import { getPullRequestWatchStatus } from "@/lib/pull-request-watchlist";
import {
  filterPullRequestsByDependabotVisibility,
  getPullRequestSignalBadges,
  pullRequestHasNoReviews,
  SHOW_DEPENDABOT_PULL_REQUESTS_STORAGE_KEY,
} from "@/lib/pull-request-utils";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  Circle,
  Copy,
  FolderGit2,
  TerminalSquare,
  Search,
  HardDrive,
  GitBranch,
  Calendar,
  Globe,
  Users,
  Link2Off,
  MessageSquare,
  X,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { WorkspaceProject } from "@shared/workspace";

const PullRequestDetailDialog = lazy(
  () => import("@/components/pull-requests/PullRequestDetailDialog"),
);

export default function Projects() {
  const [showDependabotPullRequests, setShowDependabotPullRequests] =
    usePersistentState<boolean>(SHOW_DEPENDABOT_PULL_REQUESTS_STORAGE_KEY, true);
  const [searchQuery, setSearchQuery] = usePersistentState(
    "devdeck:projects:search",
    "",
  );
  const [selectedProjectId, setSelectedProjectId] = usePersistentState<string | null>(
    "devdeck:projects:selected-project",
    null,
  );
  const [selectedPullRequestId, setSelectedPullRequestId] = usePersistentState<string | null>(
    "devdeck:projects:selected-pr",
    null,
  );
  const { data: snapshot, isLoading } = useWorkspaceSnapshot();
  const pullRequestWatchlist = usePullRequestWatchlist();
  const desktopApi = getDesktopApi();

  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return (snapshot?.projects ?? []).filter((project) =>
      [
        project.name,
        project.localPath,
        project.currentBranch,
        project.defaultBranch,
        project.language,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery, snapshot?.projects]);
  const projectsPagination = usePagination(filteredProjects, 10, {
    resetKey: searchQuery,
    storageKey: "devdeck:projects:list-pagination",
  });

  const selectedProject =
    filteredProjects.find((project) => project.id === selectedProjectId) ??
    filteredProjects[0] ??
    null;
  const selectedProjectPullRequests = useMemo(
    () =>
      selectedProject
        ? filterPullRequestsByDependabotVisibility(
            (snapshot?.pullRequests ?? []).filter(
              (pullRequest) => pullRequest.projectId === selectedProject.id,
            ),
            showDependabotPullRequests,
          )
        : [],
    [selectedProject, showDependabotPullRequests, snapshot?.pullRequests],
  );
  const selectedProjectPullRequestsPagination = usePagination(
    selectedProjectPullRequests,
    3,
    {
      resetKey: selectedProject?.id ?? null,
      storageKey: `devdeck:projects:detail-prs:${selectedProject?.id ?? "none"}`,
    },
  );
  const selectedPullRequest =
    selectedProjectPullRequests.find(
      (pullRequest) => pullRequest.id === selectedPullRequestId,
    ) ?? null;

  useEffect(() => {
    if (selectedProject) {
      setSelectedProjectId(selectedProject.id);
      return;
    }

    setSelectedProjectId(null);
  }, [selectedProject, setSelectedProjectId]);

  const openInTerminal = async (project: WorkspaceProject) => {
    await desktopApi?.openInTerminal(project.localPath);
  };

  const openInCode = async (project: WorkspaceProject) => {
    await desktopApi?.openInCode?.(project.localPath);
  };

  const revealInFinder = async (project: WorkspaceProject) => {
    await desktopApi?.showItemInFinder(project.localPath);
  };

  const openRemote = async (project: WorkspaceProject) => {
    if (!project.remoteUrl) {
      return;
    }

    await desktopApi?.openExternal(project.remoteUrl);
  };

  const copyProjectPath = async (project: WorkspaceProject) => {
    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(project.localPath);
      return;
    }

    await navigator.clipboard.writeText(project.localPath);
  };

  return (
    <AppLayout>
      <>
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1200px] flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Local Projects</h1>
            <p className="text-muted-foreground text-sm">Browse repositories and local workspaces tracked by DevDeck.</p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter repositories..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-md bg-white/60 backdrop-blur-sm border border-border/60 shadow-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none text-xs transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-white/60 backdrop-blur-md shadow-sm">
            <div className="flex-1 overflow-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-12 gap-4 border-b border-border/40 bg-secondary/30 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md">
                  <div className="col-span-5">Repository</div>
                  <div className="col-span-2">Language</div>
                  <div className="col-span-2">Attention</div>
                  <div className="col-span-3 text-right">Last Updated</div>
                </div>

                <div className="flex flex-col">
                  {projectsPagination.paginatedItems.map((project) => (
                    (() => {
                      const attentionMeta = getProjectAttentionMeta(project);

                      return (
                        <div
                          key={project.id}
                          onClick={() => setSelectedProjectId(project.id)}
                          className={`grid grid-cols-12 gap-4 px-5 py-3 border-b border-border/40 last:border-0 cursor-pointer transition-colors items-center ${selectedProject?.id === project.id ? "bg-primary/[0.04]" : "hover:bg-black/[0.02]"}`}
                        >
                          <div className="col-span-5 flex min-w-0 flex-col pr-4">
                            <span className="font-semibold text-[13px] text-foreground truncate">{project.name}</span>
                            <span className="text-[10px] text-muted-foreground truncate font-mono mt-0.5 flex items-center gap-1">
                              <HardDrive className="w-2.5 h-2.5 flex-shrink-0" />
                              {project.localPath}
                            </span>
                          </div>

                          <div className="col-span-2 text-[12px] text-muted-foreground">
                            {project.language}
                          </div>

                          <div className="col-span-2">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-sm border ${attentionMeta.className}`}>
                              <span>{attentionMeta.label}</span>
                            </span>
                          </div>

                          <div className="col-span-3 flex items-center justify-end gap-3 text-right text-[11px] text-muted-foreground">
                            <span className="whitespace-nowrap">
                              {formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      {isLoading ? "Scanning your workspace..." : `No repositories found matching "${searchQuery}"`}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-border/40 px-5 py-3">
              <PaginationControls
                currentPage={projectsPagination.currentPage}
                onPageChange={projectsPagination.setCurrentPage}
                pageSize={projectsPagination.pageSize}
                totalItems={projectsPagination.totalItems}
                label="projects"
              />
            </div>
          </div>

          {selectedProject ? (
            <div className="flex w-full min-w-0 flex-col rounded-xl border border-border/60 bg-white/60 shadow-sm backdrop-blur-md xl:w-[320px] xl:max-w-[320px] xl:flex-shrink-0 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-5 border-b border-border/40 bg-secondary/20 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg border border-primary/20">
                    <FolderGit2 className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex gap-1.5">
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            type="button"
                            onClick={() => void openInTerminal(selectedProject)}
                            className="p-1.5 bg-white/80 backdrop-blur-sm border border-border shadow-sm rounded-md text-foreground hover:bg-black/5 transition-colors"
                          >
                            <TerminalSquare className="w-4 h-4" />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="bg-foreground text-background text-[11px] px-2 py-1 rounded shadow-md" sideOffset={5}>
                            Open in Terminal
                            <Tooltip.Arrow className="fill-foreground" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  </div>
                </div>

                <h2 className="text-lg font-bold text-foreground mb-1 break-words">{selectedProject.name}</h2>
                <p className="text-[12px] text-muted-foreground mb-3 break-words">{selectedProject.description}</p>

                <div className="text-[10px] font-mono bg-white p-2 rounded-md border border-border text-muted-foreground break-all leading-tight shadow-inner">
                  {selectedProject.localPath}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Repository Info</h3>
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Pull Requests</span>
                      <span className="min-w-0 text-right text-foreground font-medium break-words">{selectedProject.openPullRequestCount} open · {selectedProject.awaitingReviewCount} waiting</span>
                    </div>
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><GitBranch className="w-3.5 h-3.5" /> Branch Sync</span>
                      <span className="min-w-0 text-right text-foreground break-words">{selectedProject.hasUpstream ? `${selectedProject.aheadBy} ahead · ${selectedProject.behindBy} behind` : "No upstream"}</span>
                    </div>
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><GitBranch className="w-3.5 h-3.5" /> Current Branch</span>
                      <span className="min-w-0 break-all bg-secondary px-1.5 py-0.5 rounded text-right font-mono text-foreground">{selectedProject.currentBranch}</span>
                    </div>
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><GitBranch className="w-3.5 h-3.5" /> Default Branch</span>
                      <span className="min-w-0 break-all bg-secondary px-1.5 py-0.5 rounded text-right font-mono text-foreground">{selectedProject.defaultBranch}</span>
                    </div>
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Last Activity</span>
                      <span className="min-w-0 text-right text-foreground break-words">{formatDistanceToNow(new Date(selectedProject.lastUpdated))} ago</span>
                    </div>
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Contributors</span>
                      <span className="min-w-0 text-right text-foreground font-medium break-words">{selectedProject.contributorCount7d} in the last 7 days</span>
                    </div>
                    <div className="flex items-start justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> CI Status</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getCiStatusMeta(selectedProject.ciStatus).className}`}>
                        {getCiStatusMeta(selectedProject.ciStatus).label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[12px] gap-3">
                      <span className="text-muted-foreground flex items-center gap-2">
                        {selectedProject.remoteUrl ? <Globe className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
                        Remote
                      </span>
                      <span className="text-foreground text-right break-all">
                        {selectedProject.remoteUrl ?? "No origin remote"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border/50 w-full"></div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Open Pull Requests</h3>
                    <span className="rounded-sm border border-border/60 bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {selectedProjectPullRequests.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedProjectPullRequestsPagination.paginatedItems.map((pullRequest) => {
                      const watchStatus = getPullRequestWatchStatus(
                        pullRequest.id,
                        pullRequestWatchlist,
                      );
                      const signalBadges = getPullRequestSignalBadges(
                        pullRequest,
                        watchStatus,
                      );
                      const visibleBadges = signalBadges.filter(
                        (badge) =>
                          badge.label === "marked" ||
                          badge.label === "reviewed",
                      );
                      const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                      const ciStatusIcon =
                        pullRequest.ciStatus === "passing" ? (
                          <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-chart-1" />
                        ) : pullRequest.ciStatus === "failing" ? (
                          <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-chart-3" />
                        ) : pullRequest.ciStatus === "pending" ? (
                          <Circle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 fill-current text-chart-2" />
                        ) : null;

                      return (
                        <button
                          key={pullRequest.id}
                          type="button"
                          onClick={() => setSelectedPullRequestId(pullRequest.id)}
                          className="relative w-full overflow-hidden rounded-lg border border-border/60 bg-secondary/20 p-3 text-left hover:border-black/15 transition-colors"
                        >
                          {hasNoReviews ? (
                            <div
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-1.5 bg-muted-foreground/30"
                            />
                          ) : null}
                          <div className="flex min-w-0 items-start gap-2">
                            <p className="text-[12px] font-semibold text-foreground line-clamp-2">
                              #{pullRequest.number} {pullRequest.title}
                            </p>
                            {ciStatusIcon}
                          </div>
                          {visibleBadges.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {visibleBadges.map((badge) => (
                                <span
                                  key={badge.label}
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {selectedProjectPullRequests.length === 0 && (
                      <div className="rounded-lg border border-border/60 border-dashed p-3 text-xs text-muted-foreground">
                        No open pull requests for this repository.
                      </div>
                    )}
                  </div>
                  <PaginationControls
                    currentPage={selectedProjectPullRequestsPagination.currentPage}
                    onPageChange={selectedProjectPullRequestsPagination.setCurrentPage}
                    pageSize={selectedProjectPullRequestsPagination.pageSize}
                    totalItems={selectedProjectPullRequestsPagination.totalItems}
                    label="pull requests"
                    className="pt-4"
                  />
                </div>

                <div className="h-px bg-border/50 w-full"></div>

                <div>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void openInTerminal(selectedProject)}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium rounded-md hover:bg-secondary transition-colors text-foreground"
                    >
                      Open in Terminal
                    </button>
                    <button
                      type="button"
                      onClick={() => void openInCode(selectedProject)}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium rounded-md hover:bg-secondary transition-colors text-foreground"
                    >
                      Open in VS Code
                    </button>
                    <button
                      type="button"
                      onClick={() => void revealInFinder(selectedProject)}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium rounded-md hover:bg-secondary transition-colors text-foreground"
                    >
                      Reveal in Finder
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyProjectPath(selectedProject)}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium rounded-md hover:bg-secondary transition-colors text-foreground flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Path
                    </button>
                    <button
                      type="button"
                      disabled={!selectedProject.remoteUrl}
                      onClick={() => void openRemote(selectedProject)}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium rounded-md hover:bg-secondary transition-colors text-foreground disabled:text-muted-foreground disabled:hover:bg-transparent"
                    >
                      Open Origin Remote
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex w-full min-w-0 items-center justify-center rounded-xl border border-border/40 border-dashed bg-secondary/30 xl:w-[320px] xl:max-w-[320px] xl:flex-shrink-0">
              <p className="text-sm text-muted-foreground font-medium">Select a project to inspect</p>
            </div>
          )}
        </div>
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
