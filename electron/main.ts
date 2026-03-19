import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from "electron";
import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import type { WorkspaceSelection, WorkspaceSnapshot } from "../shared/workspace";
import {
  collectWorkspaceNotifications,
  getWorkspaceAttentionSummary,
  type WorkspaceMonitorPreferences,
} from "../shared/workspace-monitor";
import {
  clearStoredGitHubToken,
  getGitHubAuthCapabilities,
  pollGitHubDeviceAuth,
  startGitHubDeviceAuth,
  validateAndStoreGitHubToken,
} from "./github-auth";
import {
  clearWorkspaceSnapshotCaches,
  discoverWorkspace,
  loadWorkspaceSnapshot,
} from "./workspace";

const execFileAsync = promisify(execFile);
const DEFAULT_WORKSPACE_MONITOR_PREFERENCES = {
  alertFailingBuilds: true,
  autoRefreshEnabled: true,
  autoRefreshIntervalSeconds: 30,
  keepRunningInBackground: true,
  notifyApproved: true,
  notifyChangesRequested: true,
  notifyReviewRequired: true,
  refreshOnWindowFocus: true,
  showMenuBarIcon: true,
} satisfies WorkspaceMonitorPreferences & {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  keepRunningInBackground: boolean;
  refreshOnWindowFocus: boolean;
  showMenuBarIcon: boolean;
};

interface WorkspaceMonitorSettings extends WorkspaceMonitorPreferences {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  keepRunningInBackground: boolean;
  refreshOnWindowFocus: boolean;
  showMenuBarIcon: boolean;
}

interface WorkspaceMonitorState {
  intervalId: NodeJS.Timeout | null;
  isRefreshing: boolean;
  latestSnapshot: WorkspaceSnapshot | null;
  preferences: WorkspaceMonitorSettings;
  selection: WorkspaceSelection | null;
  selectionKey: string | null;
}

let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
let isQuitting = false;
const workspaceMonitorState: WorkspaceMonitorState = {
  intervalId: null,
  isRefreshing: false,
  latestSnapshot: null,
  preferences: DEFAULT_WORKSPACE_MONITOR_PREFERENCES,
  selection: null,
  selectionKey: null,
};

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function getRendererPath() {
  return path.resolve(__dirname, "..", "dist", "public", "index.html");
}

function getRendererUrl() {
  return process.env.DEVDECK_RENDERER_URL;
}

function shouldOpenDevTools() {
  return process.env.DEVDECK_OPEN_DEVTOOLS === "true";
}

function getTrayIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }

  return path.resolve(__dirname, "..", "build", "icon.png");
}

function createTrayImage() {
  const iconPath = getTrayIconPath();
  if (!existsSync(iconPath)) {
    return nativeImage.createEmpty();
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    return nativeImage.createEmpty();
  }

  return process.platform === "darwin"
    ? icon.resize({ height: 18, width: 18 })
    : icon;
}

function updateDockBadge(snapshot: WorkspaceSnapshot | null) {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const badgeValue = snapshot
    ? String(getWorkspaceAttentionSummary(snapshot).totalAttentionCount || "")
    : "";
  app.dock.setBadge(badgeValue);
}

function showMainWindow() {
  const nextMainWindow = mainWindow ?? createMainWindow();
  if (nextMainWindow.isMinimized()) {
    nextMainWindow.restore();
  }

  nextMainWindow.show();
  nextMainWindow.focus();
  if (process.platform === "darwin" && app.dock) {
    app.dock.show();
  }
}

function navigateMainWindow(targetPath: string) {
  const nextMainWindow = mainWindow ?? createMainWindow();
  const sendNavigation = () => {
    nextMainWindow.webContents.send("devdeck:navigate", targetPath);
  };

  if (nextMainWindow.webContents.isLoadingMainFrame()) {
    nextMainWindow.webContents.once("did-finish-load", sendNavigation);
  } else {
    sendNavigation();
  }

  showMainWindow();
}

function buildTrayTooltip(snapshot: WorkspaceSnapshot | null) {
  if (!snapshot) {
    return "DevDeck";
  }

  const attention = getWorkspaceAttentionSummary(snapshot);
  if (attention.totalAttentionCount === 0) {
    return "DevDeck · Workspace idle";
  }

  const parts: string[] = [];
  if (attention.needsViewerReviewCount > 0) {
    parts.push(`${attention.needsViewerReviewCount} need review`);
  }
  if (attention.needsAuthorFollowUpCount > 0) {
    parts.push(`${attention.needsAuthorFollowUpCount} need follow-up`);
  }

  return `DevDeck · ${parts.join(" · ")}`;
}

