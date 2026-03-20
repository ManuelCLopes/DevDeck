import type { WorkspaceProject } from "@shared/workspace";
import { getCiStatusMeta, getProjectAttentionSummary } from "@/lib/project-health";
import {
  GitBranch,
  Globe,
  HardDrive,
  Link2Off,
  MessageSquare,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";

interface ProjectCardProps {
  project: WorkspaceProject;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const [, setLocation] = useLocation();
  const statusColors = {
    healthy: "bg-chart-1/10 text-chart-1 border-chart-1/20",
    warning: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    critical: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  };
  const projectHref = `/?project=${encodeURIComponent(project.id)}`;
  const ciStatusMeta = getCiStatusMeta(project.ciStatus);
  const attentionSummary = getProjectAttentionSummary(project);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setLocation(projectHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setLocation(projectHref);
        }
      }}
      className="block cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label={`Open ${project.name} overview`}
    >
        <div className="flex flex-1 flex-col gap-4 p-4">
          {/* Header */}
          <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground">{project.name}</h3>
                <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-[1px] rounded-sm border ${statusColors[project.status]}`}>
                  {project.status}
                </span>
                <span className="text-[9px] text-muted-foreground/80 font-semibold bg-secondary/80 px-1.5 py-[1px] rounded-sm border border-border/50 uppercase tracking-wider">
                  {project.team}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{project.description}</p>
          </div>

          {/* Local Path */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/80 bg-secondary/50 px-2 py-1 rounded-md border border-border/50">
            <HardDrive className="w-3 h-3" />
            <span className="truncate">{project.localPath}</span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 mt-1">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" /> Branches
              </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">{project.branchCount}</span>
                <span className="min-w-0 truncate text-[10px] text-muted-foreground font-medium">
                  current {project.currentBranch}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Contributors
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{project.contributorCount7d}</span>
                <span className="text-[10px] text-muted-foreground font-medium">last 7d</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Pull Requests
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{project.openPullRequestCount}</span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {project.awaitingReviewCount} waiting
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Attention
              </span>
              <span className="text-sm font-semibold text-foreground capitalize">
                {attentionSummary}
              </span>
            </div>
          </div>

          <div className="flex-1"></div>

          {/* Footer info */}
          <div className="pt-3 mt-1 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between text-[11px] text-muted-foreground font-medium">
            <div className="flex items-center gap-1.5" title="Default branch">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
              <span className="capitalize">{project.defaultBranch}</span>
            </div>

            <div className="flex items-center gap-1.5">
              {project.remoteUrl ? (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  Origin configured
                </>
              ) : (
                <>
                  <Link2Off className="w-3.5 h-3.5" />
                  No origin remote
                </>
              )}
            </div>

            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${ciStatusMeta.className}`}>
              {ciStatusMeta.label}
            </div>
          </div>
        </div>
      </div>
  );
}
