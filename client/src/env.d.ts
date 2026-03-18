import type {
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "@shared/workspace";

interface DevDeckDesktopApi {
  copyToClipboard(value: string): Promise<void>;
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot>;
  openExternal(targetUrl: string): Promise<void>;
  openInCode(targetPath: string): Promise<void>;
  openInTerminal(targetPath: string): Promise<void>;
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  showItemInFinder(targetPath: string): Promise<void>;
  showNotification(payload: { body?: string; title: string }): Promise<void>;
  startGitHubLogin(): Promise<void>;
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
