import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { mockProjects, mockInsights } from "@/lib/mock-data";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectRow from "@/components/dashboard/ProjectRow";
import { 
  LayoutGrid, 
  List, 
  Filter, 
  AlertTriangle, 
  Zap, 
  ArrowUpRight,
  HardDrive
} from "lucide-react";

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterTeam, setFilterTeam] = useState<string | 'All'>('All');
  
  const teams = ['All', ...Array.from(new Set(mockProjects.map(p => p.team)))];
  const filteredProjects = filterTeam === 'All' 
    ? mockProjects 
    : mockProjects.filter(p => p.team === filterTeam);

  const healthyCount = mockProjects.filter(p => p.status === 'healthy').length;
  const warningCount = mockProjects.filter(p => p.status === 'warning').length;
  const criticalCount = mockProjects.filter(p => p.status === 'critical').length;

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Local Dashboard</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> Scanning ~/Developer for active projects.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="bg-secondary/50 p-0.5 rounded-md flex items-center border border-black/5">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-[4px] transition-all shadow-sm ${viewMode === 'grid' ? 'bg-white text-foreground border border-black/5' : 'text-muted-foreground hover:text-foreground bg-transparent border-transparent'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-[4px] transition-all shadow-sm ${viewMode === 'list' ? 'bg-white text-foreground border border-black/5' : 'text-muted-foreground hover:text-foreground bg-transparent border-transparent'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Monitored Repos</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{mockProjects.length}</span>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5">
              <FolderGit2 className="w-24 h-24" />
            </div>
          </div>
          <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Repository Health</h3>
            <div className="flex items-center gap-4 text-sm font-medium mt-auto pb-1">
              <div className="flex items-center gap-1.5 text-chart-1"><div className="w-2 h-2 rounded-full bg-chart-1 shadow-[0_0_8px_rgba(39,201,63,0.5)]" />{healthyCount}</div>
              <div className="flex items-center gap-1.5 text-chart-2"><div className="w-2 h-2 rounded-full bg-chart-2 shadow-[0_0_8px_rgba(255,189,46,0.5)]" />{warningCount}</div>
              <div className="flex items-center gap-1.5 text-chart-3"><div className="w-2 h-2 rounded-full bg-chart-3 shadow-[0_0_8px_rgba(255,95,86,0.5)]" />{criticalCount}</div>
            </div>
          </div>
          <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Local Branches</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">42</span>
              <span className="text-xs text-muted-foreground">12 unpushed</span>
            </div>
          </div>
          <div className="bg-white border border-border/60 rounded-xl p-4 shadow-sm">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pending PRs</h3>
            <div className="flex items-baseline gap-2 mt-auto">
              <span className="text-3xl font-bold tracking-tight">{mockProjects.reduce((acc, p) => acc + p.openPRs, 0)}</span>
              <span className="text-[10px] text-chart-3 font-semibold bg-chart-3/10 px-1.5 py-0.5 rounded-full border border-chart-3/20">
                {mockProjects.reduce((acc, p) => acc + p.stalePRs, 0)} stale
              </span>
            </div>
          </div>
        </div>

        {/* Actionable Insights */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold tracking-tight">System Signals</h2>
            <div className="h-px flex-1 bg-border/50 ml-2"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-background border border-red-100 dark:border-red-900/30 rounded-xl p-4 relative overflow-hidden group hover:border-red-200 transition-colors cursor-pointer shadow-sm">
              <div className="flex items-start gap-3">
                <div className="bg-white dark:bg-black/20 p-1.5 rounded-lg text-red-500 shadow-sm border border-red-100 dark:border-red-900/30">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-700 dark:text-red-400 mb-0.5 text-sm">{mockInsights.needsAttention[0].title}</h3>
                  <p className="text-xs text-muted-foreground/80">{mockInsights.needsAttention[0].description}</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-red-500 absolute top-4 right-4 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 relative overflow-hidden group hover:border-blue-200 transition-colors cursor-pointer shadow-sm">
              <div className="flex items-start gap-3">
                <div className="bg-white dark:bg-black/20 p-1.5 rounded-lg text-blue-500 shadow-sm border border-blue-100 dark:border-blue-900/30">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-0.5 text-sm">{mockInsights.recentHighlights[0].title}</h3>
                  <p className="text-xs text-muted-foreground/80">{mockInsights.recentHighlights[0].description}</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-blue-500 absolute top-4 right-4 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
            </div>
          </div>
        </section>

        {/* Projects View */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">Active Projects</h2>
              <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-border">
                {filteredProjects.length}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
              <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1 flex-shrink-0" />
              {teams.map(team => (
                <button
                  key={team}
                  onClick={() => setFilterTeam(team)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-all border ${
                    filterTeam === team 
                      ? 'bg-foreground text-background border-foreground shadow-sm' 
                      : 'bg-white text-muted-foreground hover:text-foreground border-border hover:border-black/20'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-border/60 rounded-xl px-4 py-1 shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-4 py-2.5 border-b border-border/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4 lg:col-span-3 ml-5">Repository</div>
                <div className="col-span-3 lg:col-span-2">Pull Requests</div>
                <div className="col-span-2 lg:col-span-2">Issues</div>
                <div className="hidden lg:block col-span-3">Status / Release</div>
                <div className="col-span-3 lg:col-span-2 text-right">Last Updated</div>
              </div>
              <div className="flex flex-col">
                {filteredProjects.map((project) => (
                  <ProjectRow key={project.id} project={project} />
                ))}
              </div>
            </div>
          )}
          
          {filteredProjects.length === 0 && (
            <div className="text-center py-12 bg-white border border-border/50 border-dashed rounded-xl mt-4">
              <p className="text-muted-foreground text-sm">No projects found for {filterTeam}.</p>
            </div>
          )}
        </section>

      </div>
    </AppLayout>
  );
}
// Adding missing import dynamically
import { FolderGit2 } from "lucide-react";