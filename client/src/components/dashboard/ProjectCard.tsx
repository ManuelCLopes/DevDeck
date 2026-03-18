import { formatDistanceToNow } from "date-fns";
import { 
  GitPullRequest, 
  CircleDot, 
  GitCommit, 
  Tag, 
  AlertCircle,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight
} from "lucide-react";
import { Project } from "@/lib/mock-data";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const statusColors = {
    healthy: "bg-chart-1/10 text-chart-1 border-chart-1/20",
    warning: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    critical: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  };

  const buildStatusIcon = {
    success: <CheckCircle2 className="w-3.5 h-3.5 text-chart-1" />,
    failed: <XCircle className="w-3.5 h-3.5 text-chart-3" />,
    building: <Clock className="w-3.5 h-3.5 text-chart-4 animate-pulse" />,
    unknown: <CircleDot className="w-3.5 h-3.5 text-muted-foreground" />
  };

  return (
    <div className="group bg-card border border-border/60 hover:border-border rounded-xl transition-all duration-200 overflow-hidden flex flex-col">
      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-semibold text-base tracking-tight">{project.name}</h3>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${statusColors[project.status]}`}>
                {project.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>
          </div>
          <div className="text-xs text-muted-foreground font-mono bg-secondary/50 px-2 py-1 rounded">
            {project.team}
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 mt-2">
          {/* PRs */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <GitPullRequest className="w-3.5 h-3.5" /> Pull Requests
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-medium">{project.openPRs}</span>
              <span className="text-xs text-muted-foreground">open</span>
              {project.stalePRs > 0 && (
                <span className="text-xs text-chart-3 bg-chart-3/10 px-1.5 py-0.5 rounded font-medium ml-auto">
                  {project.stalePRs} stale
                </span>
              )}
            </div>
          </div>

          {/* Issues */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Issues
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-medium">{project.openIssues}</span>
              <span className="text-xs text-muted-foreground">open</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1"></div>

        {/* Footer info */}
        <div className="pt-4 mt-2 border-t border-border/50 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5" title="Build Status">
            {buildStatusIcon[project.buildStatus]}
            <span className="capitalize">{project.buildStatus}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            {project.latestRelease || 'No release'}
          </div>

          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {project.contributors7d} <span className="hidden sm:inline">in 7d</span>
          </div>
        </div>
      </div>
      
      {/* Bottom action bar that appears on hover */}
      <div className="bg-secondary/30 px-5 py-2.5 flex items-center justify-between border-t border-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground">
          Updated {formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })}
        </span>
        <button className="text-xs font-medium text-foreground flex items-center gap-1 hover:text-primary transition-colors">
          View Details <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}