import AppLayout from "@/components/layout/AppLayout";
import { mockPullRequests, mockReviewMetrics } from "@/lib/mock-data";
import { formatDistanceToNow } from "date-fns";
import { 
  GitPullRequest, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  GitCommit,
  User,
  ArrowRight,
  Zap
} from "lucide-react";

export default function Reviews() {
  const needsAction = mockPullRequests.filter(pr => 
    pr.role === 'reviewer' && (pr.status === 'needs_review' || pr.status === 'updated')
  );
  
  const waiting = mockPullRequests.filter(pr => 
    (pr.role === 'reviewer' && pr.status === 'changes_requested') || 
    (pr.role === 'author' && pr.status === 'needs_review')
  );

  const ready = mockPullRequests.filter(pr => pr.status === 'approved');

  const StatusIcon = ({ status, role }: { status: string, role: string }) => {
    switch (status) {
      case 'needs_review':
        return role === 'reviewer' ? <AlertCircle className="w-4 h-4 text-chart-2" /> : <Clock className="w-4 h-4 text-muted-foreground" />;
      case 'updated':
        return <Zap className="w-4 h-4 text-chart-4" />;
      case 'changes_requested':
        return <MessageSquare className="w-4 h-4 text-chart-3" />;
      case 'approved':
        return <CheckCircle2 className="w-4 h-4 text-chart-1" />;
      default:
        return <GitPullRequest className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const PRRow = ({ pr }: { pr: typeof mockPullRequests[0] }) => {
    return (
      <div className="group flex items-start gap-3 py-3 px-4 -mx-4 hover:bg-black/[0.03] rounded-md transition-colors border-b border-border/40 last:border-0 cursor-pointer">
        <div className="mt-0.5">
          <StatusIcon status={pr.status} role={pr.role} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[13px] text-foreground truncate">{pr.title}</span>
              {pr.actionableInsight && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm whitespace-nowrap border ${
                  pr.status === 'updated' ? 'bg-chart-4/10 text-chart-4 border-chart-4/20' :
                  pr.status === 'needs_review' && pr.role === 'reviewer' ? 'bg-chart-2/10 text-chart-2 border-chart-2/20' :
                  pr.status === 'approved' ? 'bg-chart-1/10 text-chart-1 border-chart-1/20' :
                  'bg-secondary text-muted-foreground border-border/60'
                }`}>
                  {pr.actionableInsight}
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
              {formatDistanceToNow(new Date(pr.updatedAt), { addSuffix: true })}
            </span>
          </div>
          
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground mt-1">
            <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50 text-foreground/80">
              {pr.repo}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {pr.author}
            </span>
            <span className="flex items-center gap-1 text-chart-1">
              +{pr.linesAdded}
            </span>
            <span className="flex items-center gap-1 text-chart-3">
              -{pr.linesRemoved}
            </span>
            {pr.unresolvedThreads > 0 && (
              <span className="flex items-center gap-1 text-chart-2 font-medium">
                <MessageSquare className="w-3 h-3" /> {pr.unresolvedThreads} unresolved
              </span>
            )}
          </div>
        </div>
        
        <div className="opacity-0 group-hover:opacity-100 transition-opacity pl-2 flex items-center">
          <button className="p-1.5 bg-white border border-border shadow-sm rounded-md text-foreground hover:bg-secondary transition-colors">
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Code Reviews</h1>
          <p className="text-muted-foreground text-sm">DevDeck keeps pull request management and review cycles in one place.</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pending Review Load</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">{mockReviewMetrics.pendingLoad}</span>
              <span className="text-xs text-muted-foreground">PRs</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Completed This Week</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight text-chart-1">{mockReviewMetrics.completedThisWeek}</span>
              <span className="text-xs text-muted-foreground">Reviews</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Avg Turnaround</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">{mockReviewMetrics.averageTurnaround}</span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm flex flex-col">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Blocked / Waiting</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">{mockReviewMetrics.waitingOnAuthor}</span>
              <span className="text-xs text-muted-foreground">PRs</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Action Area */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Needs Action */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">Action Required</h2>
                  <span className="bg-chart-2/10 text-chart-2 text-[10px] px-1.5 py-0.5 rounded-sm font-bold border border-chart-2/20">
                    {needsAction.length}
                  </span>
                </div>
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl px-4 py-1 shadow-sm overflow-hidden">
                <div className="flex flex-col">
                  {needsAction.map((pr) => (
                    <PRRow key={pr.id} pr={pr} />
                  ))}
                  {needsAction.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm">You're all caught up!</div>
                  )}
                </div>
              </div>
            </section>

            {/* Ready / Approved */}
            {ready.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">Ready to Merge</h2>
                    <span className="bg-chart-1/10 text-chart-1 text-[10px] px-1.5 py-0.5 rounded-sm font-bold border border-chart-1/20">
                      {ready.length}
                    </span>
                  </div>
                </div>
                <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl px-4 py-1 shadow-sm overflow-hidden">
                  <div className="flex flex-col">
                    {ready.map((pr) => (
                      <PRRow key={pr.id} pr={pr} />
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Secondary Area */}
          <div className="space-y-8">
            
            {/* Waiting on others */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Pending Dependencies</h2>
                <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-sm font-bold border border-border/60">
                  {waiting.length}
                </span>
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-border/60 rounded-xl p-4 shadow-sm">
                <div className="space-y-4">
                  {waiting.map(pr => (
                    <div key={pr.id} className="group relative">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">
                          <StatusIcon status={pr.status} role={pr.role} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">{pr.title}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground font-mono truncate mr-2">{pr.repo}</span>
                            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap bg-secondary px-1 py-0.5 rounded">
                              {pr.role === 'author' ? 'Waiting for review' : 'Waiting on author'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
