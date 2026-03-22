import AppLayout from "@/components/layout/AppLayout";
import PullRequestQueueControl from "@/components/pull-requests/PullRequestQueueControl";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { usePullRequestWatchlist } from "@/hooks/use-pull-request-watchlist";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import { getGitHubStatusMeta } from "@/lib/github-status";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import {
  getPullRequestQueueIds,
  getPullRequestWatchStatus,
  setPullRequestWatchStatus,
  type PullRequestWatchStatus,
} from "@/lib/pull-request-watchlist";
import {
  filterPullRequestsByFocus,
  getAuthoredPullRequestStatusMeta,
  getPullRequestSignalBadges,
  pullRequestHasNoReviews,
  pullRequestNeedsFollowUp,
  pullRequestNeedsViewerReview,
  type PullRequestFocus,
} from "@/lib/pull-request-utils";
import { REVIEW_FOCUS_STORAGE_KEY } from "@/lib/review-focus";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Github,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  X,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";

const PullRequestDetailDialog = lazy(
  () => import("@/components/pull-requests/PullRequestDetailDialog"),
);

const STALE_PULL_REQUEST_DAYS = 5;
type ReviewQueueFocus = "all" | PullRequestWatchStatus;

export default function Reviews() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [focusFilter, setFocusFilter] = usePersistentState<PullRequestFocus>(
    REVIEW_FOCUS_STORAGE_KEY,
    "all",
  );
  const [queueFocus, setQueueFocus] = usePersistentState<ReviewQueueFocus>(
    "devdeck:reviews:queue-focus",
    "all",
  );
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();
  const pullRequestWatchlist = usePullRequestWatchlist();
  const pullRequests = snapshot?.pullRequests ?? [];
  const reviews = snapshot?.reviews ?? [];
  const filteredPullRequests = useMemo(
    () => filterPullRequestsByFocus(pullRequests, focusFilter, pullRequestWatchlist),
    [focusFilter, pullRequestWatchlist, pullRequests],
  );
  const markedPullRequestIds = useMemo(
    () => getPullRequestQueueIds(pullRequestWatchlist, "marked"),
    [pullRequestWatchlist],
  );
  const inReviewPullRequestIds = useMemo(
    () => getPullRequestQueueIds(pullRequestWatchlist, "in_review"),
    [pullRequestWatchlist],
  );
  const donePullRequestIds = useMemo(
    () => getPullRequestQueueIds(pullRequestWatchlist, "done"),
    [pullRequestWatchlist],
  );
  const activeReviews = reviews.filter((review) => review.status === "active");
  const staleReviews = reviews.filter((review) => review.status === "stale");
  const draftPullRequestCount = pullRequests.filter(
    (pullRequest) => pullRequest.status === "draft",
  ).length;
  const requestedFromYouCount = pullRequests.filter(
    (pullRequest) =>
      pullRequest.isViewerRequestedReviewer &&
      !pullRequest.reviewedByViewer &&
      !pullRequest.authoredByViewer,
  ).length;
  const needsFollowUpCount = pullRequests.filter(pullRequestNeedsFollowUp).length;
  const markedPullRequestCount = pullRequests.filter((pullRequest) =>
    markedPullRequestIds.has(pullRequest.id),
  ).length;
  const inReviewPullRequestCount = pullRequests.filter((pullRequest) =>
    inReviewPullRequestIds.has(pullRequest.id),
  ).length;
  const donePullRequestCount = pullRequests.filter((pullRequest) =>
    donePullRequestIds.has(pullRequest.id),
  ).length;
  const activeAuthoredPullRequestCount = (snapshot?.authoredPullRequests ?? []).filter(
    (pullRequest) =>
      pullRequest.status !== "closed" && pullRequest.status !== "merged",
  ).length;
  const authoredPullRequests = snapshot?.authoredPullRequests ?? [];
  const queuePullRequests = useMemo(() => {
    if (queueFocus === "all") {
      return pullRequests.filter((pullRequest) => pullRequestWatchlist[pullRequest.id]);
    }

    return pullRequests.filter(
      (pullRequest) => pullRequestWatchlist[pullRequest.id]?.status === queueFocus,
    );
  }, [pullRequestWatchlist, pullRequests, queueFocus]);
  const stalePullRequestCount = pullRequests.filter((pullRequest) => {
    const updatedAt = new Date(pullRequest.updatedAt).getTime();
    if (!Number.isFinite(updatedAt)) {
      return false;
    }

    return (
      Date.now() - updatedAt >=
      STALE_PULL_REQUEST_DAYS * 24 * 60 * 60 * 1000
    );
  }).length;
  const needsReviewCount = pullRequests.filter(pullRequestNeedsViewerReview).length;
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
  const githubStatusMeta = getGitHubStatusMeta(githubStatus);
  const selectedPullRequest =
    pullRequests.find((pullRequest) => pullRequest.id === selectedPullRequestId) ?? null;
  const myQueuePagination = usePagination(queuePullRequests, 5, {
    resetKey: queueFocus,
    storageKey: "devdeck:reviews:my-queue",
  });
  const openPullRequestsPagination = usePagination(filteredPullRequests, 8, {
    resetKey: focusFilter,
    storageKey: "devdeck:reviews:open-prs",
  });
  const authoredPullRequestsPagination = usePagination(authoredPullRequests, 5, {
    storageKey: "devdeck:reviews:authored-prs",
  });
  const activeReviewsPagination = usePagination(activeReviews, 6, {
    storageKey: "devdeck:reviews:active-reviews",
  });
  const staleReviewsPagination = usePagination(staleReviews, 6, {
    storageKey: "devdeck:reviews:stale-reviews",
  });

  useEffect(() => {
    const nextFocus = new URLSearchParams(search).get("focus");
    if (
      nextFocus === "all" ||
      nextFocus === "my_queue" ||
      nextFocus === "marked_for_review" ||
      nextFocus === "in_review" ||
      nextFocus === "done" ||
      nextFocus === "no_reviews" ||
      nextFocus === "checks_failing" ||
      nextFocus === "checks_passing" ||
      nextFocus === "needs_my_review" ||
      nextFocus === "needs_my_follow_up" ||
      nextFocus === "authored_by_me" ||
      nextFocus === "changes_requested" ||
      nextFocus === "reviewed_by_me" ||
      nextFocus === "waiting_on_others"
    ) {
      setFocusFilter(nextFocus);
    }
  }, [search, setFocusFilter]);

  const handleOpenPullRequest = async (targetUrl: string) => {
    const desktopApi = getDesktopApi();
    if (desktopApi) {
      await desktopApi.openExternal(targetUrl);
      return;
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const handleInspectPullRequest = (pullRequestId: string) => {
    setLocation(`/reviews?pr=${encodeURIComponent(pullRequestId)}`);
  };

  const handleSetPullRequestQueueStatus = (
    pullRequestId: string,
    status: PullRequestWatchStatus | null,
  ) => {
    setPullRequestWatchStatus(pullRequestId, status);
  };

  const pullRequestFilters: Array<{
    count: number;
    id: PullRequestFocus;
    label: string;
  }> = [
    { count: pullRequests.length, id: "all", label: "All PRs" },
    {
      count:
        markedPullRequestCount + inReviewPullRequestCount + donePullRequestCount,
      id: "my_queue",
      label: "My Queue",
    },
    {
      count: markedPullRequestCount,
      id: "marked_for_review",
      label: "Marked For Review",
    },
    {
      count: inReviewPullRequestCount,
      id: "in_review",
      label: "In Review",
    },
    {
      count: donePullRequestCount,
      id: "done",
      label: "Done",
    },
    {
      count: filterPullRequestsByFocus(pullRequests, "no_reviews").length,
      id: "no_reviews",
      label: "No Reviews",
    },
    {
      count: filterPullRequestsByFocus(pullRequests, "checks_failing").length,
      id: "checks_failing",
      label: "Checks Failing",
    },
    {
      count: filterPullRequestsByFocus(pullRequests, "checks_passing").length,
      id: "checks_passing",
      label: "Checks Passing",
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
    in_review: "You do not currently have any pull requests marked as in review.",
    done: "You have not completed any local review queue items yet.",
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
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-8 px-3 rounded-md text-xs font-medium bg-white/80 backdrop-blur-md border border-border/60 hover:bg-black/5 shadow-sm transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Open PRs
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">
                {formatCount(pullRequests.length)}
              </span>
              <span className="text-xs text-muted-foreground">live on GitHub</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
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
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Awaiting Your Follow-Up
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-3">
                {formatCount(needsFollowUpCount)}
              </span>
              <span className="text-xs text-muted-foreground">updated since review</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
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
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    My Queue
                  </h2>
                  <span className="rounded-sm border border-border/60 bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                    {markedPullRequestCount + inReviewPullRequestCount + donePullRequestCount}
                  </span>
                </div>
              </div>
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  {
                    count:
                      markedPullRequestCount +
                      inReviewPullRequestCount +
                      donePullRequestCount,
                    id: "all" as const,
                    label: "All Queue Items",
                  },
                  {
                    count: markedPullRequestCount,
                    id: "marked" as const,
                    label: "Marked",
                  },
                  {
                    count: inReviewPullRequestCount,
                    id: "in_review" as const,
                    label: "In Review",
                  },
                  {
                    count: donePullRequestCount,
                    id: "done" as const,
                    label: "Done",
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
                                {signalBadges.map((badge) => (
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
                              <button
                                type="button"
                                onClick={() => void handleOpenPullRequest(pullRequest.url)}
                                className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                              >
                                <Github className="mr-1.5 h-3.5 w-3.5" />
                                View
                              </button>
                              <PullRequestQueueControl
                                onStatusChange={(status) =>
                                  handleSetPullRequestQueueStatus(pullRequest.id, status)
                                }
                                status={watchStatus}
                              />
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
                    {filteredPullRequests.length}
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
                          badge.label === "in review" ||
                          badge.label === "done",
                      );
                      const hasNoReviews = pullRequestHasNoReviews(pullRequest);
                      const ciStatusIcon =
                        pullRequest.ciStatus === "passing" ? (
                          <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-chart-1" />
                        ) : pullRequest.ciStatus === "failing" ? (
                          <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-chart-3" />
                        ) : null;

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
                          {pullRequest.status === "approved" ? (
                            <CheckCircle2 className="w-4 h-4 text-chart-1" />
                          ) : pullRequest.status === "changes_requested" ? (
                            <AlertCircle className="w-4 h-4 text-chart-3" />
                          ) : (
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="mb-0.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex min-w-0 items-start gap-2">
                                <span className="block break-words text-[13px] font-semibold leading-5 text-foreground">
                                  #{pullRequest.number} {pullRequest.title}
                                </span>
                                {ciStatusIcon}
                              </div>
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
                            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 self-start">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleOpenPullRequest(pullRequest.url);
                                }}
                                className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                              >
                                <Github className="mr-1.5 h-3.5 w-3.5" />
                                <span>View</span>
                              </button>
                              <div onClick={(event) => event.stopPropagation()}>
                                <PullRequestQueueControl
                                  onStatusChange={(status) =>
                                    handleSetPullRequestQueueStatus(
                                      pullRequest.id,
                                      status,
                                    )
                                  }
                                  status={watchStatus}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2 mt-1 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className={getProjectTagClassName(pullRequest.repo)}>
                              {pullRequest.repo}
                            </span>
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
                  {filteredPullRequests.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {isLoading
                        ? "Loading pull requests..."
                        : githubStatus?.state === "connected"
                          ? githubStatus.connectedRepositoryCount > 0
                            ? emptyPullRequestMessageByFilter[focusFilter]
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

            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Local Branch Review Queue
                  </h2>
                  <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-sm font-bold border border-border/60">
                    {reviews.length}
                  </span>
                </div>
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl px-4 py-1 shadow-sm overflow-hidden">
                <div className="flex flex-col">
                  {activeReviewsPagination.paginatedItems.map((review) => (
                    <div
                      key={review.id}
                      className="flex items-start gap-3 py-3 px-4 -mx-4 border-b border-border/40 last:border-0"
                    >
                      <div className="mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-chart-1" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-0.5 flex flex-col gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="font-semibold text-[13px] text-foreground break-words">
                              {review.branch}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm whitespace-nowrap border bg-chart-1/10 text-chart-1 border-chart-1/20">
                              active
                            </span>
                          </div>
                        </div>

                        <p className="text-[12px] text-muted-foreground mt-2 line-clamp-2">
                          {review.summary}
                        </p>

                        <div className="mt-3 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-4">
                            <span className={getProjectTagClassName(review.repo)}>
                              {review.repo}
                            </span>
                            {review.author && <span>{review.author}</span>}
                          </div>
                          <span className="whitespace-nowrap text-right">
                            {formatDistanceToNow(new Date(review.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activeReviews.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {isLoading
                        ? "Scanning your workspace..."
                        : "No active local branch review items were found."}
                    </div>
                  )}
                </div>
                <PaginationControls
                  currentPage={activeReviewsPagination.currentPage}
                  onPageChange={activeReviewsPagination.setCurrentPage}
                  pageSize={activeReviewsPagination.pageSize}
                  totalItems={activeReviewsPagination.totalItems}
                  label="review items"
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
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="rounded-full border border-border/60 bg-secondary/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {pullRequest.headBranch} to {pullRequest.baseBranch}
                            </span>
                          </div>
                          <div className="flex justify-end text-[11px] text-muted-foreground">
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

            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Stale Branches
                </h2>
                <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-sm font-bold border border-border/60">
                  {staleReviews.length}
                </span>
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm">
                <div className="space-y-4">
                  {staleReviewsPagination.paginatedItems.map((review) => (
                    <div key={review.id} className="group relative">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">
                          <AlertCircle className="w-4 h-4 text-chart-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">
                            {review.branch}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
                            {review.summary}
                          </p>
                          <div className="mt-3 flex flex-col gap-2 text-[10px] text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                            <span
                              className={getProjectTagClassName(
                                review.repo,
                                "min-w-0 max-w-full break-all text-[10px]",
                              )}
                            >
                              {review.repo}
                            </span>
                            <span className="whitespace-nowrap text-right font-medium text-chart-3">
                              {formatDistanceToNow(new Date(review.updatedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {staleReviews.length === 0 && (
                    <div className="py-2 text-sm text-muted-foreground flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-chart-1" />
                      No stale local branches right now.
                    </div>
                  )}
                </div>
                <PaginationControls
                  currentPage={staleReviewsPagination.currentPage}
                  onPageChange={staleReviewsPagination.setCurrentPage}
                  pageSize={staleReviewsPagination.pageSize}
                  totalItems={staleReviewsPagination.totalItems}
                  label="stale branches"
                  className="pt-6"
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  GitHub Status
                </h2>
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm text-xs text-muted-foreground space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary/50 p-2 rounded-md border border-border">
                    <Github className="w-4 h-4 text-foreground/70" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground text-sm flex items-center gap-2">
                      GitHub Connection
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${githubStatusMeta.className}`}>
                        {githubStatusMeta.label}
                      </span>
                    </p>
                    <p>{githubStatus?.message ?? "GitHub status is unavailable."}</p>
                    <p>
                      Connected repositories:{" "}
                      {githubStatus?.connectedRepositoryCount ?? 0}
                    </p>
                    <p>
                      Draft pull requests: {draftPullRequestCount}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
        </div>
        {selectedPullRequest ? (
          <Suspense fallback={null}>
            <PullRequestDetailDialog
              open={Boolean(selectedPullRequest)}
              onOpenChange={(open) => {
                if (!open) {
                  setLocation(location);
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
