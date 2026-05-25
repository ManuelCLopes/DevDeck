import { app, Menu, Tray, nativeImage, shell } from "electron";
import path from "path";
import { existsSync } from "fs";
import type { WorkspaceSnapshot, WorkspaceProject } from "../shared/workspace";
import { getWorkspaceAttentionSummary } from "../shared/workspace-monitor";
import { getActivePtySessions } from "./pty";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface MenubarContext {
  getLatestSnapshot: () => WorkspaceSnapshot | null;
  getPreferences: () => any;
  showMainWindow: () => void;
  navigateMainWindow: (targetPath: string) => void;
  refreshWorkspace: () => Promise<any>;
  quitApp: () => void;
}

let appTray: Tray | null = null;
let activeContext: MenubarContext | null = null;

function getTrayIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }
  return path.resolve(__dirname, "..", "build", "icon.png");
}

function createAppIconImage() {
  const iconPath = getTrayIconPath();
  if (!existsSync(iconPath)) {
    return nativeImage.createEmpty();
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    return nativeImage.createEmpty();
  }

  return icon;
}

function createTrayImage() {
  const icon = createAppIconImage();
  if (icon.isEmpty()) {
    return nativeImage.createEmpty();
  }

  return process.platform === "darwin"
    ? icon.resize({ height: 18, width: 18 })
    : icon;
}

