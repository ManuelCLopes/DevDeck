import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { FolderGit2, Github, CheckCircle2 } from "lucide-react";

export default function Settings() {
  const [connected, setConnected] = useState(false);

  return (
    <AppLayout>
      <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Settings & Integrations</h1>
          <p className="text-muted-foreground text-sm">Configure your data sources and dashboard preferences.</p>
        </div>

        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border/50">
            <h2 className="text-lg font-medium tracking-tight mb-1">Data Sources</h2>
            <p className="text-sm text-muted-foreground">Connect platforms to sync project data automatically.</p>
          </div>
          
          <div className="p-6 space-y-6">
            {/* GitHub Integration */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-lg border border-border/50 bg-secondary/20">
              <div className="flex items-start gap-4">
                <div className="bg-background p-2 rounded-md border border-border shadow-sm">
                  <Github className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    GitHub
                    {connected && <span className="text-[10px] bg-chart-1/10 text-chart-1 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">Sync repositories, pull requests, issues, and releases.</p>
                </div>
              </div>
              <button 
                onClick={() => setConnected(!connected)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  connected 
                    ? "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80" 
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {connected ? "Configure" : "Connect GitHub"}
              </button>
            </div>

            {/* Local Directory */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-lg border border-border/50 bg-secondary/20">
              <div className="flex items-start gap-4">
                <div className="bg-background p-2 rounded-md border border-border shadow-sm">
                  <FolderGit2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">Local Monorepo</h3>
                  <p className="text-sm text-muted-foreground mt-1">Scan a local directory to discover packages and projects.</p>
                </div>
              </div>
              <button className="px-4 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 whitespace-nowrap">
                Select Directory
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border/50">
            <h2 className="text-lg font-medium tracking-tight mb-1">Dashboard Preferences</h2>
            <p className="text-sm text-muted-foreground">Customize what signals appear on your overview.</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {[
                { id: "stale-prs", label: "Highlight Stale PRs", desc: "Flag pull requests that have no activity for > 5 days." },
                { id: "failing-builds", label: "Alert on Failing Builds", desc: "Show critical alerts for default branch failures." },
                { id: "inactive-repos", label: "Track Inactive Projects", desc: "Identify repositories with no commits in 30 days." }
              ].map(setting => (
                <div key={setting.id} className="flex items-start justify-between gap-4 py-3 border-b border-border/30 last:border-0 last:pb-0">
                  <div>
                    <label htmlFor={setting.id} className="font-medium text-sm text-foreground cursor-pointer">{setting.label}</label>
                    <p className="text-sm text-muted-foreground">{setting.desc}</p>
                  </div>
                  <div className="pt-1">
                    {/* Basic toggle switch mockup */}
                    <div className="w-10 h-5 bg-primary rounded-full relative cursor-pointer">
                      <div className="w-4 h-4 bg-background rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}