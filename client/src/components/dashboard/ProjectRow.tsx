import { Project } from "@/lib/mock-data";
import { formatDistanceToNow } from "date-fns";
import { GitPullRequest, AlertCircle, Clock, CheckCircle2, XCircle, CircleDot } from "lucide-react";

interface ProjectRowProps {
  project: Project;
}

export default function ProjectRow({ project }: ProjectRowProps) {
  const statusColors = {
    healthy: "bg-chart-1 flex-shrink-0",
    warning: "bg-chart-2 flex-shrink-0",
    critical: "bg-chart-3 flex-shrink-0",
  };

  const buildStatusIcon = {
    success: <CheckCircle2 className="w-4 h-4 text-chart-1" />,
    failed: <XCircle className="w-4 h-4 text-chart-3" />,
    building: <Clock className="w-4 h-4 text-chart-4 animate-pulse" />,
    unknown: <CircleDot className="w-4 h-4 text-muted-foreground" />
  };

  return (
    <div className="group flex items-center gap-4 py-3 px-4 -mx-4 hover:bg-muted/30 rounded-lg transition-colors border-b border-border/40 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full ${statusColors[project.status]}`} />
      
      <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
        {/* Project Name & Team */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{project.name}</span>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded uppercase tracking-wider hidden sm:block">
              {project.team}
            </span>
          </div>
          <span className="text-xs text-muted-foreground truncate hidden md:block">
            {project.description}
          </span>
        </div>

        {/* PRs */}
        <div className="col-span-6 md:col-span-3 lg:col-span-2 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitPullRequest className="w-3.5 h-3.5" />
            <span className="text-sm font-medium text-foreground">{project.openPRs}</span>
          </div>
          {project.stalePRs > 0 && (
            <span className="text-[10px] font-medium text-chart-3 bg-chart-3/10 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {project.stalePRs} stale
            </span>
          )}
        </div>

        {/* Issues */}
        <div className="col-span-6 md:col-span-2 lg:col-span-2 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-sm font-medium text-foreground">{project.openIssues}</span>
          </div>
          {project.staleIssues > 0 && (
            <span className="text-[10px] font-medium text-chart-2 bg-chart-2/10 px-1.5 py-0.5 rounded">
              {project.staleIssues} stale
            </span>
          )}
        </div>

        {/* Build & Release */}
        <div className="hidden lg:flex col-span-3 items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm w-24">
            {buildStatusIcon[project.buildStatus]}
            <span className="capitalize text-muted-foreground text-xs">{project.buildStatus}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {project.latestRelease || 'No release'}
          </div>
        </div>

        {/* Activity */}
        <div className="hidden md:flex col-span-3 lg:col-span-2 justify-end text-xs text-muted-foreground text-right whitespace-nowrap">
          {formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}