function updateTrayMenu() {
  if (!appTray) {
    return;
  }

  const snapshot = workspaceMonitorState.latestSnapshot;
  const attention = snapshot ? getWorkspaceAttentionSummary(snapshot) : null;
  const statusLabel = attention
    ? attention.totalAttentionCount > 0
      ? `${attention.needsViewerReviewCount} need review · ${attention.needsAuthorFollowUpCount} need follow-up`
      : "Workspace idle"
    : "Waiting for first workspace snapshot";

  appTray.setToolTip(buildTrayTooltip(snapshot));
  if (process.platform === "darwin") {
    appTray.setTitle(
      attention && attention.totalAttentionCount > 0
        ? ` ${attention.totalAttentionCount}`
        : "",
    );
  }

  appTray.setContextMenu(
    Menu.buildFromTemplate([
      { enabled: false, label: `DevDeck · ${statusLabel}` },
      { type: "separator" },
      {
        click: () => {
          showMainWindow();
        },
        label: "Open DevDeck",
      },
      {
        click: () => {
          navigateMainWindow("/reviews");
        },
        label: "Open Pull Requests",
      },
      {
        click: () => {
          navigateMainWindow("/reviews?focus=needs_my_review");
        },
        label: "Open Review Queue",
      },
      {
        click: () => {
          void refreshWorkspaceSnapshot("settings");
        },
        label: "Refresh Now",
      },
      { type: "separator" },
      {
        click: () => {
          isQuitting = true;
          app.quit();
        },
        label: "Quit DevDeck",
      },
    ]),
  );
}

function ensureTray() {
  if (appTray || !workspaceMonitorState.preferences.showMenuBarIcon) {
    return;
  }

  appTray = new Tray(createTrayImage());
  appTray.on("click", () => {
    showMainWindow();
  });
  updateTrayMenu();
}

function destroyTray() {
  if (!appTray) {
    return;
  }

  appTray.destroy();
  appTray = null;
}

function syncTrayPresence() {
  if (workspaceMonitorState.preferences.showMenuBarIcon) {
    ensureTray();
    updateTrayMenu();
    return;
  }

  destroyTray();
}

function createMainWindow() {
  const nextMainWindow = new BrowserWindow({
    backgroundColor: "#ececec",
    frame: false,
    height: 920,
    minHeight: 720,
    minWidth: 1100,
    show: false,
    title: "DevDeck",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 16 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
    },
    width: 1440,
  });

  nextMainWindow.once("ready-to-show", () => {
    nextMainWindow.show();
  });
  nextMainWindow.on("focus", () => {
    if (!workspaceMonitorState.preferences.refreshOnWindowFocus) {
      return;
    }

    void refreshWorkspaceSnapshot("focus");
  });
  nextMainWindow.on("close", (event) => {
    if (isQuitting || !workspaceMonitorState.preferences.keepRunningInBackground) {
      return;
    }

    event.preventDefault();
    nextMainWindow.hide();
  });
  nextMainWindow.on("closed", () => {
    if (mainWindow === nextMainWindow) {
      mainWindow = null;
    }
  });

  const rendererUrl = getRendererUrl();
  if (rendererUrl) {
    void nextMainWindow.loadURL(rendererUrl);
    if (shouldOpenDevTools()) {
      nextMainWindow.webContents.openDevTools({ mode: "detach" });
    }
    mainWindow = nextMainWindow;
    return nextMainWindow;
  }

  void nextMainWindow.loadFile(getRendererPath());
  mainWindow = nextMainWindow;
  return nextMainWindow;
}

function broadcastWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send("devdeck:workspace-snapshot-updated", snapshot);
  }
}

function showDesktopNotification(payload: { body?: string; title: string }) {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    body: payload.body,
    title: payload.title,
  }).show();
}

function clearWorkspaceMonitorInterval() {
  if (workspaceMonitorState.intervalId) {
    clearInterval(workspaceMonitorState.intervalId);
    workspaceMonitorState.intervalId = null;
  }
}

function syncWorkspaceMonitorSchedule() {
  clearWorkspaceMonitorInterval();

  if (
    !workspaceMonitorState.selection ||
    !workspaceMonitorState.preferences.autoRefreshEnabled
  ) {
    return;
  }

  workspaceMonitorState.intervalId = setInterval(() => {
    void refreshWorkspaceSnapshot("interval");
  }, workspaceMonitorState.preferences.autoRefreshIntervalSeconds * 1000);
}

async function refreshWorkspaceSnapshot(
  _reason: "focus" | "interval" | "selection" | "settings",
) {
  if (!workspaceMonitorState.selection || workspaceMonitorState.isRefreshing) {
    return workspaceMonitorState.latestSnapshot;
  }

  workspaceMonitorState.isRefreshing = true;
  try {
    const nextSnapshot = await loadWorkspaceSnapshot(workspaceMonitorState.selection);
    const previousSnapshot = workspaceMonitorState.latestSnapshot;
    workspaceMonitorState.latestSnapshot = nextSnapshot;

    if (previousSnapshot) {
      const notifications = collectWorkspaceNotifications(
        previousSnapshot,
        nextSnapshot,
        workspaceMonitorState.preferences,
      );
      for (const notification of notifications) {
        showDesktopNotification(notification);
      }
    }

    broadcastWorkspaceSnapshot(nextSnapshot);
    updateDockBadge(nextSnapshot);
    updateTrayMenu();
    return nextSnapshot;
  } finally {
    workspaceMonitorState.isRefreshing = false;
  }
}

