import {
  getPullRequestCiStatusMeta,
  getPullRequestStatusMeta,
} from "@/lib/pull-request-utils";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  WorkspaceCiStatus,
  WorkspacePullRequestStatus,
} from "@shared/workspace";
import { AlertCircle, Check, CheckCircle2, Circle, Clock } from "lucide-react";

export function PullRequestListStatusIcon({
  className,
  status,
}: {
  className?: string;
  status: WorkspacePullRequestStatus;
}) {
  const statusMeta = getPullRequestStatusMeta(status);
  const icon =
    status === "approved" ? (
      <CheckCircle2 className="h-4 w-4 text-chart-1" />
    ) : status === "changes_requested" ? (
      <AlertCircle className="h-4 w-4 text-chart-3" />
    ) : (
      <Clock className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={statusMeta.label}
          className={cn("inline-flex", className)}
        >
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{statusMeta.label}</TooltipContent>
    </Tooltip>
  );
}

export function PullRequestCiStatusIcon({
  className,
  status,
}: {
  className?: string;
  status: WorkspaceCiStatus;
}) {
  if (status === "unknown") {
    return null;
  }

  const statusMeta = getPullRequestCiStatusMeta(status);
  const icon =
    status === "passing" ? (
      <Check className="h-3.5 w-3.5 text-chart-1" />
    ) : status === "failing" ? (
      <AlertCircle className="h-3.5 w-3.5 text-chart-3" />
    ) : (
      <Circle className="h-3.5 w-3.5 fill-current text-chart-2" />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={statusMeta.label}
          className={cn("inline-flex", className)}
        >
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{statusMeta.label}</TooltipContent>
    </Tooltip>
  );
}
