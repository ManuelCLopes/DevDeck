import { Bookmark, CheckCheck, ChevronDown, Undo2 } from "lucide-react";
import type { PullRequestWatchStatus } from "@/lib/pull-request-watchlist";
import { getPullRequestWatchStatusMeta } from "@/lib/pull-request-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PullRequestQueueControlProps {
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
  className,
  mode = "open",
  onStatusChange,
  status,
}: PullRequestQueueControlProps) {
  const TriggerIcon = getQueueStatusIcon(status);
  const statusMeta = status ? getPullRequestWatchStatusMeta(status) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors ${
            statusMeta
              ? `${statusMeta.className} hover:brightness-[0.98]`
              : "border-border/60 bg-white text-foreground hover:bg-black/5"
          } ${className ?? ""}`}
        >
          <TriggerIcon className="h-3.5 w-3.5" />
          {getQueueButtonLabel(status)}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {mode === "queue" ? (
          <>
            <DropdownMenuItem onSelect={() => onStatusChange("reviewed")}>
              <CheckCheck className="h-4 w-4" />
              Reviewed
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStatusChange(null)}>
              <Undo2 className="h-4 w-4" />
              Unmark
            </DropdownMenuItem>
          </>
        ) : status ? (
          <DropdownMenuItem onSelect={() => onStatusChange(null)}>
            <Undo2 className="h-4 w-4" />
            Unmark
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onStatusChange("marked")}>
            <Bookmark className="h-4 w-4" />
            Mark to Review
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
