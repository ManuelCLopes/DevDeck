import AppLayout from "@/components/layout/AppLayout";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Github,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

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

export default function Reviews() {
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();
  const pullRequests = snapshot?.pullRequests ?? [];
  const reviews = snapshot?.reviews ?? [];
  const activeReviews = reviews.filter((review) => review.status === "active");
  const staleReviews = reviews.filter((review) => review.status === "stale");
  const draftPullRequests = pullRequests.filter((pullRequest) => pullRequest.status === "draft");
  const attentionPullRequests = pullRequests.filter(
    (pullRequest) =>
      pullRequest.status === "changes_requested" ||
      pullRequest.status === "review_required",
  );
  const latestPullRequest = pullRequests[0] ?? null;
  const openPullRequestsPagination = usePagination(pullRequests, 8);
  const activeReviewsPagination = usePagination(activeReviews, 6);
  const staleReviewsPagination = usePagination(staleReviews, 6);

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
        <div className="flex items-start justify-between gap-4">
          <div>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              Draft Pull Requests
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-muted-foreground">
                {draftPullRequests.length}
              </span>
              <span className="text-xs text-muted-foreground">not ready yet</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Needs Attention
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-3">
                {attentionPullRequests.length}
              </span>
              <span className="text-xs text-muted-foreground">awaiting action</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Latest Update
            </h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-sm font-semibold tracking-tight">
                {latestPullRequest
                  ? formatDistanceToNow(new Date(latestPullRequest.updatedAt), {
                      addSuffix: true,
                    })
                  : "No PR activity"}
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
                    {pullRequests.length}
                  </span>
                </div>
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl px-4 py-1 shadow-sm overflow-hidden">
                <div className="flex flex-col">
                  {openPullRequestsPagination.paginatedItems.map((pullRequest) => (
                    <div
                      key={pullRequest.id}
                      className="group flex items-start gap-3 py-3 px-4 -mx-4 hover:bg-black/[0.03] rounded-md transition-colors border-b border-border/40 last:border-0"
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
                        <div className="flex items-center justify-between gap-4 mb-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-[13px] text-foreground truncate">
                              #{pullRequest.number} {pullRequest.title}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm whitespace-nowrap border ${pullRequestStatusClasses[pullRequest.status]}`}
                            >
                              {pullRequestStatusLabels[pullRequest.status]}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground mt-1">
                          <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50 text-foreground/80">
                            {pullRequest.repo}
                          </span>
                          <span>
                            {pullRequest.headBranch} into {pullRequest.baseBranch}
                          </span>
                          {pullRequest.author && <span>{pullRequest.author}</span>}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleOpenPullRequest(pullRequest.url)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity pl-2 flex items-center h-8 px-2.5 rounded-md text-[11px] font-medium bg-white border border-border shadow-sm text-foreground hover:bg-secondary"
                      >
                        <span className="mr-1.5">Open</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {pullRequests.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {isLoading
                        ? "Loading pull requests..."
                        : snapshot?.githubStatus.authenticated
                          ? snapshot?.githubStatus.connectedRepositoryCount > 0
                            ? "No open pull requests were found for the connected repositories."
                            : "No GitHub remotes were detected in the current workspace."
                          : "GitHub CLI is not authenticated yet. Run `gh auth login` to load pull requests."}
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
                        <div className="flex items-center justify-between gap-4 mb-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-[13px] text-foreground truncate">
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

                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground mt-1">
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
                          <div className="flex items-center justify-between mt-1 gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono truncate mr-2">
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
                    <p className="font-medium text-foreground text-sm">
                      {snapshot?.githubStatus.authenticated
                        ? "GitHub CLI connected"
                        : "GitHub CLI not connected"}
                    </p>
                    <p>{snapshot?.githubStatus.message ?? "GitHub status is unavailable."}</p>
                    <p>
                      Connected repositories:{" "}
                      {snapshot?.githubStatus.connectedRepositoryCount ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
