import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell } from "electron";
import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import type { WorkspaceSelection } from "../shared/workspace";
import { discoverWorkspace, loadWorkspaceSnapshot } from "./workspace";

const execFileAsync = promisify(execFile);

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

function createMainWindow() {
  const mainWindow = new BrowserWindow({
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

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const rendererUrl = getRendererUrl();
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
    if (shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    return mainWindow;
  }

  void mainWindow.loadFile(getRendererPath());
  return mainWindow;
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
  async (_event, selection: WorkspaceSelection) => loadWorkspaceSnapshot(selection),
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
    if (!Notification.isSupported()) {
      return;
    }

    new Notification({
      body: payload.body,
      title: payload.title,
    }).show();
  },
);

ipcMain.handle("devdeck:start-github-login", async () => {
  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      'tell application "Terminal" to do script "gh auth login --web"',
      "-e",
      'tell application "Terminal" to activate',
    ]);
    return;
  }

  await shell.openExternal("https://cli.github.com/manual/gh_auth_login");
});

ipcMain.handle("devdeck:set-launch-at-login", async (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
