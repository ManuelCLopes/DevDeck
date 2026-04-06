import { Bookmark, CheckCheck } from "lucide-react";
import type { PullRequestWatchStatus } from "@/lib/pull-request-watchlist";
import { getPullRequestWatchStatusMeta } from "@/lib/pull-request-utils";

interface PullRequestQueueControlProps {
  awaitingFollowUp?: boolean;
  className?: string;
  mode?: "open" | "queue";
  onStatusChange: (status: PullRequestWatchStatus | null) => void;
  status: PullRequestWatchStatus | null;
}

function getQueueStatusIcon(status: PullRequestWatchStatus | null) {
  return status === "reviewed" ? CheckCheck : Bookmark;
}

function getQueueButtonLabel(status: PullRequestWatchStatus | null) {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "marked":
      return "Marked";
    default:
      return "Mark";
  }
}

export default function PullRequestQueueControl({
  awaitingFollowUp = false,
  className,
  mode: _mode = "open",
  onStatusChange,
  status,
}: PullRequestQueueControlProps) {
  const TriggerIcon = getQueueStatusIcon(status);
  const derivedStatus =
    status === "reviewed" && awaitingFollowUp ? "awaiting_follow_up" : status;
  const statusMeta = derivedStatus ? getPullRequestWatchStatusMeta(derivedStatus) : null;
  const nextStatus = status ? null : "marked";

  return (
    <button
      type="button"
      onClick={() => onStatusChange(nextStatus)}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors ${
        statusMeta
          ? `${statusMeta.className} hover:brightness-[0.98]`
          : "border-border/60 bg-white text-foreground hover:bg-black/5"
      } ${className ?? ""}`}
      title={status ? "Remove from your queue" : "Mark to review later"}
    >
      <TriggerIcon className="h-3.5 w-3.5" />
      {derivedStatus === "awaiting_follow_up"
        ? "Awaiting Follow-Up"
        : getQueueButtonLabel(status)}
    </button>
  );
}
