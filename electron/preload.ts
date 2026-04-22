import { contextBridge, ipcRenderer } from "electron";
import type {
  GitHubRepositoryCandidate,
  GitHubTeamCandidate,
  TeamInsightsSnapshot,
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "../shared/workspace";
import type {
  CreateGitWorktreeSessionResult,
} from "../shared/sessions";
import type { WorkspaceMonitorPreferences } from "../shared/workspace-monitor";

interface WorkspaceMonitorState {
  preferences: WorkspaceMonitorPreferences & {
    autoRefreshEnabled: boolean;
    autoRefreshIntervalSeconds: number;
    keepRunningInBackground: boolean;
    refreshOnWindowFocus: boolean;
    showMenuBarIcon: boolean;
  };
  selection: WorkspaceSelection | null;
}

const e2eBootstrapSelection = process.env.DEVDECK_E2E_BOOTSTRAP_SELECTION;
if (e2eBootstrapSelection) {
  try {
    window.localStorage.setItem(
      "devdeck_workspace_selection",
      e2eBootstrapSelection,
    );
    window.localStorage.setItem("devdeck_onboarding_completed", "true");
  } catch {
    // Ignore test bootstrap failures and let the app continue normally.
  }
}

const devdeck = {
  addPullRequestComment(payload: {
    body: string;
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:add-pull-request-comment", payload);
  },
  claimPullRequestReview(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:claim-pull-request-review", payload);
  },
  clearGitHubToken(): Promise<void> {
    return ipcRenderer.invoke("devdeck:clear-github-token");
  },
  createGitWorktreeSession(payload: {
    baseRef: string;
    branchName: string;
    repositoryPath: string;
    sessionPath?: string | null;
  }): Promise<CreateGitWorktreeSessionResult> {
    return ipcRenderer.invoke("devdeck:create-git-worktree-session", payload);
  },
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot> {
    return ipcRenderer.invoke("devdeck:load-workspace-snapshot", selection);
  },
  onNavigate(listener: (targetPath: string) => void) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      targetPath: string,
    ) => listener(targetPath);
    ipcRenderer.on("devdeck:navigate", wrappedListener);
    return () => {
      ipcRenderer.removeListener("devdeck:navigate", wrappedListener);
    };
  },
  onWorkspaceSnapshotUpdated(
    listener: (snapshot: WorkspaceSnapshot) => void,
  ) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      snapshot: WorkspaceSnapshot,
    ) => listener(snapshot);
    ipcRenderer.on("devdeck:workspace-snapshot-updated", wrappedListener);
    return () => {
      ipcRenderer.removeListener("devdeck:workspace-snapshot-updated", wrappedListener);
    };
  },
  copyToClipboard(value: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:copy-to-clipboard", value);
  },
  openExternal(targetUrl: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-external", targetUrl);
  },
  openInCode(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-in-code", targetPath);
  },
  openInTerminal(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-in-terminal", targetPath);
  },
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null> {
    return ipcRenderer.invoke("devdeck:pick-workspace");
  },
  requestPullRequestReviewers(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
    reviewers: string[];
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:request-pull-request-reviewers", payload);
  },
  removeGitWorktreeSession(payload: {
    repositoryPath: string;
    worktreePath: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:remove-git-worktree-session", payload);
  },
  unclaimPullRequestReview(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:unclaim-pull-request-review", payload);
  },
  getGitHubAuthCapabilities() {
    return ipcRenderer.invoke("devdeck:get-github-auth-capabilities");
  },
  listGitHubRepositories(): Promise<GitHubRepositoryCandidate[]> {
    return ipcRenderer.invoke("devdeck:list-github-repositories");
  },
  listGitHubTeams(): Promise<GitHubTeamCandidate[]> {
    return ipcRenderer.invoke("devdeck:list-github-teams");
  },
  loadTeamInsights(payload: {
    organizationLogin: string;
    periodDays: number;
    teamSlug: string;
  }): Promise<TeamInsightsSnapshot> {
    return ipcRenderer.invoke("devdeck:load-team-insights", payload);
  },
  pollGitHubDeviceAuth(deviceCode: string) {
    return ipcRenderer.invoke("devdeck:poll-github-device-auth", deviceCode);
  },
  saveGitHubToken(token: string) {
    return ipcRenderer.invoke("devdeck:save-github-token", token);
  },
  showItemInFinder(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:show-item-in-finder", targetPath);
  },
  showNotification(payload: { body?: string; title: string }): Promise<void> {
    return ipcRenderer.invoke("devdeck:show-notification", payload);
  },
  startGitHubDeviceAuth() {
    return ipcRenderer.invoke("devdeck:start-github-device-auth");
  },
  syncWorkspaceMonitorState(state: WorkspaceMonitorState) {
    return ipcRenderer.invoke("devdeck:sync-workspace-monitor-state", state);
  },
  setLaunchAtLogin(enabled: boolean): Promise<void> {
    return ipcRenderer.invoke("devdeck:set-launch-at-login", enabled);
  },
  windowControls: {
    close(): Promise<void> {
      return ipcRenderer.invoke("devdeck:window-control", "close");
    },
    minimize(): Promise<void> {
      return ipcRenderer.invoke("devdeck:window-control", "minimize");
    },
    toggleMaximize(): Promise<void> {
      return ipcRenderer.invoke("devdeck:window-control", "toggle-maximize");
    },
  },
};

contextBridge.exposeInMainWorld("devdeck", devdeck);
