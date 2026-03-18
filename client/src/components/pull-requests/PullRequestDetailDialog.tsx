import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Copy, GitBranch, Github, User2, Users } from "lucide-react";
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
  getPullRequestReviewSummary,
  getPullRequestStatusMeta,
} from "@/lib/pull-request-utils";
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
  const statusMeta = pullRequest
    ? getPullRequestStatusMeta(pullRequest.status)
    : null;
  const reviewSummary = pullRequest
    ? getPullRequestReviewSummary(pullRequest)
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
