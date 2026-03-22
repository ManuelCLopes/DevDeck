import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import {
  CheckCheck,
  GitBranch,
  Github,
  ListChecks,
  MessageSquare,
  User2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PullRequestQueueControl from "@/components/pull-requests/PullRequestQueueControl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePullRequestWatchlist } from "@/hooks/use-pull-request-watchlist";
import { getDesktopApi } from "@/lib/desktop";
import {
  getPullRequestWatchStatus,
  setPullRequestWatchStatus,
} from "@/lib/pull-request-watchlist";
import {
  getPullRequestCiStatusMeta,
  getPullRequestReviewEventMeta,
  getPullRequestSignalBadges,
} from "@/lib/pull-request-utils";
import { parseReviewerLogins } from "@/lib/pull-request-actions";
import { toast } from "@/hooks/use-toast";
import type { WorkspacePullRequestItem } from "@shared/workspace";

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
  const [commentBody, setCommentBody] = useState("");
  const [reviewerInput, setReviewerInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isSubmittingReviewers, setIsSubmittingReviewers] = useState(false);
  const pullRequestWatchlist = usePullRequestWatchlist();
  const ciStatusMeta = pullRequest
    ? getPullRequestCiStatusMeta(pullRequest.ciStatus)
    : null;
  const desktopApi = getDesktopApi();
  const reviewerLogins = parseReviewerLogins(reviewerInput);
  const canRunGitHubActions = Boolean(desktopApi && pullRequest?.repositorySlug);
  const watchStatus = pullRequest
    ? getPullRequestWatchStatus(pullRequest.id, pullRequestWatchlist)
    : null;
  const signalBadges = pullRequest
    ? getPullRequestSignalBadges(pullRequest, watchStatus)
    : [];

  useEffect(() => {
    if (!open) {
      return;
    }

    setCommentBody("");
    setReviewerInput("");
    setActionError(null);
  }, [open, pullRequest?.id]);

  const handleOpenPullRequest = async () => {
    if (!pullRequest) {
      return;
    }

    if (desktopApi) {
      await desktopApi.openExternal(pullRequest.url);
      return;
    }

    window.open(pullRequest.url, "_blank", "noopener,noreferrer");
  };

  const handleCopyBranch = async (branchName: string) => {
    if (!pullRequest) {
      return;
    }

    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(branchName);
    } else {
      await navigator.clipboard.writeText(branchName);
    }

    toast({
      title: "Branch copied",
      description: `${branchName} copied to your clipboard.`,
    });
  };

  const handleAddComment = async () => {
    const activeDesktopApi = getDesktopApi();
    if (!pullRequest || !pullRequest.repositorySlug || !activeDesktopApi) {
      return;
    }

    const trimmedCommentBody = commentBody.trim();
    if (!trimmedCommentBody) {
      setActionError("Write a comment before sending it to GitHub.");
      return;
    }

    setActionError(null);
    setIsSubmittingComment(true);
    try {
      await activeDesktopApi.addPullRequestComment({
        body: trimmedCommentBody,
        pullRequestNumber: pullRequest.number,
        repositorySlug: pullRequest.repositorySlug,
      });
      setCommentBody("");
      toast({
        title: "Comment added",
        description: `Posted to ${pullRequest.repo} #${pullRequest.number}.`,
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "DevDeck could not post that GitHub comment.",
      );
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleRequestReviewers = async () => {
    const activeDesktopApi = getDesktopApi();
    if (!pullRequest || !pullRequest.repositorySlug || !activeDesktopApi) {
      return;
    }

    if (reviewerLogins.length === 0) {
      setActionError("Enter at least one reviewer login.");
      return;
    }

    setActionError(null);
    setIsSubmittingReviewers(true);
    try {
      await activeDesktopApi.requestPullRequestReviewers({
        pullRequestNumber: pullRequest.number,
        repositorySlug: pullRequest.repositorySlug,
        reviewers: reviewerLogins,
      });
      setReviewerInput("");
      toast({
        title: "Reviewers requested",
        description: `Updated ${pullRequest.repo} #${pullRequest.number}.`,
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "DevDeck could not request those reviewers.",
      );
    } finally {
      setIsSubmittingReviewers(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,840px)] max-w-[min(92vw,52rem)] overflow-hidden border-border/60 bg-white/95 p-0 backdrop-blur-md">
        {pullRequest && (
          <div className="flex min-h-0 min-w-0 flex-col">
            <DialogHeader className="space-y-4 border-b border-border/60 px-6 pb-5 pt-6 pr-14">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {signalBadges.map((badge) => (
                    <span
                      key={badge.label}
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleOpenPullRequest()}
                    className="h-9 gap-1.5"
                  >
                    <Github className="w-3.5 h-3.5" />
                    View
                  </Button>
                  <PullRequestQueueControl
                    className="h-9"
                    onStatusChange={(status) => {
                      if (!pullRequest) {
                        return;
                      }

                      setPullRequestWatchStatus(pullRequest.id, status);
                      toast({
                        title: status
                          ? `PR ${status.replaceAll("_", " ")}`
                          : "Removed from queue",
                        description: `${pullRequest.repo} #${pullRequest.number} ${
                          status
                            ? `is now ${status.replaceAll("_", " ")} in your queue.`
                            : "was removed from your local queue."
                        }`,
                      });
                    }}
                    status={watchStatus || null}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl leading-snug break-words">
                  #{pullRequest.number} {pullRequest.title}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {pullRequest.repo} · updated{" "}
                  {formatDistanceToNow(new Date(pullRequest.updatedAt), {
                    addSuffix: true,
                  })}
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="w-3.5 h-3.5 text-primary" />
                  Branch Routing
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Head branch</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyBranch(pullRequest.headBranch)}
                      className="min-w-0 max-w-[65%] break-all text-right font-mono text-foreground transition hover:text-primary hover:underline"
                      title={`Copy ${pullRequest.headBranch}`}
                    >
                      {pullRequest.headBranch}
                    </button>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Base branch</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyBranch(pullRequest.baseBranch)}
                      className="min-w-0 max-w-[65%] break-all text-right font-mono text-foreground transition hover:text-primary hover:underline"
                      title={`Copy ${pullRequest.baseBranch}`}
                    >
                      {pullRequest.baseBranch}
                    </button>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Author</span>
                    <span className="min-w-0 max-w-[65%] break-words text-right text-foreground">
                      {pullRequest.authoredByViewer
                        ? "You"
                        : pullRequest.author ?? "Unknown author"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
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
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Total reviewers</span>
                    <span className="font-semibold text-foreground">{pullRequest.reviewCount}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Requested from you</span>
                    <span className="font-semibold text-foreground">
                      {pullRequest.isViewerRequestedReviewer ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Reviewed by you</span>
                    <span className="font-semibold text-foreground">
                      {pullRequest.reviewedByViewer ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
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
                          <p className="text-sm font-medium text-foreground break-words">
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  GitHub Comment
                </div>
                <Textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Leave a follow-up note for the PR thread."
                  className="min-h-[108px] bg-white"
                  disabled={!canRunGitHubActions || isSubmittingComment || isSubmittingReviewers}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Add a comment without leaving DevDeck.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleAddComment()}
                    disabled={
                      !canRunGitHubActions ||
                      isSubmittingComment ||
                      isSubmittingReviewers ||
                      commentBody.trim().length === 0
                    }
                  >
                    {isSubmittingComment ? "Sending..." : "Post Comment"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Request Reviewers
                </div>
                <Input
                  value={reviewerInput}
                  onChange={(event) => setReviewerInput(event.target.value)}
                  placeholder="@manuel, teammate"
                  className="bg-white"
                  disabled={!canRunGitHubActions || isSubmittingComment || isSubmittingReviewers}
                />
                <p className="text-xs text-muted-foreground">
                  Separate GitHub logins with commas or spaces. Existing review requests stay visible above.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {reviewerLogins.length > 0
                      ? `Will request: ${reviewerLogins.join(", ")}`
                      : "Add one or more reviewers to this PR."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRequestReviewers()}
                    disabled={
                      !canRunGitHubActions ||
                      isSubmittingComment ||
                      isSubmittingReviewers ||
                      reviewerLogins.length === 0
                    }
                  >
                    {isSubmittingReviewers ? "Requesting..." : "Request Review"}
                  </Button>
                </div>
              </div>
            </div>

            {!canRunGitHubActions && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                GitHub actions are only available in the desktop app after connecting GitHub in Preferences.
              </div>
            )}

            {actionError && (
              <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
