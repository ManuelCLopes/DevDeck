import type { WorkspaceProject } from "@shared/workspace";
import { getCiStatusMeta, getProjectAttentionMeta } from "@/lib/project-health";
import { navigateInApp } from "@/lib/app-navigation";
import { formatDistanceToNow } from "date-fns";
import { GitBranch, Globe, HardDrive, Link2Off, MessageSquare, Users } from "lucide-react";
import { useLocation } from "wouter";

interface ProjectRowProps {
  project: WorkspaceProject;
}

export default function ProjectRow({ project }: ProjectRowProps) {
  const [, setLocation] = useLocation();
  const projectHref = `/?project=${encodeURIComponent(project.id)}`;
  const ciStatusMeta = getCiStatusMeta(project.ciStatus);
  const attentionMeta = getProjectAttentionMeta(project);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigateInApp(projectHref, setLocation)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigateInApp(projectHref, setLocation);
        }
      }}
      className="flex cursor-pointer items-start gap-4 rounded-md border-b border-border/40 px-4 py-2.5 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:items-center"
      aria-label={`Open ${project.name} overview`}
    >
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
            <div className="flex flex-col gap-1 min-w-0">
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
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${ciStatusMeta.className}`}>
                  {ciStatusMeta.label}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {project.openPullRequestCount} PRs
                </span>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="hidden md:flex col-span-3 lg:col-span-2 flex-col items-end text-[11px] text-muted-foreground font-medium text-right">
            <span>{formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${attentionMeta.className}`}>
              {attentionMeta.label}
            </span>
          </div>
        </div>
      </div>
  );
}
