import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { mockProjects, mockInsights } from "@/lib/mock-data";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectRow from "@/components/dashboard/ProjectRow";
import { LayoutGrid, List, Filter, AlertTriangle, Lightbulb, Zap, ArrowUpRight } from "lucide-react";

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
      <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-10">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Overview</h1>
            <p className="text-muted-foreground text-sm">High-signal insights across your engineering projects.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="bg-secondary border border-border/50 rounded-md p-1 flex items-center">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-sm transition-colors ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-sm transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Total Projects</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{mockProjects.length}</span>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Project Health</h3>
            <div className="flex items-center gap-4 text-sm font-medium">
              <div className="flex items-center gap-1.5 text-chart-1"><div className="w-2 h-2 rounded-full bg-chart-1" />{healthyCount}</div>
              <div className="flex items-center gap-1.5 text-chart-2"><div className="w-2 h-2 rounded-full bg-chart-2" />{warningCount}</div>
              <div className="flex items-center gap-1.5 text-chart-3"><div className="w-2 h-2 rounded-full bg-chart-3" />{criticalCount}</div>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Total Open PRs</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{mockProjects.reduce((acc, p) => acc + p.openPRs, 0)}</span>
              <span className="text-xs text-chart-3 font-medium bg-chart-3/10 px-1.5 py-0.5 rounded">
                {mockProjects.reduce((acc, p) => acc + p.stalePRs, 0)} stale
              </span>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Total Open Issues</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{mockProjects.reduce((acc, p) => acc + p.openIssues, 0)}</span>
            </div>
          </div>
        </div>

        {/* Actionable Insights */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-chart-2" />
            <h2 className="text-lg font-semibold tracking-tight">Signal</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 relative overflow-hidden group hover:bg-destructive/10 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-destructive/20 p-1.5 rounded-md text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-medium text-destructive mb-1 text-sm">{mockInsights.needsAttention[0].title}</h3>
                  <p className="text-sm text-muted-foreground">{mockInsights.needsAttention[0].description}</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-destructive absolute top-5 right-5 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
            </div>

            <div className="bg-chart-4/5 border border-chart-4/20 rounded-xl p-5 relative overflow-hidden group hover:bg-chart-4/10 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-chart-4/20 p-1.5 rounded-md text-chart-4">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-medium text-chart-4 mb-1 text-sm">{mockInsights.recentHighlights[0].title}</h3>
                  <p className="text-sm text-muted-foreground">{mockInsights.recentHighlights[0].description}</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-chart-4 absolute top-5 right-5 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
            </div>
          </div>
        </section>

        {/* Projects View */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-semibold tracking-tight">Active Projects</h2>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
              <Filter className="w-4 h-4 text-muted-foreground mr-1 flex-shrink-0" />
              {teams.map(team => (
                <button
                  key={team}
                  onClick={() => setFilterTeam(team)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    filterTeam === team 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border/50 rounded-xl px-4 py-2 shadow-sm">
              <div className="hidden md:grid grid-cols-12 gap-4 py-3 border-b border-border/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4 lg:col-span-3 ml-5">Project</div>
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
            <div className="text-center py-12 bg-card border border-border border-dashed rounded-xl">
              <p className="text-muted-foreground">No projects found for {filterTeam}.</p>
            </div>
          )}
        </section>

      </div>
    </AppLayout>
  );
}