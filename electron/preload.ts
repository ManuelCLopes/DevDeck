import { contextBridge, ipcRenderer } from "electron";
import type {
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "../shared/workspace";
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

const devdeck = {
  addPullRequestComment(payload: {
    body: string;
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:add-pull-request-comment", payload);
  },
  clearGitHubToken(): Promise<void> {
    return ipcRenderer.invoke("devdeck:clear-github-token");
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
  getGitHubAuthCapabilities() {
    return ipcRenderer.invoke("devdeck:get-github-auth-capabilities");
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