function buildTrayTooltip(snapshot: WorkspaceSnapshot | null): string {
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

export function initializeMenubar(context: MenubarContext): Tray | null {
  activeContext = context;
  const prefs = context.getPreferences();

  if (!prefs.showMenuBarIcon) {
    destroyMenubarTray();
    return null;
  }

  if (appTray) {
    updateMenubarTray();
    return appTray;
  }

  appTray = new Tray(createTrayImage());
  appTray.on("click", () => {
    context.showMainWindow();
  });

  updateMenubarTray();
  return appTray;
}

export function destroyMenubarTray() {
  if (appTray) {
    appTray.destroy();
    appTray = null;
  }
}

export function updateMenubarTray() {
  if (!appTray || !activeContext) {
    return;
  }

  const context = activeContext;
  const snapshot = context.getLatestSnapshot();
  const attention = snapshot ? getWorkspaceAttentionSummary(snapshot) : null;
  const statusLabel = attention
    ? attention.totalAttentionCount > 0
      ? `${attention.needsViewerReviewCount} review(s) pending · ${attention.needsAuthorFollowUpCount} follow-up(s)`
      : "All clear! Workspace is quiet"
    : "Initializing workspace companion...";

  appTray.setToolTip(buildTrayTooltip(snapshot));

  if (process.platform === "darwin") {
    appTray.setTitle(
      attention && attention.totalAttentionCount > 0
        ? ` ${attention.totalAttentionCount}`
        : "",
    );
  }

  const menuItems: any[] = [
    { enabled: false, label: "DevDeck Cockpit" },
    { enabled: false, label: statusLabel },
    { type: "separator" },
  ];

  // --- Monitored Repositories ---
  menuItems.push({ enabled: false, label: "MONITORED REPOSITORIES" });

  if (snapshot && snapshot.projects && snapshot.projects.length > 0) {
    snapshot.projects.forEach((project: WorkspaceProject) => {
      const aheadStr = project.aheadBy > 0 ? `↑${project.aheadBy}` : "";
      const behindStr = project.behindBy > 0 ? `↓${project.behindBy}` : "";
      const syncBadge = [aheadStr, behindStr].filter(Boolean).join(" ");
      const syncLabel = syncBadge ? ` (${syncBadge})` : "";
      
      const prBadge = project.openPullRequestCount > 0 ? ` [${project.openPullRequestCount} PRs]` : "";
      
      const repoLabel = `  ${project.name} (${project.currentBranch})${syncLabel}${prBadge}`;

      // Build status messages for submenu
      const ciStatusText =
        project.ciStatus === "passing"
          ? "✓ CI Build: Passing"
          : project.ciStatus === "failing"
          ? "✗ CI Build: Failing"
          : project.ciStatus === "pending"
          ? "○ CI Build: Pending"
          : "○ CI Build: Unknown";

      const repoStatusText =
        project.status === "healthy"
          ? "● Health: Healthy"
          : project.status === "warning"
          ? "▲ Health: Warning"
          : "◆ Health: Critical";

      const submenuTemplate = [
        { enabled: false, label: `${project.name} Status Summary` },
        { type: "separator" },
        { enabled: false, label: repoStatusText },
        { enabled: false, label: ciStatusText },
        {
          enabled: false,
          label: `Branch: ${project.currentBranch} (vs default: ${project.defaultBranch})`,
        },
        {
          enabled: false,
          label: `Commits: ${project.aheadBy} ahead, ${project.behindBy} behind`,
        },
        {
          enabled: false,
          label: `Unpushed changes: ${project.unpushedCommitCount}`,
        },
        { type: "separator" },
        {
          click: () => {
            context.navigateMainWindow(`/projects?project=${project.id}`);
          },
          label: "View in DevDeck Projects",
        },
        {
          click: () => {
            if (process.platform === "darwin") {
              void execFileAsync("open", ["-a", "Terminal", project.localPath]);
            } else {
              void shell.openPath(project.localPath);
            }
          },
          label: "Open in System Terminal",
        },
        {
          click: () => {
            // Try to open VS Code
            const env = { ...process.env };
            const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin"];
            const base = env.PATH ?? "";
            const pathParts = base.split(":");
            const missing = extraPaths.filter(p => !pathParts.includes(p));
            if (missing.length > 0) {
              env.PATH = [...missing, ...pathParts].join(":");
            }
            execFile("code", [project.localPath], { env }, (err) => {
              if (err) {
                // fallback to system default
                void shell.openPath(project.localPath);
              }
            });
          },
          label: "Open in VS Code",
        },
      ];

      menuItems.push({
        label: repoLabel,
        click: () => {
          context.navigateMainWindow(`/projects?project=${project.id}`);
        },
        submenu: Menu.buildFromTemplate(submenuTemplate as any[]),
      });
    });
  } else {
    menuItems.push({ enabled: false, label: "  No repositories monitored" });
  }

  menuItems.push({ type: "separator" });

  // --- Active Embedded Terminals ---
  menuItems.push({ enabled: false, label: "ACTIVE TERMINALS & SESSIONS" });

  const activePtySessions = getActivePtySessions();
  if (activePtySessions && activePtySessions.length > 0) {
    activePtySessions.forEach((pty) => {
      // Determine if this is an OpenCode session
      const isOpenCode = pty.command.includes("opencode") || pty.args.some(arg => arg.includes("opencode"));
      const typeLabel = isOpenCode ? "OpenCode" : "Shell";
      const itemLabel = `  ${pty.label} (${typeLabel} · pid: ${pty.pid})`;

      const ptySubmenu = [
        { enabled: false, label: `Terminal Pane Details` },
        { type: "separator" },
        { enabled: false, label: `Session Type: ${typeLabel}` },
        { enabled: false, label: `PID: ${pty.pid}` },
        { enabled: false, label: `Shell Command: ${pty.command} ${pty.args.join(" ")}` },
        { enabled: false, label: `Directory: ${pty.cwd}` },
        { type: "separator" },
        {
          click: () => {
            // Navigate to Terminals tab
            context.navigateMainWindow("/terminals");
          },
          label: "Focus Terminal Pane in DevDeck",
        },
      ];

      menuItems.push({
        label: itemLabel,
        click: () => {
          context.navigateMainWindow("/terminals");
        },
        submenu: Menu.buildFromTemplate(ptySubmenu as any[]),
      });
    });
  } else {
    menuItems.push({ enabled: false, label: "  No active terminal instances" });
  }

  menuItems.push({ type: "separator" });

  // --- Actions ---
  menuItems.push(
    {
      click: () => {
        context.showMainWindow();
      },
      label: "Show Dashboard Menu",
    },
    {
      click: () => {
        context.navigateMainWindow("/reviews");
      },
      label: "Open Pull Request Review Board",
    },
    {
      click: () => {
        void context.refreshWorkspace();
      },
      label: "Sync Workspace Snapshot Now",
    },
    { type: "separator" },
    {
      click: () => {
        context.navigateMainWindow("/settings");
      },
      label: "Preferences...",
    },
    {
      click: () => {
        context.quitApp();
      },
      label: "Quit DevDeck",
    }
  );

  appTray.setContextMenu(Menu.buildFromTemplate(menuItems));
}
