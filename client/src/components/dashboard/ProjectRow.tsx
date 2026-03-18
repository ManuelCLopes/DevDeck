import type { WorkspaceProject } from "@shared/workspace";
import { formatDistanceToNow } from "date-fns";
import { GitBranch, Globe, HardDrive, Link2Off, Users } from "lucide-react";
import { Link } from "wouter";

interface ProjectRowProps {
  project: WorkspaceProject;
}

export default function ProjectRow({ project }: ProjectRowProps) {
  const statusColors = {
    healthy: "bg-chart-1 flex-shrink-0 shadow-[0_0_8px_rgba(39,201,63,0.5)]",
    warning: "bg-chart-2 flex-shrink-0 shadow-[0_0_8px_rgba(255,189,46,0.5)]",
    critical: "bg-chart-3 flex-shrink-0 shadow-[0_0_8px_rgba(255,95,86,0.5)]",
  };
  const projectHref = `/?project=${encodeURIComponent(project.id)}`;

  return (
    <Link href={projectHref}>
      <a
        className="group flex items-center gap-4 py-2.5 px-4 -mx-4 hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-md transition-colors border-b border-border/40 last:border-0 cursor-pointer"
        aria-label={`Open ${project.name} overview`}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${statusColors[project.status]}`} />

        <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
          {/* Project Name & Path */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px] truncate text-foreground">{project.name}</span>
              <span className="text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-sm uppercase tracking-wider hidden sm:block border border-border/50 font-medium">
                {project.team}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate hidden md:flex items-center gap-1 font-mono mt-0.5">
              <HardDrive className="w-2.5 h-2.5" />
              {project.localPath}
            </span>
          </div>

          {/* Branches */}
          <div className="col-span-6 md:col-span-3 lg:col-span-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="w-3.5 h-3.5" />
              <span className="text-[13px] font-semibold text-foreground">{project.branchCount}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {project.currentBranch}
            </span>
          </div>

          {/* Contributors */}
          <div className="col-span-6 md:col-span-2 lg:col-span-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[13px] font-semibold text-foreground">{project.contributorCount7d}</span>
            </div>
          </div>

          {/* Remote */}
          <div className="hidden lg:flex col-span-3 items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {project.remoteUrl ? (
                <Globe className="w-3.5 h-3.5 text-chart-1" />
              ) : (
                <Link2Off className="w-3.5 h-3.5 text-chart-3" />
              )}
              <span className="truncate font-medium">
                {project.remoteUrl ? "Origin configured" : "No remote"}
              </span>
            </div>
          </div>

          {/* Activity */}
          <div className="hidden md:flex col-span-3 lg:col-span-2 justify-end text-[11px] text-muted-foreground font-medium text-right whitespace-nowrap">
            {formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })}
          </div>
        </div>
      </a>
    </Link>
  );
}
