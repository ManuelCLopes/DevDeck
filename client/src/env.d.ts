import type {
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "@shared/workspace";

interface DevDeckDesktopApi {
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot>;
  openExternal(targetUrl: string): Promise<void>;
  openInTerminal(targetPath: string): Promise<void>;
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null>;
  showItemInFinder(targetPath: string): Promise<void>;
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
