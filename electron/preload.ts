import { contextBridge, ipcRenderer } from "electron";
import type {
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "../shared/workspace";

const devdeck = {
  clearGitHubToken(): Promise<void> {
    return ipcRenderer.invoke("devdeck:clear-github-token");
  },
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot> {
    return ipcRenderer.invoke("devdeck:load-workspace-snapshot", selection);
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