function applyWorkspaceMonitorState(nextState: {
  preferences: WorkspaceMonitorSettings;
  selection: WorkspaceSelection | null;
}) {
  const nextSelectionKey = JSON.stringify(nextState.selection ?? null);
  const selectionChanged = workspaceMonitorState.selectionKey !== nextSelectionKey;

  workspaceMonitorState.preferences = {
    ...DEFAULT_WORKSPACE_MONITOR_PREFERENCES,
    ...nextState.preferences,
  };
  workspaceMonitorState.selection = nextState.selection;
  workspaceMonitorState.selectionKey = nextSelectionKey;

  if (selectionChanged) {
    workspaceMonitorState.latestSnapshot = null;
  }

  syncWorkspaceMonitorSchedule();
  syncTrayPresence();

  if (workspaceMonitorState.selection) {
    void refreshWorkspaceSnapshot(selectionChanged ? "selection" : "settings");
  } else {
    workspaceMonitorState.latestSnapshot = null;
    updateDockBadge(null);
    updateTrayMenu();
  }
}

ipcMain.handle("devdeck:pick-workspace", async () => {
  const result = await dialog.showOpenDialog({
    buttonLabel: "Choose Workspace",
    properties: ["openDirectory"],
    title: "Select a workspace folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return discoverWorkspace(result.filePaths[0]);
});

ipcMain.handle(
  "devdeck:load-workspace-snapshot",
  async (_event, selection: WorkspaceSelection) => {
    const snapshot = await loadWorkspaceSnapshot(selection);
    if (workspaceMonitorState.selectionKey === JSON.stringify(selection)) {
      workspaceMonitorState.latestSnapshot = snapshot;
    }
    return snapshot;
  },
);

ipcMain.handle("devdeck:show-item-in-finder", async (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath);
});

ipcMain.handle("devdeck:open-external", async (_event, targetUrl: string) => {
  await shell.openExternal(targetUrl);
});

ipcMain.handle("devdeck:open-in-terminal", async (_event, targetPath: string) => {
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-a", "Terminal", targetPath]);
    return;
  }

  await shell.openPath(targetPath);
});

ipcMain.handle("devdeck:open-in-code", async (_event, targetPath: string) => {
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-a", "Visual Studio Code", targetPath]);
    return;
  }

  await shell.openPath(targetPath);
});

ipcMain.handle("devdeck:copy-to-clipboard", async (_event, value: string) => {
  clipboard.writeText(value);
});

ipcMain.handle(
  "devdeck:show-notification",
  async (_event, payload: { body?: string; title: string }) => {
    showDesktopNotification(payload);
  },
);

ipcMain.handle("devdeck:get-github-auth-capabilities", async () => {
  return getGitHubAuthCapabilities();
});

ipcMain.handle("devdeck:save-github-token", async (_event, token: string) => {
  const result = await validateAndStoreGitHubToken(token);
  clearWorkspaceSnapshotCaches();
  return result;
});

ipcMain.handle("devdeck:clear-github-token", async () => {
  await clearStoredGitHubToken();
  clearWorkspaceSnapshotCaches();
});

ipcMain.handle("devdeck:start-github-device-auth", async () => {
  return startGitHubDeviceAuth();
});

ipcMain.handle("devdeck:poll-github-device-auth", async (_event, deviceCode: string) => {
  const result = await pollGitHubDeviceAuth(deviceCode);
  if (result.status === "complete") {
    clearWorkspaceSnapshotCaches();
  }

  return result;
});

ipcMain.handle("devdeck:set-launch-at-login", async (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

ipcMain.handle(
  "devdeck:sync-workspace-monitor-state",
  async (
    _event,
    state: {
      preferences: WorkspaceMonitorSettings;
      selection: WorkspaceSelection | null;
    },
  ) => {
    applyWorkspaceMonitorState(state);
  },
);

ipcMain.handle(
  "devdeck:window-control",
  async (event, action: "close" | "minimize" | "toggle-maximize") => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) {
      return;
    }

    if (action === "close") {
      browserWindow.close();
      return;
    }

    if (action === "minimize") {
      browserWindow.minimize();
      return;
    }

    if (browserWindow.isMaximized()) {
      browserWindow.unmaximize();
    } else {
      browserWindow.maximize();
    }
  },
);

app.whenReady().then(() => {
  createMainWindow();
  syncTrayPresence();

  app.on("activate", () => {
    if (mainWindow) {
      showMainWindow();
      return;
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  clearWorkspaceMonitorInterval();
  destroyTray();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
