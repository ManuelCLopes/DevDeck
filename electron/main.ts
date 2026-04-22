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
import type {
  GitHubRepositoryCandidate,
  GitHubTeamCandidate,
  TeamInsightsSnapshot,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "../shared/workspace";
import {
  collectWorkspaceNotifications,
  getWorkspaceAttentionSummary,
  type WorkspaceMonitorPreferences,
} from "../shared/workspace-monitor";
import {
  clearStoredGitHubToken,
  getGitHubAuthCapabilities,
  pollGitHubDeviceAuth,
  readStoredGitHubToken,
  startGitHubDeviceAuth,
  validateAndStoreGitHubToken,
} from "./github-auth";
import {
  createGitHubPullRequestComment,
  deleteGitHubIssueComment,
  fetchGitHubIssueComments,
  fetchGitHubOrganizationTeams,
  fetchGitHubTeamContributionMembers,
  fetchGitHubTeamMembers,
  fetchGitHubViewer,
  fetchGitHubViewerOrganizationMemberships,
  fetchGitHubViewerRepositories,
  requestGitHubPullRequestReviewers,
} from "./github-api";
import {
  clearWorkspaceSnapshotCaches,
  discoverWorkspace,
  loadWorkspaceSnapshot,
} from "./workspace";
import {
  createGitWorktreeSession,
  inspectDevSessions,
  removeGitWorktreeSession,
} from "./git-worktree";
import {
  getDesktopCodingToolAvailability,
  openInOpenCode,
  openInVsCode,
} from "./coding-tool-launcher";

const execFileAsync = promisify(execFile);
const REVIEW_CLAIM_COMMENT_MARKER = "<!-- devdeck:review-claim -->";
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

function isConnectivityLikeError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("enotfound") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("github") ||
    message.includes("offline")
  );
}

