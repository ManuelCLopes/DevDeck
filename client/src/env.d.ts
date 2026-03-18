import type {
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "@shared/workspace";

interface DevDeckDesktopApi {
  clearGitHubToken(): Promise<void>;
  copyToClipboard(value: string): Promise<void>;
  getGitHubAuthCapabilities(): Promise<{ deviceFlowAvailable: boolean }>;
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot>;
  openExternal(targetUrl: string): Promise<void>;
  openInCode(targetPath: string): Promise<void>;
  openInTerminal(targetPath: string): Promise<void>;
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null>;
  pollGitHubDeviceAuth(deviceCode: string): Promise<{
    intervalSeconds?: number;
    message: string;
    status: "complete" | "error" | "pending";
    viewerLogin?: string;
  }>;
  saveGitHubToken(token: string): Promise<{ viewerLogin: string }>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  showItemInFinder(targetPath: string): Promise<void>;
  showNotification(payload: { body?: string; title: string }): Promise<void>;
  startGitHubDeviceAuth(): Promise<{
    deviceCode: string;
    expiresAt: string;
    intervalSeconds: number;
    userCode: string;
    verificationUri: string;
  }>;
  windowControls: {
    close(): Promise<void>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
  };
}

declare global {
  interface Window {
    devdeck?: DevDeckDesktopApi;
  }
}

export {};
