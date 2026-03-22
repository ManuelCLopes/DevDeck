import { Bookmark, CheckCheck, ChevronDown, ListChecks, MinusCircle } from "lucide-react";
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
  onStatusChange: (status: PullRequestWatchStatus | null) => void;
  status: PullRequestWatchStatus | null;
}

function getQueueStatusIcon(status: PullRequestWatchStatus | null) {
  switch (status) {
    case "in_review":
      return ListChecks;
    case "done":
      return CheckCheck;
    default:
      return Bookmark;
  }
}

function getQueueButtonLabel(status: PullRequestWatchStatus | null) {
  switch (status) {
    case "in_review":
      return "In Review";
    case "done":
      return "Done";
    case "marked":
      return "Marked";
    default:
      return "Queue";
  }
}

export default function PullRequestQueueControl({
  className,
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
        <DropdownMenuItem onSelect={() => onStatusChange("marked")}>
          <Bookmark className="h-4 w-4" />
          Marked
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStatusChange("in_review")}>
          <ListChecks className="h-4 w-4" />
          In Review
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStatusChange("done")}>
          <CheckCheck className="h-4 w-4" />
          Done
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStatusChange(null)}>
          <MinusCircle className="h-4 w-4" />
          Clear
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
