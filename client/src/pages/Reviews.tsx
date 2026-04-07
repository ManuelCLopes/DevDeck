import AppLayout from "@/components/layout/AppLayout";
import PullRequestQueueControl from "@/components/pull-requests/PullRequestQueueControl";
import {
  PullRequestCiStatusIcon,
  PullRequestListStatusIcon,
} from "@/components/pull-requests/PullRequestStatusIndicators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { usePullRequestWatchlist } from "@/hooks/use-pull-request-watchlist";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { navigateInApp } from "@/lib/app-navigation";
import { getDesktopApi } from "@/lib/desktop";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import {
  getPullRequestQueueIds,
  getPullRequestWatchStatus,
  setPullRequestWatchStatus,
  type PullRequestWatchStatus,
} from "@/lib/pull-request-watchlist";
import {
  filterPullRequestsByDependabotVisibility,
  filterPullRequestsByFocus,
  getAuthoredPullRequestStatusMeta,
  getPullRequestSignalBadges,
  pullRequestHasNoReviews,
  pullRequestNeedsFollowUp,
  pullRequestNeedsViewerReview,
  SHOW_DEPENDABOT_PULL_REQUESTS_STORAGE_KEY,
  type PullRequestFocus,
} from "@/lib/pull-request-utils";
import { REVIEW_FOCUS_STORAGE_KEY } from "@/lib/review-focus";
import { formatDistanceToNow } from "date-fns";
import type {
  WorkspaceAuthoredPullRequestItem,
  WorkspacePullRequestItem,
} from "@shared/workspace";
import {
  CheckCircle2,
  Github,
  GitPullRequest,
  X,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

const PullRequestDetailDialog = lazy(
  () => import("@/components/pull-requests/PullRequestDetailDialog"),
);

const STALE_PULL_REQUEST_DAYS = 5;
type ReviewQueueFocus = "all" | PullRequestWatchStatus;
type ReviewIndicatorDialogId =
  | "open_prs"
  | "requested_from_you"
  | "awaiting_follow_up"
  | "authored_by_you"
  | "stale_prs";
const OPEN_PULL_REQUEST_FILTERS: PullRequestFocus[] = ["all", "no_reviews"];

export default function Reviews() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [showDependabotPullRequests, setShowDependabotPullRequests] =
    usePersistentState<boolean>(SHOW_DEPENDABOT_PULL_REQUESTS_STORAGE_KEY, true);
  const [focusFilter, setFocusFilter] = usePersistentState<PullRequestFocus>(
    REVIEW_FOCUS_STORAGE_KEY,
    "all",
  );
  const [queueFocus, setQueueFocus] = usePersistentState<ReviewQueueFocus>(
    "devdeck:reviews:queue-focus",
    "all",
  );
  const [selectedRepoFilters, setSelectedRepoFilters] = usePersistentState<string[]>(
    "devdeck:reviews:repo-filters",
    [],
  );
  const [activeIndicatorDialog, setActiveIndicatorDialog] =
    useState<ReviewIndicatorDialogId | null>(null);
  const { data: snapshot, isLoading } = useWorkspaceSnapshot();
  const pullRequestWatchlist = usePullRequestWatchlist();
  const allPullRequests = snapshot?.pullRequests ?? [];
  const pullRequests = useMemo(
    () =>
      filterPullRequestsByDependabotVisibility(
        allPullRequests,
        showDependabotPullRequests,
      ),
    [allPullRequests, showDependabotPullRequests],
  );
  const filteredPullRequests = useMemo(
    () => filterPullRequestsByFocus(pullRequests, focusFilter, pullRequestWatchlist),
    [focusFilter, pullRequestWatchlist, pullRequests],
  );
  const repoFilteredPullRequests = useMemo(
    () =>
      selectedRepoFilters.length === 0
        ? filteredPullRequests
        : filteredPullRequests.filter((pullRequest) =>
            selectedRepoFilters.includes(pullRequest.repo),
          ),
    [filteredPullRequests, selectedRepoFilters],
  );
  const markedPullRequestIds = useMemo(
    () => getPullRequestQueueIds(pullRequestWatchlist, "marked"),
    [pullRequestWatchlist],
  );
  const reviewedPullRequestIds = useMemo(
    () => getPullRequestQueueIds(pullRequestWatchlist, "reviewed"),
    [pullRequestWatchlist],
  );
  const requestedFromYouPullRequests = useMemo(
    () =>
      pullRequests.filter(
        (pullRequest) =>
          pullRequest.isViewerRequestedReviewer &&
          !pullRequest.reviewedByViewer &&
          !pullRequest.authoredByViewer,
      ),
    [pullRequests],
  );
  const needsFollowUpPullRequests = useMemo(
    () => pullRequests.filter(pullRequestNeedsFollowUp),
    [pullRequests],
  );
  const markedPullRequestCount = pullRequests.filter((pullRequest) =>
    markedPullRequestIds.has(pullRequest.id),
  ).length;
  const reviewedPullRequestCount = pullRequests.filter((pullRequest) =>
    reviewedPullRequestIds.has(pullRequest.id),
  ).length;
  const authoredPullRequests = snapshot?.authoredPullRequests ?? [];
  const activeAuthoredPullRequests = useMemo(
    () =>
      authoredPullRequests.filter(
        (pullRequest) =>
          pullRequest.status !== "closed" && pullRequest.status !== "merged",
      ),
    [authoredPullRequests],
  );
  const queuePullRequests = useMemo(() => {
    if (queueFocus === "all") {
      return pullRequests.filter((pullRequest) => pullRequestWatchlist[pullRequest.id]);
    }

    return pullRequests.filter(
      (pullRequest) => pullRequestWatchlist[pullRequest.id]?.status === queueFocus,
    );
  }, [pullRequestWatchlist, pullRequests, queueFocus]);
  const stalePullRequests = useMemo(
    () =>
      pullRequests.filter((pullRequest) => {
        const updatedAt = new Date(pullRequest.updatedAt).getTime();
        if (!Number.isFinite(updatedAt)) {
          return false;
        }

        return (
          Date.now() - updatedAt >=
          STALE_PULL_REQUEST_DAYS * 24 * 60 * 60 * 1000
        );
      }),
    [pullRequests],
  );
  const needsReviewCount = pullRequests.filter(pullRequestNeedsViewerReview).length;
  const requestedFromYouCount = requestedFromYouPullRequests.length;
  const needsFollowUpCount = needsFollowUpPullRequests.length;
  const activeAuthoredPullRequestCount = activeAuthoredPullRequests.length;
  const stalePullRequestCount = stalePullRequests.length;
  const formatCount = (value: number) => new Intl.NumberFormat().format(value);
  const emptyAuthoredPullRequestMessage = useMemo(
    () =>
      activeAuthoredPullRequestCount > 0
        ? `${formatCount(activeAuthoredPullRequestCount)} active`
        : "nothing active",
    [activeAuthoredPullRequestCount],
  );
  const selectedPullRequestId = new URLSearchParams(search).get("pr");
  const githubStatus = snapshot?.githubStatus;
  const selectedPullRequest =
    pullRequests.find((pullRequest) => pullRequest.id === selectedPullRequestId) ?? null;
  const myQueuePagination = usePagination(queuePullRequests, 5, {
    resetKey: queueFocus,
    storageKey: "devdeck:reviews:my-queue",
  });
  const openPullRequestsPagination = usePagination(repoFilteredPullRequests, 8, {
    resetKey: `${focusFilter}:${selectedRepoFilters.join("|")}`,
    storageKey: "devdeck:reviews:open-prs",
  });
  const authoredPullRequestsPagination = usePagination(authoredPullRequests, 5, {
    storageKey: "devdeck:reviews:authored-prs",
  });

  useEffect(() => {
    const nextFocus = new URLSearchParams(search).get("focus");
    if (nextFocus === "in_review" || nextFocus === "done") {
      setFocusFilter("all");
      return;
    }

    if (nextFocus === "all" || nextFocus === "no_reviews") {
      setFocusFilter(nextFocus);
      return;
    }

    if (nextFocus) {
      setFocusFilter("all");
    }
  }, [search, setFocusFilter]);

  useEffect(() => {
    if (!OPEN_PULL_REQUEST_FILTERS.includes(focusFilter)) {
      setFocusFilter("all");
    }
  }, [focusFilter, setFocusFilter]);

  useEffect(() => {
    const persistedQueueFocus = String(queueFocus);
    if (persistedQueueFocus === "in_review" || persistedQueueFocus === "done") {
      setQueueFocus("reviewed");
    }
  }, [queueFocus, setQueueFocus]);

  const activeIndicatorDialogConfig = useMemo(() => {
    if (!activeIndicatorDialog) {
      return null;
    }

    const dialogById: Record<
      ReviewIndicatorDialogId,
      | {
          description: string;
          emptyMessage: string;
          kind: "authored";
          pullRequests: WorkspaceAuthoredPullRequestItem[];
          title: string;
        }
      | {
          description: string;
          emptyMessage: string;
          kind: "open";
          pullRequests: WorkspacePullRequestItem[];
          title: string;
        }
    > = {
      open_prs: {
        description: "All open pull requests currently visible in this workspace view.",
        emptyMessage: "No open pull requests are currently available.",
        kind: "open",
        pullRequests,
        title: "Open Pull Requests",
      },
      requested_from_you: {
        description: "Pull requests where you are explicitly requested as a reviewer.",
        emptyMessage: "Nothing is currently requested from you.",
        kind: "open",
        pullRequests: requestedFromYouPullRequests,
        title: "Requested From You",
      },
      awaiting_follow_up: {
        description:
          "Pull requests you already reviewed that changed afterward and now need another pass.",
        emptyMessage: "Nothing currently needs your follow-up.",
        kind: "open",
        pullRequests: needsFollowUpPullRequests,
        title: "Awaiting Your Follow-Up",
      },
      authored_by_you: {
        description:
          "Your active pull requests, so you can quickly check what is still open or waiting.",
        emptyMessage: "You do not currently have active authored pull requests.",
        kind: "authored",
        pullRequests: activeAuthoredPullRequests,
        title: "Authored By You",
      },
      stale_prs: {
        description: `Open pull requests without updates for at least ${STALE_PULL_REQUEST_DAYS} days.`,
        emptyMessage: "No stale pull requests were found.",
        kind: "open",
        pullRequests: stalePullRequests,
        title: "Stale Pull Requests",
      },
    };

    return dialogById[activeIndicatorDialog];
  }, [
    activeAuthoredPullRequests,
    activeIndicatorDialog,
    needsFollowUpPullRequests,
    pullRequests,
    requestedFromYouPullRequests,
    stalePullRequests,
  ]);

  const handleOpenPullRequest = async (targetUrl: string) => {
    const desktopApi = getDesktopApi();
    if (desktopApi) {
      await desktopApi.openExternal(targetUrl);
      return;
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const handleInspectPullRequest = (pullRequestId: string) => {
    navigateInApp(`/reviews?pr=${encodeURIComponent(pullRequestId)}`, setLocation);
  };

  const handleInspectIndicatorPullRequest = (pullRequestId: string) => {
    setActiveIndicatorDialog(null);
    handleInspectPullRequest(pullRequestId);
  };

  const handleOpenAuthoredIndicatorPullRequest = async (
    pullRequest: WorkspaceAuthoredPullRequestItem,
  ) => {
    const linkedPullRequest = pullRequests.find(
      (openPullRequest) => openPullRequest.id === pullRequest.id,
    );

    if (linkedPullRequest) {
      handleInspectIndicatorPullRequest(linkedPullRequest.id);
      return;
    }

    await handleOpenPullRequest(pullRequest.url);
  };

  const handleSetPullRequestQueueStatus = (
    pullRequestId: string,
    status: PullRequestWatchStatus | null,
  ) => {
    setPullRequestWatchStatus(pullRequestId, status);
  };

  const addRepoFilter = (repo: string) => {
    setSelectedRepoFilters((current) =>
      current.includes(repo) ? current : [...current, repo],
    );
  };

  const removeRepoFilter = (repo: string) => {
    setSelectedRepoFilters((current) => current.filter((item) => item !== repo));
  };

  const pullRequestFilters: Array<{
    count: number;
    id: PullRequestFocus;
    label: string;
  }> = [
    { count: pullRequests.length, id: "all", label: "All PRs" },
    {
      count: filterPullRequestsByFocus(pullRequests, "no_reviews").length,
      id: "no_reviews",
      label: "No Reviews",
    },
  ];

  const emptyPullRequestMessageByFilter: Record<PullRequestFocus, string> = {
    all: "No open pull requests were found for the connected repositories.",
    my_queue: "Your local review queue is empty.",
    checks_failing: "No pull requests currently have failing checks.",
    checks_passing: "No pull requests currently have passing checks.",
    no_reviews: "No pull requests are currently waiting on a first review.",
    authored_by_me: "You do not currently have open pull requests in this workspace.",
    changes_requested: "No pull requests are currently waiting on requested changes.",
    marked_for_review: "You have not marked any pull requests for review yet.",
    reviewed: "You do not currently have any pull requests marked as reviewed.",
    needs_my_follow_up: "Nothing currently needs your follow-up.",
    needs_my_review: "You do not currently have a review queue here.",
    reviewed_by_me: "You have not reviewed any of the current open pull requests yet.",
    waiting_on_others: "There are no pull requests currently waiting on someone else.",
  };

  return (
    <AppLayout>
      <>
        <div className="min-w-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">
              Pull Requests
            </h1>
            <p className="text-muted-foreground text-sm">
              {snapshot?.githubStatus.message ??
                "Open GitHub pull requests from your connected repositories."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <button
            type="button"
            onClick={() => setActiveIndicatorDialog("open_prs")}
            className="flex flex-col rounded-xl border border-border/60 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
          >
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Open PRs
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">
                {formatCount(pullRequests.length)}
              </span>
              <span className="text-xs text-muted-foreground">live on GitHub</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveIndicatorDialog("requested_from_you")}
            className="flex flex-col rounded-xl border border-border/60 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
          >
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Requested From You
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-2">
                {formatCount(requestedFromYouCount)}
              </span>
              <span className="text-xs text-muted-foreground">
                {needsReviewCount > 0 ? "explicit review requests" : "nothing pending"}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveIndicatorDialog("awaiting_follow_up")}
            className="flex flex-col rounded-xl border border-border/60 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
          >
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Awaiting Your Follow-Up
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-3">
                {formatCount(needsFollowUpCount)}
              </span>
              <span className="text-xs text-muted-foreground">updated since review</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveIndicatorDialog("authored_by_you")}
            className="flex flex-col rounded-xl border border-border/60 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
          >
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Authored By You
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-primary">
                {formatCount(activeAuthoredPullRequestCount)}
              </span>
              <span className="text-xs text-muted-foreground">
                {emptyAuthoredPullRequestMessage}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveIndicatorDialog("stale_prs")}
            className="flex flex-col rounded-xl border border-border/60 bg-white/60 p-4 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-black/[0.02]"
          >
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Stale PRs
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-1">
                {formatCount(stalePullRequestCount)}
              </span>
              <span className="text-xs text-muted-foreground">
                quiet {STALE_PULL_REQUEST_DAYS}+ days
              </span>
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="space-y-8">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    My Queue
                  </h2>
                  <span className="rounded-sm border border-border/60 bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                    {markedPullRequestCount + reviewedPullRequestCount}
                  </span>
                </div>
              </div>
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  {
                    count: markedPullRequestCount + reviewedPullRequestCount,
                    id: "all" as const,
                    label: "All Queue Items",
                  },
                  {
                    count: markedPullRequestCount,
                    id: "marked" as const,
                    label: "Marked",
                  },
                  {
                    count: reviewedPullRequestCount,
                    id: "reviewed" as const,
                    label: "Reviewed",
                  },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setQueueFocus(filter.id)}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      queueFocus === filter.id
                        ? "bg-foreground text-background border-foreground"
                        : "bg-white text-muted-foreground border-border/60 hover:text-foreground hover:border-black/15"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold">
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-white/60 px-4 py-1 shadow-sm backdrop-blur-md">
                <div className="flex flex-col">
                  {myQueuePagination.paginatedItems.map((pullRequest) => {
                    const watchStatus = getPullRequestWatchStatus(
                      pullRequest.id,
                      pullRequestWatchlist,
                    );
                    const signalBadges = getPullRequestSignalBadges(
                      pullRequest,
                      watchStatus,
                    );
                    const visibleSignalBadges = signalBadges.filter(
                      (badge) => badge.label !== "reviewed",
                    );

                    return (
                      <div
                        key={`queue:${pullRequest.id}`}
                        className="rounded-md border-b border-border/40 px-4 py-3 -mx-4 transition-colors last:border-0 hover:bg-black/[0.03] cursor-pointer"
                        onClick={() => handleInspectPullRequest(pullRequest.id)}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="break-words text-[13px] font-semibold text-foreground">
                                #{pullRequest.number} {pullRequest.title}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={getProjectTagClassName(pullRequest.repo)}>
                                  {pullRequest.repo}
                                </span>
                                {visibleSignalBadges.map((badge) => (
                                  <span
                                    key={`${pullRequest.id}:${badge.label}`}
                                    className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}
                                  >
                                    {badge.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div
                              className="flex flex-wrap items-center gap-2 self-start"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <PullRequestQueueControl
                                awaitingFollowUp={pullRequestNeedsFollowUp(pullRequest)}
                                mode="queue"
                                onStatusChange={(status) =>
                                  handleSetPullRequestQueueStatus(pullRequest.id, status)
                                }
                                status={watchStatus}
                              />
                              <button
                                type="button"
                                onClick={() => void handleOpenPullRequest(pullRequest.url)}
                                className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                              >
                                <Github className="mr-1.5 h-3.5 w-3.5" />
                                View
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              {pullRequest.author && (
                                <span className="break-words">{pullRequest.author}</span>
                              )}
                              {pullRequest.isViewerRequestedReviewer && (
                                <span className="rounded-full border border-chart-2/20 bg-chart-2/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-chart-2">
                                  requested from you
                                </span>
                              )}
                            </div>
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
                  {queuePullRequests.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Your local PR queue is empty for this view.
                    </div>
                  ) : null}
                </div>
                <PaginationControls
                  currentPage={myQueuePagination.currentPage}
                  onPageChange={myQueuePagination.setCurrentPage}
                  pageSize={myQueuePagination.pageSize}
                  totalItems={myQueuePagination.totalItems}
                  label="queue items"
                  className="px-4 pb-4"
                />
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Open Pull Requests
                  </h2>
                  <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-sm font-bold border border-border/60">
                    {repoFilteredPullRequests.length}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-3">
                {pullRequestFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setFocusFilter(filter.id)}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      focusFilter === filter.id
                        ? "bg-foreground text-background border-foreground"
                        : "bg-white text-muted-foreground border-border/60 hover:text-foreground hover:border-black/15"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold">
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {selectedRepoFilters.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedRepoFilters.map((repo) => (
                      <button
                        key={repo}
                        type="button"
                        onClick={() => removeRepoFilter(repo)}
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
                    className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                  >
                    {showDependabotPullRequests
                      ? "Hide Dependabot PRs"
                      : "Show Dependabot PRs"}
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-white/60 px-4 py-1 shadow-sm backdrop-blur-md">
                <div className="flex flex-col">
                  {openPullRequestsPagination.paginatedItems.map((pullRequest) => (
                    (() => {
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
                          badge.label === "awaiting follow-up",
                      );
                      const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                      return (
                    <div
                      key={pullRequest.id}
                      className="group relative overflow-hidden rounded-md border-b border-border/40 px-4 py-3 -mx-4 transition-colors last:border-0 hover:bg-black/[0.03] cursor-pointer"
                      onClick={() => handleInspectPullRequest(pullRequest.id)}
                    >
                      {hasNoReviews ? (
                        <div
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-1.5 bg-muted-foreground/30"
                        />
                      ) : null}
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3">
                        <div className="mt-0.5">
                          <PullRequestListStatusIcon status={pullRequest.status} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="mb-0.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-2">
                              <p className="min-w-0 break-words text-[13px] font-semibold leading-5 text-foreground">
                                #{pullRequest.number} {pullRequest.title}
                                <PullRequestCiStatusIcon
                                  className="ml-1 align-[-0.125em]"
                                  status={pullRequest.ciStatus}
                                />
                              </p>
                              {visibleBadges.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                  {visibleBadges.map((badge) => (
                                    <span
                                      key={badge.label}
                                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm whitespace-nowrap border ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="inline-flex flex-shrink-0 flex-nowrap items-center gap-2 self-start">
                              <div onClick={(event) => event.stopPropagation()}>
                                <PullRequestQueueControl
                                  awaitingFollowUp={pullRequestNeedsFollowUp(pullRequest)}
                                  mode="open"
                                  onStatusChange={(status) =>
                                    handleSetPullRequestQueueStatus(
                                      pullRequest.id,
                                      status,
                                    )
                                  }
                                  status={watchStatus}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleOpenPullRequest(pullRequest.url);
                                }}
                                className="inline-flex h-8 shrink-0 whitespace-nowrap items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                              >
                                <Github className="mr-1.5 h-3.5 w-3.5" />
                                <span>View</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2 mt-1 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                addRepoFilter(pullRequest.repo);
                              }}
                              className={getProjectTagClassName(pullRequest.repo)}
                            >
                              {pullRequest.repo}
                            </button>
                            {pullRequest.author && <span className="break-words">{pullRequest.author}</span>}
                            {pullRequest.isViewerRequestedReviewer && (
                              <span className="rounded-full border border-chart-2/20 bg-chart-2/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-chart-2">
                                requested from you
                              </span>
                            )}
                          </div>
                          <span className="whitespace-nowrap text-right">
                            {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                      );
                    })()
                  ))}
                  {repoFilteredPullRequests.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {isLoading
                        ? "Loading pull requests..."
                        : githubStatus?.state === "connected"
                          ? githubStatus.connectedRepositoryCount > 0
                            ? selectedRepoFilters.length > 0
                              ? "No pull requests match the selected repository filters."
                              : emptyPullRequestMessageByFilter[focusFilter]
                            : "No GitHub remotes were detected in the current workspace."
                          : githubStatus?.state === "unsupported"
                            ? "GitHub pull request sync requires the desktop app."
                            : "GitHub is not connected yet. Open Preferences to authenticate and load pull requests."}
                    </div>
                  )}
                </div>
                <PaginationControls
                  currentPage={openPullRequestsPagination.currentPage}
                  onPageChange={openPullRequestsPagination.setCurrentPage}
                  pageSize={openPullRequestsPagination.pageSize}
                  totalItems={openPullRequestsPagination.totalItems}
                  label="pull requests"
                  className="px-4 pb-4"
                />
              </div>
            </section>

          </div>

          <div className="space-y-8">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Authored By You
                </h2>
                <span className="rounded-sm border border-border/60 bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {authoredPullRequests.length}
                </span>
              </div>
              <div className="rounded-xl border border-border/60 bg-white/60 p-4 shadow-sm backdrop-blur-md">
                <div className="space-y-4">
                  {authoredPullRequestsPagination.paginatedItems.map((pullRequest) => {
                    const statusMeta = getAuthoredPullRequestStatusMeta(pullRequest.status);

                    return (
                      <div key={pullRequest.id} className="rounded-lg border border-border/60 bg-white p-3">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <GitPullRequest className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                <p className="break-words text-[13px] font-semibold text-foreground">
                                  #{pullRequest.number} {pullRequest.title}
                                </p>
                              </div>
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {pullRequest.repo} · {pullRequest.reviewCount} review
                                {pullRequest.reviewCount === 1 ? "" : "s"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleOpenPullRequest(pullRequest.url)}
                              className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                            >
                              <Github className="mr-1.5 h-3.5 w-3.5" />
                              View
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="whitespace-nowrap">
                              {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {authoredPullRequests.length === 0 ? (
                    <div className="py-3 text-sm text-muted-foreground">
                      You do not currently have authored pull requests in this workspace.
                    </div>
                  ) : null}
                </div>
                <PaginationControls
                  currentPage={authoredPullRequestsPagination.currentPage}
                  onPageChange={authoredPullRequestsPagination.setCurrentPage}
                  pageSize={authoredPullRequestsPagination.pageSize}
                  totalItems={authoredPullRequestsPagination.totalItems}
                  label="authored pull requests"
                  className="pt-4"
                />
              </div>
            </section>
          </div>
        </div>
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
                  {activeIndicatorDialogConfig.kind === "open" ? (
                    <div className="space-y-3">
                      {activeIndicatorDialogConfig.pullRequests.map((pullRequest) => {
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
                            badge.label === "awaiting follow-up",
                        );
                        const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                        return (
                          <div
                            key={`indicator:${pullRequest.id}`}
                            onClick={() =>
                              handleInspectIndicatorPullRequest(pullRequest.id)
                            }
                            className="group relative overflow-hidden rounded-xl border border-border/60 bg-white p-4 transition-colors hover:bg-black/[0.02] cursor-pointer"
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
                                  <p className="min-w-0 break-words text-[13px] font-semibold leading-5 text-foreground">
                                    #{pullRequest.number} {pullRequest.title}
                                    <PullRequestCiStatusIcon
                                      className="ml-1 align-[-0.125em]"
                                      status={pullRequest.ciStatus}
                                    />
                                  </p>
                                  {visibleBadges.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      {visibleBadges.map((badge) => (
                                        <span
                                          key={`${pullRequest.id}:${badge.label}`}
                                          className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.className}`}
                                        >
                                          {badge.label}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div
                                  className="flex flex-shrink-0 flex-wrap items-center gap-2 self-start"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <PullRequestQueueControl
                                    awaitingFollowUp={pullRequestNeedsFollowUp(pullRequest)}
                                    mode="open"
                                    onStatusChange={(status) =>
                                      handleSetPullRequestQueueStatus(
                                        pullRequest.id,
                                        status,
                                      )
                                    }
                                    status={watchStatus}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenPullRequest(pullRequest.url)}
                                    className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                                  >
                                    <Github className="mr-1.5 h-3.5 w-3.5" />
                                    View
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className={getProjectTagClassName(pullRequest.repo)}>
                                    {pullRequest.repo}
                                  </span>
                                  {pullRequest.author ? (
                                    <span className="break-words">{pullRequest.author}</span>
                                  ) : null}
                                  {pullRequest.isViewerRequestedReviewer ? (
                                    <span className="rounded-full border border-chart-2/20 bg-chart-2/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-chart-2">
                                      requested from you
                                    </span>
                                  ) : null}
                                </div>
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
                  ) : (
                    <div className="space-y-3">
                      {activeIndicatorDialogConfig.pullRequests.map((pullRequest) => {
                        const statusMeta = getAuthoredPullRequestStatusMeta(
                          pullRequest.status,
                        );

                        return (
                          <div
                            key={`indicator-authored:${pullRequest.id}`}
                            onClick={() =>
                              void handleOpenAuthoredIndicatorPullRequest(pullRequest)
                            }
                            className="w-full rounded-xl border border-border/60 bg-white p-4 text-left transition-colors hover:bg-black/[0.02] cursor-pointer"
                          >
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <GitPullRequest className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                    <p className="break-words text-[13px] font-semibold text-foreground">
                                      #{pullRequest.number} {pullRequest.title}
                                    </p>
                                  </div>
                                  <p className="mt-2 text-[11px] text-muted-foreground">
                                    {pullRequest.repo} · {pullRequest.reviewCount} review
                                    {pullRequest.reviewCount === 1 ? "" : "s"}
                                  </p>
                                </div>
                                <div
                                  className="flex flex-shrink-0 items-center gap-2 self-start"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenPullRequest(pullRequest.url)}
                                    className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                                  >
                                    <Github className="mr-1.5 h-3.5 w-3.5" />
                                    View
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                <span
                                  className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusMeta.className}`}
                                >
                                  {statusMeta.label}
                                </span>
                                <span className="whitespace-nowrap">
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
                  )}
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
                  navigateInApp(location, setLocation);
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
