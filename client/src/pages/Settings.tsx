import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import GitHubConnectDialog from "@/components/settings/GitHubConnectDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type AppPreferences, useAppPreferences } from "@/lib/app-preferences";
import { getDesktopApi } from "@/lib/desktop";
import { getGitHubStatusMeta } from "@/lib/github-status";
import { formatDistanceToNow } from "date-fns";
import {
  Github,
  HardDrive,
  RotateCcw,
  Shield,
} from "lucide-react";
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
  const { data: snapshot, isFetching, refetch } = useWorkspaceSnapshot();
  const { preferences, setPreference } = useAppPreferences();
  const [isGitHubConnectOpen, setIsGitHubConnectOpen] = useState(false);
  const workspaceSelection = getWorkspaceSelection();
  const monitoredDirectories = getMonitoredDirectoryLabels(workspaceSelection);
  const githubStatus = snapshot?.githubStatus;
  const connected = githubStatus?.authenticated ?? false;
  const githubStatusMeta = getGitHubStatusMeta(githubStatus);
  const githubState = githubStatus?.state ?? "unsupported";
  const desktopApi = getDesktopApi();

  const handleResetOnboarding = () => {
    clearCompletedOnboarding();
    clearWorkspaceSelection();
    void clearWorkspaceHandle();
    void queryClient.removeQueries({ queryKey: ["workspace", "snapshot"] });
    setLocation('/onboarding');
  };

  const handleToggleLaunchAtLogin = async (checked: boolean) => {
    setPreference("launchAtLogin", checked);
    await desktopApi?.setLaunchAtLogin?.(checked);
  };

  const handleDisconnectGitHub = async () => {
    await desktopApi?.clearGitHubToken?.();
    await refetch();
  };

  const lastWorkspaceSyncLabel = snapshot
    ? formatDistanceToNow(new Date(snapshot.generatedAt), { addSuffix: true })
    : "No workspace snapshot yet";
  const toggleSettings: Array<{
    desc: string;
    id: Exclude<
      keyof AppPreferences,
      "autoRefreshEnabled" | "autoRefreshIntervalSeconds"
    >;
    label: string;
  }> = [
    {
      desc: "Keep stale local review branches visually flagged across the app.",
      id: "highlightStalePrs",
      label: "Highlight Stale PRs",
    },
    {
      desc: "Check for updates whenever the DevDeck window becomes active again.",
      id: "refreshOnWindowFocus",
      label: "Refresh on Focus",
    },
    {
      desc: "Show native notifications when a PR is waiting for its first review.",
      id: "notifyReviewRequired",
      label: "Notify on Review Required",
    },
    {
      desc: "Alert when a pull request receives changes requested.",
      id: "notifyChangesRequested",
      label: "Notify on Changes Requested",
    },
    {
      desc: "Alert when a pull request gets approved.",
      id: "notifyApproved",
      label: "Notify on Approval",
    },
    {
      desc: "Show native desktop notifications for default branch failures.",
      id: "alertFailingBuilds",
      label: "Alert on Failing Builds",
    },
    {
      desc: "Start DevDeck automatically when you sign in to macOS.",
      id: "launchAtLogin",
      label: "Launch at Login",
    },
  ];

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
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${githubStatusMeta.className}`}>
                        {githubStatusMeta.label}
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      DevDeck stores your GitHub credential locally and uses the
                      GitHub API directly for pull request, reviewer, and commit
                      status data.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {githubStatus?.message ?? "GitHub status will appear after the first workspace scan."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Viewer: {githubStatus?.viewerLogin ?? "Not authenticated"} · Connected repos: {githubStatus?.connectedRepositoryCount ?? 0}
                    </p>
                    {githubState === "unsupported" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Direct GitHub connection is available in the desktop app build.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-foreground border border-border hover:bg-secondary/50 whitespace-nowrap shadow-sm transition-colors"
                  >
                    {isFetching ? "Refreshing..." : "Refresh Status"}
                  </button>
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectGitHub()}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-foreground border border-border hover:bg-secondary/50 whitespace-nowrap shadow-sm transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsGitHubConnectOpen(true)}
                      disabled={githubState === "unsupported"}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground border border-primary hover:bg-primary/90 whitespace-nowrap shadow-sm transition-colors disabled:opacity-50"
                    >
                      {githubState === "unsupported"
                        ? "Desktop Only"
                        : githubState === "error"
                          ? "Reconnect GitHub"
                          : "Connect GitHub"}
                    </button>
                  )}
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
              <div className="p-3 rounded-md border border-border/50 bg-secondary/20 space-y-4 mb-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm text-foreground">Auto Refresh Workspace</p>
                    <p className="text-xs text-muted-foreground">
                      Keep local Git and GitHub metadata fresh without leaving the app open on manual refresh.
                    </p>
                  </div>
                  <Switch
                    id="autoRefreshEnabled"
                    checked={preferences.autoRefreshEnabled}
                    onCheckedChange={(checked) =>
                      setPreference("autoRefreshEnabled", checked)
                    }
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Refresh Cadence
                    </p>
                    <Select
                      value={String(preferences.autoRefreshIntervalSeconds)}
                      onValueChange={(value) =>
                        setPreference("autoRefreshIntervalSeconds", Number(value))
                      }
                      disabled={!preferences.autoRefreshEnabled}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Choose interval" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">Every 30 seconds</SelectItem>
                        <SelectItem value="60">Every minute</SelectItem>
                        <SelectItem value="120">Every 2 minutes</SelectItem>
                        <SelectItem value="300">Every 5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Last Workspace Sync
                    </p>
                    <div className="rounded-md border border-border/60 bg-white px-3 py-2 text-sm text-foreground shadow-sm">
                      {lastWorkspaceSyncLabel}
                    </div>
                  </div>
                </div>
              </div>
              {toggleSettings.map((setting) => (
                <div key={setting.id} className="flex items-center justify-between gap-4 p-3 rounded-md hover:bg-secondary/30 transition-colors">
                  <div>
                    <label htmlFor={setting.id} className="font-medium text-sm text-foreground cursor-pointer">{setting.label}</label>
                    <p className="text-xs text-muted-foreground">{setting.desc}</p>
                  </div>
                  <Switch
                    id={setting.id}
                    checked={preferences[setting.id]}
                    onCheckedChange={(checked) => {
                      if (setting.id === "launchAtLogin") {
                        void handleToggleLaunchAtLogin(checked);
                        return;
                      }

                      setPreference(setting.id, checked);
                    }}
                  />
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
      <GitHubConnectDialog
        open={isGitHubConnectOpen}
        onOpenChange={setIsGitHubConnectOpen}
        onConnected={() => {
          void refetch();
        }}
      />
    </AppLayout>
  );
}
