import AppLayout from "@/components/layout/AppLayout";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { usePullRequestWatchlist } from "@/hooks/use-pull-request-watchlist";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import { getGitHubStatusMeta } from "@/lib/github-status";
import {
  getMarkedPullRequestIds,
  setPullRequestMarkedForReview,
} from "@/lib/pull-request-watchlist";
import {
  filterPullRequestsByFocus,
  getPullRequestSignalBadges,
  pullRequestNeedsFollowUp,
  pullRequestNeedsViewerReview,
  type PullRequestFocus,
} from "@/lib/pull-request-utils";
import { REVIEW_FOCUS_STORAGE_KEY } from "@/lib/review-focus";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  Clock,
  Github,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";

const PullRequestDetailDialog = lazy(
  () => import("@/components/pull-requests/PullRequestDetailDialog"),
);

export default function Reviews() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [focusFilter, setFocusFilter] = usePersistentState<PullRequestFocus>(
    REVIEW_FOCUS_STORAGE_KEY,
    "all",
  );
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();
  const pullRequestWatchlist = usePullRequestWatchlist();
  const pullRequests = snapshot?.pullRequests ?? [];
  const reviews = snapshot?.reviews ?? [];
  const markedPullRequestIds = useMemo(
    () => getMarkedPullRequestIds(pullRequestWatchlist),
    [pullRequestWatchlist],
  );
  const filteredPullRequests = useMemo(
    () => filterPullRequestsByFocus(pullRequests, focusFilter, markedPullRequestIds),
    [focusFilter, markedPullRequestIds, pullRequests],
  );
  const activeReviews = reviews.filter((review) => review.status === "active");
  const staleReviews = reviews.filter((review) => review.status === "stale");
  const draftPullRequests = pullRequests.filter((pullRequest) => pullRequest.status === "draft");
  const needsViewerReviewCount = pullRequests.filter(pullRequestNeedsViewerReview).length;
  const needsFollowUpCount = pullRequests.filter(pullRequestNeedsFollowUp).length;
  const reviewedByViewerCount = pullRequests.filter(
    (pullRequest) => pullRequest.reviewedByViewer,
  ).length;
  const markedPullRequestCount = pullRequests.filter((pullRequest) =>
    markedPullRequestIds.has(pullRequest.id),
  ).length;
  const authoredByViewerCount = pullRequests.filter(
    (pullRequest) => pullRequest.authoredByViewer,
  ).length;
  const latestPullRequest = pullRequests[0] ?? null;
  const selectedPullRequestId = new URLSearchParams(search).get("pr");
  const githubStatus = snapshot?.githubStatus;
  const githubStatusMeta = getGitHubStatusMeta(githubStatus);
  const selectedPullRequest =
    pullRequests.find((pullRequest) => pullRequest.id === selectedPullRequestId) ?? null;
  const openPullRequestsPagination = usePagination(filteredPullRequests, 8, {
    resetKey: focusFilter,
    storageKey: "devdeck:reviews:open-prs",
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
      nextFocus === "marked_for_review" ||
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

  const handleToggleMarkedPullRequest = (pullRequestId: string) => {
    setPullRequestMarkedForReview(
      pullRequestId,
      !markedPullRequestIds.has(pullRequestId),
    );
  };

  const pullRequestFilters: Array<{
    count: number;
    id: PullRequestFocus;
    label: string;
  }> = [
    { count: pullRequests.length, id: "all", label: "All PRs" },
    {
      count: markedPullRequestCount,
      id: "marked_for_review",
      label: "Marked For Review",
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
    checks_failing: "No pull requests currently have failing checks.",
    checks_passing: "No pull requests currently have passing checks.",
    no_reviews: "No pull requests are currently waiting on a first review.",
    authored_by_me: "You do not currently have open pull requests in this workspace.",
    changes_requested: "No pull requests are currently waiting on requested changes.",
    marked_for_review: "You have not marked any pull requests for review yet.",
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
              Open Pull Requests
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">{pullRequests.length}</span>
              <span className="text-xs text-muted-foreground">live on GitHub</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Needs Review
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-2">
                {needsViewerReviewCount}
              </span>
              <span className="text-xs text-muted-foreground">review queue</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Needs Your Follow-Up
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
                <span className="text-3xl font-bold tracking-tight text-chart-3">
                {needsFollowUpCount}
              </span>
              <span className="text-xs text-muted-foreground">updated since review</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Marked For Review
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-primary">
                {markedPullRequestCount}
              </span>
              <span className="text-xs text-muted-foreground">your shortlist</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Reviewed By You
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-1">
                {reviewedByViewerCount}
              </span>
              <span className="text-xs text-muted-foreground">
                {latestPullRequest
                  ? `latest ${formatDistanceToNow(new Date(latestPullRequest.updatedAt), {
                      addSuffix: true,
                    })}`
                  : "no PR activity"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
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
                      const markedForReview = markedPullRequestIds.has(pullRequest.id);
                      const signalBadges = getPullRequestSignalBadges(
                        pullRequest,
                        markedForReview,
                      );

                      return (
                    <div
                      key={pullRequest.id}
                      className="group flex items-start gap-3 py-3 px-4 -mx-4 hover:bg-black/[0.03] rounded-md transition-colors border-b border-border/40 last:border-0 cursor-pointer"
                      onClick={() => handleInspectPullRequest(pullRequest.id)}
                    >
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
                            <span className="block font-semibold text-[13px] text-foreground break-words">
                              #{pullRequest.number} {pullRequest.title}
                            </span>
                            {signalBadges.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                {signalBadges.map((badge) => (
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
                          <div className="flex flex-shrink-0 items-center gap-2 self-start sm:flex-col sm:items-end sm:gap-1">
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                                addSuffix: true,
                              })}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenPullRequest(pullRequest.url);
                              }}
                              className="inline-flex h-8 items-center rounded-md border border-border bg-white px-2.5 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                            >
                              <Github className="mr-1.5 h-3.5 w-3.5" />
                              <span>View in GitHub</span>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleMarkedPullRequest(pullRequest.id);
                              }}
                              className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-medium shadow-sm transition-colors ${
                                markedForReview
                                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                                  : "border-border bg-white text-foreground hover:bg-secondary"
                              }`}
                            >
                              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
                              {markedForReview ? "Marked" : "Mark"}
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground mt-1">
                          <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50 text-foreground/80">
                            {pullRequest.repo}
                          </span>
                          <span>
                            {pullRequest.headBranch} into {pullRequest.baseBranch}
                          </span>
                          {pullRequest.author && <span>{pullRequest.author}</span>}
                          {pullRequest.isViewerRequestedReviewer && (
                            <span className="rounded-full border border-chart-2/20 bg-chart-2/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-chart-2">
                              requested from you
                            </span>
                          )}
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
                        <div className="mb-0.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="font-semibold text-[13px] text-foreground break-words">
                              {review.branch}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm whitespace-nowrap border bg-chart-1/10 text-chart-1 border-chart-1/20">
                              active
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {formatDistanceToNow(new Date(review.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                          <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50 text-foreground/80">
                            {review.repo}
                          </span>
                          {review.author && <span>{review.author}</span>}
                        </div>

                        <p className="text-[12px] text-muted-foreground mt-2 line-clamp-2">
                          {review.summary}
                        </p>
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
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="mr-2 min-w-0 break-all text-[10px] font-mono text-muted-foreground">
                              {review.repo}
                            </span>
                            <span className="text-[10px] font-medium text-chart-3 whitespace-nowrap bg-chart-3/10 px-1 py-0.5 rounded border border-chart-3/20">
                              {formatDistanceToNow(new Date(review.updatedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
                            {review.summary}
                          </p>
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
                      Draft pull requests: {draftPullRequests.length}
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
