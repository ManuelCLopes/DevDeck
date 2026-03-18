import { contextBridge, ipcRenderer } from "electron";
import type {
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "../shared/workspace";

const devdeck = {
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot> {
    return ipcRenderer.invoke("devdeck:load-workspace-snapshot", selection);
  },
  openExternal(targetUrl: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-external", targetUrl);
  },
  openInTerminal(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-in-terminal", targetPath);
  },
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null> {
    return ipcRenderer.invoke("devdeck:pick-workspace");
  },
  showItemInFinder(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:show-item-in-finder", targetPath);
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
