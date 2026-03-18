import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  CheckCheck,
  Copy,
  GitBranch,
  Github,
  ListChecks,
  Route,
  User2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDesktopApi } from "@/lib/desktop";
import {
  getPullRequestCiStatusMeta,
  getPullRequestReviewEventMeta,
  getPullRequestFollowUpMeta,
  getPullRequestReviewSummary,
  getPullRequestStatusMeta,
} from "@/lib/pull-request-utils";
import { setStoredReviewFocus } from "@/lib/review-focus";
import type { WorkspacePullRequestItem } from "@shared/workspace";
import { useLocation } from "wouter";

interface PullRequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullRequest: WorkspacePullRequestItem | null;
}

export default function PullRequestDetailDialog({
  open,
  onOpenChange,
  pullRequest,
}: PullRequestDetailDialogProps) {
  const [, setLocation] = useLocation();
  const statusMeta = pullRequest
    ? getPullRequestStatusMeta(pullRequest.status)
    : null;
  const reviewSummary = pullRequest
    ? getPullRequestReviewSummary(pullRequest)
    : null;
  const followUpMeta = pullRequest
    ? getPullRequestFollowUpMeta(pullRequest)
    : null;
  const ciStatusMeta = pullRequest
    ? getPullRequestCiStatusMeta(pullRequest.ciStatus)
    : null;

  const handleOpenPullRequest = async () => {
    if (!pullRequest) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (desktopApi) {
      await desktopApi.openExternal(pullRequest.url);
      return;
    }

    window.open(pullRequest.url, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    if (!pullRequest) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(pullRequest.url);
      return;
    }

    await navigator.clipboard.writeText(pullRequest.url);
  };

  const handleCopyBranch = async () => {
    if (!pullRequest) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(pullRequest.headBranch);
      return;
    }

    await navigator.clipboard.writeText(pullRequest.headBranch);
  };

  const handleOpenReviewFocus = (focus: "needs_my_review" | "changes_requested") => {
    setStoredReviewFocus(focus);
    onOpenChange(false);
    setLocation("/reviews");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/60 bg-white/95 backdrop-blur-md">
        {pullRequest && (
          <>
            <DialogHeader className="space-y-3 pr-10">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${statusMeta?.className}`}>
                  {statusMeta?.label}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${reviewSummary?.className}`}>
                  {reviewSummary?.label}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${followUpMeta?.className}`}>
                  {followUpMeta?.label}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${ciStatusMeta?.className}`}>
                  {ciStatusMeta?.label}
                </span>
                {pullRequest.authoredByViewer && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border bg-secondary text-muted-foreground border-border/60">
                    you opened
                  </span>
                )}
              </div>
              <DialogTitle className="text-xl leading-snug">
                #{pullRequest.number} {pullRequest.title}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {pullRequest.repo} · updated{" "}
                {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                  addSuffix: true,
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="w-3.5 h-3.5 text-primary" />
                  Branch Routing
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Head branch</span>
                    <span className="font-mono text-foreground">{pullRequest.headBranch}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Base branch</span>
                    <span className="font-mono text-foreground">{pullRequest.baseBranch}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Author</span>
                    <span className="text-foreground">
                      {pullRequest.authoredByViewer
                        ? "You"
                        : pullRequest.author ?? "Unknown author"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Head checks</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${ciStatusMeta?.className}`}>
                      {ciStatusMeta?.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Review Coverage
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Total reviewers</span>
                    <span className="font-semibold text-foreground">{pullRequest.reviewCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Requested from you</span>
                    <span className="font-semibold text-foreground">
                      {pullRequest.isViewerRequestedReviewer ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Reviewed by you</span>
                    <span className="font-semibold text-foreground">
                      {pullRequest.reviewedByViewer ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Other reviewers</span>
                    <span className="font-semibold text-foreground">
                      {pullRequest.reviewedByOthersCount}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <ListChecks className="w-3.5 h-3.5 text-primary" />
                    Requested Reviewers
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pullRequest.requestedReviewerLogins.length > 0 ? (
                      pullRequest.requestedReviewerLogins.map((reviewerLogin) => (
                        <span
                          key={reviewerLogin}
                          className="inline-flex items-center gap-1.5 rounded-full border border-chart-2/20 bg-chart-2/10 px-2 py-1 text-[11px] font-medium text-chart-2"
                        >
                          <User2 className="w-3 h-3" />
                          {reviewerLogin}
                        </span>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No explicit review requests are open on this pull request.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pullRequest.reviewerLogins.length > 0 ? (
                    pullRequest.reviewerLogins.map((reviewerLogin) => (
                      <span
                        key={reviewerLogin}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white px-2 py-1 text-[11px] font-medium text-foreground"
                      >
                        <User2 className="w-3 h-3 text-muted-foreground" />
                        {reviewerLogin}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No reviewers have touched this PR yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-white/80 p-4 space-y-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCheck className="w-3.5 h-3.5 text-primary" />
                Review Timeline
              </div>
              {pullRequest.reviewTimeline.length > 0 ? (
                <div className="space-y-2">
                  {pullRequest.reviewTimeline.map((reviewEvent) => {
                    const reviewEventMeta = getPullRequestReviewEventMeta(reviewEvent.state);
                    return (
                      <div
                        key={reviewEvent.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {reviewEvent.reviewerLogin ?? "Unknown reviewer"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {reviewEvent.submittedAt
                              ? formatDistanceToNow(new Date(reviewEvent.submittedAt), {
                                  addSuffix: true,
                                })
                              : "Review timestamp unavailable"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${reviewEventMeta.className}`}
                        >
                          {reviewEventMeta.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No review events have been recorded on this pull request yet.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Route className="w-3.5 h-3.5 text-primary" />
                Follow-Up Shortcuts
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenReviewFocus("needs_my_review")}
                  className="gap-1.5"
                >
                  Needs My Review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenReviewFocus("changes_requested")}
                  className="gap-1.5"
                >
                  Changes Requested
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopyLink()}
                className="gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopyBranch()}
                className="gap-1.5"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Copy Branch
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleOpenPullRequest()}
                className="gap-1.5"
              >
                <Github className="w-3.5 h-3.5" />
                Open on GitHub
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
