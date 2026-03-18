import { formatDistanceToNow } from "date-fns";
import { 
  GitPullRequest, 
  CircleDot, 
  Tag, 
  AlertCircle,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive
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
    <div className="group bg-white border border-border/60 hover:border-black/20 hover:shadow-md rounded-xl transition-all duration-200 overflow-hidden flex flex-col relative">
      <div className="p-4 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-[15px] tracking-tight text-foreground">{project.name}</h3>
              <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-[1px] rounded-sm border ${statusColors[project.status]}`}>
                {project.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{project.description}</p>
          </div>
        </div>

        {/* Local Path */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/80 bg-secondary/50 px-2 py-1 rounded-md border border-border/50">
          <HardDrive className="w-3 h-3" />
          <span className="truncate">{project.localPath}</span>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 mt-1">
          {/* PRs */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <GitPullRequest className="w-3.5 h-3.5" /> Pull Requests
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">{project.openPRs}</span>
              <span className="text-[10px] text-muted-foreground font-medium">open</span>
            </div>
          </div>

          {/* Issues */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Issues
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">{project.openIssues}</span>
              <span className="text-[10px] text-muted-foreground font-medium">open</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1"></div>

        {/* Footer info */}
        <div className="pt-3 mt-1 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between text-[11px] text-muted-foreground font-medium">
          <div className="flex items-center gap-1.5" title="Build Status">
            {buildStatusIcon[project.buildStatus]}
            <span className="capitalize">{project.buildStatus}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            {project.latestRelease || 'No release'}
          </div>
        </div>
      </div>
      
      {/* Top right team badge */}
      <div className="absolute top-4 right-4">
        <div className="text-[10px] text-muted-foreground/80 font-semibold bg-secondary/80 px-2 py-0.5 rounded-sm border border-border/50 uppercase tracking-wider">
          {project.team}
        </div>
      </div>
    </div>
  );
}