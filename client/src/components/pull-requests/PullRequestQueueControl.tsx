import { Bookmark, CheckCheck, Clock3 } from "lucide-react";
import {
  getPullRequestQueueStatusMeta,
  type PullRequestQueueStatus,
} from "@/lib/pull-request-utils";

interface PullRequestQueueControlProps {
  claimedReviewerLogin?: string | null;
  className?: string;
  onClaimChange?: (claimed: boolean) => void;
  status: PullRequestQueueStatus | null;
}

function getQueueStatusIcon(status: PullRequestQueueStatus | null) {
  if (status === "awaiting_follow_up") {
    return Clock3;
  }

  return status === "reviewed" ? CheckCheck : Bookmark;
}

function getQueueButtonLabel(
  status: PullRequestQueueStatus | null,
  claimedReviewerLogin?: string | null,
) {
  if (claimedReviewerLogin && !status) {
    return `Claimed by ${claimedReviewerLogin}`;
  }

  switch (status) {
    case "awaiting_follow_up":
      return "Awaiting Follow-Up";
    case "reviewed":
      return "Reviewed";
    case "claimed":
      return "Claimed";
    default:
      return "Claim";
  }
}

export default function PullRequestQueueControl({
  claimedReviewerLogin = null,
  className,
  onClaimChange,
  status,
}: PullRequestQueueControlProps) {
  const TriggerIcon = getQueueStatusIcon(status);
  const statusMeta = status ? getPullRequestQueueStatusMeta(status) : null;
  const isClaimOwnedByOther = Boolean(claimedReviewerLogin && !status);
  const isInteractive = Boolean(onClaimChange) && (status === null || status === "claimed");

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={() => {
        if (!onClaimChange) {
          return;
        }

        onClaimChange(status !== "claimed");
      }}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors ${
        statusMeta
          ? `${statusMeta.className} ${isInteractive ? "hover:brightness-[0.98]" : ""}`
          : isClaimOwnedByOther
            ? "border-border/60 bg-secondary text-muted-foreground"
            : "border-border/60 bg-white text-foreground hover:bg-black/5"
      } ${!isInteractive ? "cursor-default" : ""} ${className ?? ""}`}
      title={
        isClaimOwnedByOther
          ? `${claimedReviewerLogin} claimed this review`
          : status === "claimed"
            ? "Remove your claim"
            : status
              ? undefined
              : "Claim this review"
      }
    >
      <TriggerIcon className="h-3.5 w-3.5" />
      {getQueueButtonLabel(status, claimedReviewerLogin)}
    </button>
  );
}
