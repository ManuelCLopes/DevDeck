import AppLayout from "@/components/layout/AppLayout";
import { Github, CheckCircle2, HardDrive, Shield, RotateCcw } from "lucide-react";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { useLocation } from "wouter";
import { clearCompletedOnboarding } from "@/lib/onboarding-state";
import { openAddProjectsDialog } from "@/lib/project-import-events";
import { queryClient } from "@/lib/queryClient";
import { clearWorkspaceHandle } from "@/lib/workspace-handle";
import {
  clearWorkspaceSelection,
  getMonitoredDirectoryLabels,
  getWorkspaceSelection,
} from "@/lib/workspace-selection";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { data: snapshot } = useWorkspaceSnapshot();
  const workspaceSelection = getWorkspaceSelection();
  const monitoredDirectories = getMonitoredDirectoryLabels(workspaceSelection);
  const githubStatus = snapshot?.githubStatus;
  const connected = githubStatus?.authenticated ?? false;

  const handleResetOnboarding = () => {
    clearCompletedOnboarding();
    clearWorkspaceSelection();
    void clearWorkspaceHandle();
    void queryClient.removeQueries({ queryKey: ["workspace", "snapshot"] });
    setLocation('/onboarding');
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Preferences</h1>
          <p className="text-muted-foreground text-sm">Configure DevDeck's local directories and remote connections.</p>
        </div>

        <div className="bg-white border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border/40 bg-secondary/20 flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Local-First Trust Model</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                DevDeck runs directly on your machine. It analyzes your Git repositories locally and does not upload source code to external servers, which keeps the workflow compliance-friendly.
              </p>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Local Directory */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Local Repositories</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border/60 bg-white shadow-sm hover:border-black/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary/50 p-2 rounded-md border border-border">
                    <HardDrive className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Managed Projects</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {workspaceSelection
                        ? `Projects selected from ${workspaceSelection.rootPath ?? workspaceSelection.rootName}.`
                        : "Select folders where your git repositories live."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {monitoredDirectories.map((directory) => (
                        <span
                          key={directory}
                          className="text-[11px] font-mono bg-secondary px-2 py-1 rounded border border-border/50 text-foreground/80"
                        >
                          {directory}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openAddProjectsDialog}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground border border-border hover:bg-black/5 whitespace-nowrap shadow-sm transition-colors"
                >
                  Add Projects...
                </button>
              </div>
            </div>

            {/* GitHub Integration */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Remote Sync (Optional)</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border/60 bg-white shadow-sm hover:border-black/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary/50 p-2 rounded-md border border-border">
                    <Github className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      GitHub Access
                      {connected && <span className="text-[9px] bg-chart-1/10 text-chart-1 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 border border-chart-1/20"><CheckCircle2 className="w-3 h-3" /> Connected</span>}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      DevDeck reads GitHub authentication from GitHub CLI. Use <span className="font-mono">gh auth login</span> in your terminal to enable live pull request sync.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {githubStatus?.message ?? "GitHub status will appear after the first workspace scan."}
                    </p>
                  </div>
                </div>
                <div
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm whitespace-nowrap ${
                    connected
                      ? "bg-white text-foreground border border-border"
                      : "bg-secondary text-secondary-foreground border border-border"
                  }`}
                >
                  {connected ? "Connected via GitHub CLI" : "Awaiting gh auth login"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border/40">
            <h2 className="text-sm font-semibold tracking-tight mb-0.5">Application Preferences</h2>
            <p className="text-xs text-muted-foreground">Customize UI behavior and local notifications.</p>
          </div>
          <div className="p-2">
            <div className="space-y-1">
              {[
                { id: "stale-prs", label: "Highlight Stale PRs", desc: "Flag pull requests that have no activity for > 5 days." },
                { id: "failing-builds", label: "Alert on Failing Builds", desc: "Show native desktop notifications for default branch failures." },
                { id: "launch-login", label: "Launch at Login", desc: "Start DevDeck automatically in the menu bar." }
              ].map(setting => (
                <div key={setting.id} className="flex items-center justify-between gap-4 p-3 rounded-md hover:bg-secondary/30 transition-colors">
                  <div>
                    <label htmlFor={setting.id} className="font-medium text-sm text-foreground cursor-pointer">{setting.label}</label>
                    <p className="text-xs text-muted-foreground">{setting.desc}</p>
                  </div>
                  <div className="pr-2">
                    {/* Native-looking Mac toggle switch mockup */}
                    <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer shadow-inner border border-black/10">
                      <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-[0_2px_4px_rgba(0,0,0,0.2)] border border-black/5"></div>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="pt-4 mt-2 border-t border-border/40">
                <div className="flex items-center justify-between gap-4 p-3 rounded-md hover:bg-secondary/30 transition-colors">
                  <div>
                    <p className="font-medium text-sm text-foreground">Reset Onboarding</p>
                    <p className="text-xs text-muted-foreground">Show the welcome screens again.</p>
                  </div>
                  <button 
                    onClick={handleResetOnboarding}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-border hover:bg-secondary shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart Tour
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