function buildFailedWorkspaceSnapshot(
  previousSnapshot: WorkspaceSnapshot,
  error: unknown,
) {
  const attemptedAt = new Date().toISOString();
  const message =
    error instanceof Error
      ? error.message
      : "DevDeck could not refresh the workspace and is using cached data.";

  return {
    ...previousSnapshot,
    sync: {
      lastAttemptedAt: attemptedAt,
      lastSuccessfulSyncAt:
        previousSnapshot.sync?.lastSuccessfulSyncAt ?? previousSnapshot.generatedAt,
      message,
      state: isConnectivityLikeError(error) ? "offline" : "error",
    },
  } satisfies WorkspaceSnapshot;
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

function syncMacAppIdentity() {
  app.setName("DevDeck");

  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const icon = createAppIconImage();
  if (!icon.isEmpty()) {
    app.dock.setIcon(icon);
  }
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
    backgroundColor: "#f4f4f3",
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
  } catch (error) {
    if (workspaceMonitorState.latestSnapshot) {
      const fallbackSnapshot = buildFailedWorkspaceSnapshot(
        workspaceMonitorState.latestSnapshot,
        error,
      );
      workspaceMonitorState.latestSnapshot = fallbackSnapshot;
      broadcastWorkspaceSnapshot(fallbackSnapshot);
      updateDockBadge(fallbackSnapshot);
      updateTrayMenu();
      return fallbackSnapshot;
    }

    throw error;
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

async function runGitHubWorkspaceMutation(
  mutation: (token: string) => Promise<void>,
) {
  const token = await readStoredGitHubToken();
  if (!token) {
    throw new Error("Connect GitHub in Preferences before using pull request actions.");
  }

  await mutation(token);
  clearWorkspaceSnapshotCaches();

  if (workspaceMonitorState.selection) {
    await refreshWorkspaceSnapshot("settings");
  }
}

async function claimPullRequestReview(
  repositorySlug: string,
  pullRequestNumber: number,
  token: string,
) {
  await createGitHubPullRequestComment(
    repositorySlug,
    pullRequestNumber,
    REVIEW_CLAIM_COMMENT_MARKER,
    token,
  );
}

async function unclaimPullRequestReview(
  repositorySlug: string,
  pullRequestNumber: number,
  token: string,
) {
  const viewer = await fetchGitHubViewer(token);
  const comments = await fetchGitHubIssueComments(
    repositorySlug,
    pullRequestNumber,
    token,
  );
  const claimComment = comments
    .filter(
      (comment) =>
        comment.user?.login === viewer.login &&
        comment.body.includes(REVIEW_CLAIM_COMMENT_MARKER),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];

  if (!claimComment) {
    return;
  }

  await deleteGitHubIssueComment(repositorySlug, claimComment.id, token);
}

async function listGitHubTeams() {
  const token = await readStoredGitHubToken();
  if (!token) {
    return [] as GitHubTeamCandidate[];
  }

  const memberships = await fetchGitHubViewerOrganizationMemberships(token);
  const teams: GitHubTeamCandidate[] = [];

  for (const membership of memberships) {
    const organizationLogin = membership.organization?.login;
    if (!organizationLogin) {
      continue;
    }

    const organizationTeams = await fetchGitHubOrganizationTeams(
      organizationLogin,
      token,
    );

    teams.push(
      ...organizationTeams.map((team) => ({
        id: `${organizationLogin}/${team.slug}`,
        memberCount: team.members_count ?? null,
        name: team.name,
        organizationLogin,
        slug: team.slug,
      })),
    );
  }

  return teams.sort((left, right) =>
    `${left.organizationLogin}/${left.name}`.localeCompare(
      `${right.organizationLogin}/${right.name}`,
    ),
  );
}

function getActiveClaimCountsByReviewerLogin(
  snapshot: WorkspaceSnapshot | null,
  reviewerLogins: Set<string>,
) {
  const counts = new Map<string, number>();

  if (!snapshot) {
    return counts;
  }

  for (const pullRequest of snapshot.pullRequests) {
    const reviewerLogin = pullRequest.claim?.reviewerLogin ?? null;
    if (!reviewerLogin || !reviewerLogins.has(reviewerLogin)) {
      continue;
    }

    counts.set(reviewerLogin, (counts.get(reviewerLogin) ?? 0) + 1);
  }

  return counts;
}

function getAverageMetric(
  values: Array<number | null | undefined>,
) {
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (validValues.length === 0) {
    return null;
  }

  return Math.round(
    (validValues.reduce((sum, value) => sum + value, 0) / validValues.length) * 10,
  ) / 10;
}

async function loadTeamInsights(payload: {
  organizationLogin: string;
  periodDays: number;
  teamSlug: string;
}) {
  const token = await readStoredGitHubToken();
  if (!token) {
    throw new Error("Connect GitHub in Preferences before loading team insights.");
  }

  const teamMembers = await fetchGitHubTeamMembers(
    payload.organizationLogin,
    payload.teamSlug,
    token,
  );

  const generatedAt = new Date().toISOString();
  const from = new Date(
    Date.now() - payload.periodDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const reviewerLogins = new Set(
    teamMembers.map((member) => member.login).filter(Boolean),
  );
  const contributionMembers = await fetchGitHubTeamContributionMembers(
    Array.from(reviewerLogins),
    token,
    {
      from,
      to: generatedAt,
    },
  );
  const activeClaimCounts = getActiveClaimCountsByReviewerLogin(
    workspaceMonitorState.latestSnapshot,
    reviewerLogins,
  );

  const members = teamMembers.map((member) => {
    const contributionMember = contributionMembers.find(
      (candidate) => candidate.login === member.login,
    );

    return {
      activeClaimCount: activeClaimCounts.get(member.login) ?? 0,
      averageFirstReviewHours: contributionMember?.averageFirstReviewHours ?? null,
      averageMergeHours: contributionMember?.averageMergeHours ?? null,
      avatarUrl: contributionMember?.avatarUrl ?? member.avatar_url ?? null,
      commits: contributionMember?.commits ?? 0,
      login: member.login,
      mergedPullRequests: contributionMember?.mergedPullRequests ?? 0,
      name: contributionMember?.name ?? null,
      openedPullRequests: contributionMember?.openedPullRequests ?? 0,
      reviewsSubmitted: contributionMember?.reviewsSubmitted ?? 0,
    };
  });

  const summary: TeamInsightsSnapshot["summary"] = members.reduce(
    (aggregate, member) => ({
      activeClaims: aggregate.activeClaims + member.activeClaimCount,
      averageFirstReviewHours: aggregate.averageFirstReviewHours,
      averageMergeHours: aggregate.averageMergeHours,
      commits: aggregate.commits + member.commits,
      members: aggregate.members + 1,
      mergedPullRequests:
        aggregate.mergedPullRequests + member.mergedPullRequests,
      openedPullRequests:
        aggregate.openedPullRequests + member.openedPullRequests,
      reviewsSubmitted:
        aggregate.reviewsSubmitted + member.reviewsSubmitted,
    }),
    {
      activeClaims: 0,
      averageFirstReviewHours: null,
      averageMergeHours: null,
      commits: 0,
      members: 0,
      mergedPullRequests: 0,
      openedPullRequests: 0,
      reviewsSubmitted: 0,
    },
  );

  summary.averageFirstReviewHours = getAverageMetric(
    members.map((member) => member.averageFirstReviewHours),
  );
  summary.averageMergeHours = getAverageMetric(
    members.map((member) => member.averageMergeHours),
  );

  return {
    generatedAt,
    members: members.sort((left, right) => {
      const leftScore =
        left.mergedPullRequests * 5 +
        left.reviewsSubmitted * 4 +
        left.activeClaimCount * 3 +
        left.openedPullRequests * 2 +
        left.commits;
      const rightScore =
        right.mergedPullRequests * 5 +
        right.reviewsSubmitted * 4 +
        right.activeClaimCount * 3 +
        right.openedPullRequests * 2 +
        right.commits;

      return rightScore - leftScore || left.login.localeCompare(right.login);
    }),
    periodDays: payload.periodDays,
    summary,
    team: {
      id: `${payload.organizationLogin}/${payload.teamSlug}`,
      memberCount: members.length,
      name: payload.teamSlug,
      organizationLogin: payload.organizationLogin,
      slug: payload.teamSlug,
    },
  } satisfies TeamInsightsSnapshot;
}

ipcMain.handle("devdeck:pick-workspace", async () => {
  const result = await dialog.showOpenDialog({
    buttonLabel: "Choose Folder",
    properties: ["openDirectory"],
    title: "Select a local clone folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return discoverWorkspace(result.filePaths[0]);
});

ipcMain.handle(
  "devdeck:load-workspace-snapshot",
  async (_event, selection: WorkspaceSelection) => {
    try {
      const snapshot = await loadWorkspaceSnapshot(selection);
      if (workspaceMonitorState.selectionKey === JSON.stringify(selection)) {
        workspaceMonitorState.latestSnapshot = snapshot;
      }
      return snapshot;
    } catch (error) {
      if (workspaceMonitorState.latestSnapshot) {
        const fallbackSnapshot = buildFailedWorkspaceSnapshot(
          workspaceMonitorState.latestSnapshot,
          error,
        );
        workspaceMonitorState.latestSnapshot = fallbackSnapshot;
        return fallbackSnapshot;
      }

      throw error;
    }
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
  try {
    await openInVsCode(targetPath);
  } catch (error) {
    // Fall back to the OS default handler so users without the `code` CLI
    // can still reveal the project in whatever default opens folders.
    if (error instanceof Error && error.message.includes("code")) {
      await shell.openPath(targetPath);
      return;
    }

    throw error;
  }
});

ipcMain.handle("devdeck:open-in-opencode", async (_event, targetPath: string) => {
  await openInOpenCode(targetPath);
});

ipcMain.handle("devdeck:get-desktop-coding-tool-availability", async () => {
  return getDesktopCodingToolAvailability();
});

ipcMain.handle(
  "devdeck:create-git-worktree-session",
  async (
    _event,
    payload: {
      baseRef: string;
      branchName: string;
      repositoryPath: string;
      sessionPath?: string | null;
    },
  ) => {
    return createGitWorktreeSession(payload);
  },
);

ipcMain.handle(
  "devdeck:remove-git-worktree-session",
  async (
    _event,
    payload: {
      repositoryPath: string;
      worktreePath: string;
    },
  ) => {
    await removeGitWorktreeSession(payload);
  },
);

ipcMain.handle(
  "devdeck:inspect-dev-sessions",
  async (
    _event,
    payload: Array<{
      localPath: string;
      repositoryPath: string;
      sessionId: string;
    }>,
  ) => {
    return inspectDevSessions(payload);
  },
);

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

ipcMain.handle("devdeck:list-github-repositories", async () => {
  const token = await readStoredGitHubToken();
  if (!token) {
    return [] as GitHubRepositoryCandidate[];
  }

  const repositories: GitHubRepositoryCandidate[] = [];

  for (let page = 1; page <= 5; page += 1) {
    const pageRepositories = await fetchGitHubViewerRepositories(token, { page, perPage: 100 });
    repositories.push(
      ...pageRepositories.map((repository) => ({
        defaultBranch: repository.default_branch ?? null,
        description: repository.description ?? null,
        id: repository.full_name,
        isPrivate: repository.private,
        name: repository.name,
        slug: repository.full_name,
        updatedAt: repository.pushed_at ?? repository.updated_at,
        viewerPermission: repository.viewer_permission?.permission ?? null,
      })),
    );

    if (pageRepositories.length < 100) {
      break;
    }
  }

  return repositories;
});

ipcMain.handle("devdeck:list-github-teams", async () => {
  return listGitHubTeams();
});

ipcMain.handle(
  "devdeck:load-team-insights",
  async (
    _event,
    payload: {
      organizationLogin: string;
      periodDays: number;
      teamSlug: string;
    },
  ) => {
    return loadTeamInsights(payload);
  },
);

ipcMain.handle("devdeck:save-github-token", async (_event, token: string) => {
  const result = await validateAndStoreGitHubToken(token);
  clearWorkspaceSnapshotCaches();
  return result;
});

ipcMain.handle("devdeck:clear-github-token", async () => {
  await clearStoredGitHubToken();
  clearWorkspaceSnapshotCaches();
});

ipcMain.handle(
  "devdeck:claim-pull-request-review",
  async (
    _event,
    payload: {
      pullRequestNumber: number;
      repositorySlug: string;
    },
  ) => {
    await runGitHubWorkspaceMutation((token) =>
      claimPullRequestReview(payload.repositorySlug, payload.pullRequestNumber, token),
    );
  },
);

ipcMain.handle(
  "devdeck:unclaim-pull-request-review",
  async (
    _event,
    payload: {
      pullRequestNumber: number;
      repositorySlug: string;
    },
  ) => {
    await runGitHubWorkspaceMutation((token) =>
      unclaimPullRequestReview(payload.repositorySlug, payload.pullRequestNumber, token),
    );
  },
);

ipcMain.handle(
  "devdeck:add-pull-request-comment",
  async (
    _event,
    payload: {
      body: string;
      pullRequestNumber: number;
      repositorySlug: string;
    },
  ) => {
    const body = payload.body.trim();
    if (!body) {
      throw new Error("Write a comment before sending it to GitHub.");
    }

    await runGitHubWorkspaceMutation((token) =>
      createGitHubPullRequestComment(
        payload.repositorySlug,
        payload.pullRequestNumber,
        body,
        token,
      ),
    );
  },
);

ipcMain.handle(
  "devdeck:request-pull-request-reviewers",
  async (
    _event,
    payload: {
      pullRequestNumber: number;
      repositorySlug: string;
      reviewers: string[];
    },
  ) => {
    const reviewers = payload.reviewers
      .map((reviewer) => reviewer.trim())
      .filter(Boolean);
    if (reviewers.length === 0) {
      throw new Error("Enter at least one reviewer login.");
    }

    await runGitHubWorkspaceMutation((token) =>
      requestGitHubPullRequestReviewers(
        payload.repositorySlug,
        payload.pullRequestNumber,
        reviewers,
        token,
      ),
    );
  },
);

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
  syncMacAppIdentity();
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
