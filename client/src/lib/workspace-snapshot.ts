import { getDesktopApi } from "@/lib/desktop";
import { getWorkspaceSelection, type MonitoredProject } from "@/lib/workspace-selection";
import {
  ensureWorkspaceHandlePermission,
  getWorkspaceHandle,
  type AppFileSystemDirectoryHandle,
  type AppFileSystemFileHandle,
  type AppFileSystemHandle,
} from "@/lib/workspace-handle";
import type {
  WorkspaceActivityItem,
  WorkspaceGitHubStatus,
  WorkspaceProject,
  WorkspaceProjectStatus,
  WorkspacePullRequestItem,
  WorkspaceReviewItem,
  WorkspaceSnapshot,
} from "@shared/workspace";

const CACHED_SNAPSHOT_KEY = "devdeck_workspace_snapshot";
const DIRECTORY_NAMES_TO_IGNORE = new Set([
  ".git",
  ".next",
  ".turbo",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  cjs: "JavaScript",
  cpp: "C++",
  cs: "C#",
  css: "CSS",
  go: "Go",
  h: "C",
  hpp: "C++",
  html: "HTML",
  java: "Java",
  js: "JavaScript",
  jsx: "React",
  kt: "Kotlin",
  md: "Markdown",
  mjs: "JavaScript",
  php: "PHP",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  sh: "Shell",
  sql: "SQL",
  swift: "Swift",
  ts: "TypeScript",
  tsx: "React",
  vue: "Vue",
  yml: "YAML",
  yaml: "YAML",
};

interface ReflogEntry {
  authorEmail: string | null;
  authorName: string | null;
  commitSha: string | null;
  message: string;
  timestamp: string;
}

interface RepositoryScanResult {
  activities: WorkspaceActivityItem[];
  authoredPullRequests: WorkspaceSnapshot["authoredPullRequests"];
  branches: string[];
  project: WorkspaceProject;
  pullRequests: WorkspacePullRequestItem[];
  reviews: WorkspaceReviewItem[];
  userActivity: WorkspaceSnapshot["userActivity"];
}

function createEmptyUserActivitySummary(): WorkspaceSnapshot["userActivity"] {
  return {
    last7Days: {
      commits: 0,
      linesAdded: 0,
      linesDeleted: 0,
      pullRequestsMerged: 0,
      pullRequestsReviewed: 0,
    },
    last30Days: {
      commits: 0,
      linesAdded: 0,
      linesDeleted: 0,
      pullRequestsMerged: 0,
      pullRequestsReviewed: 0,
    },
    last90Days: {
      commits: 0,
      linesAdded: 0,
      linesDeleted: 0,
      pullRequestsMerged: 0,
      pullRequestsReviewed: 0,
    },
  };
}

function addUserActivityCommit(
  summary: WorkspaceSnapshot["userActivity"],
  timestamp: string,
) {
  const eventTime = new Date(timestamp).getTime();
  if (!Number.isFinite(eventTime)) {
    return;
  }

  const now = Date.now();
  if (eventTime >= now - 7 * 24 * 60 * 60 * 1000) {
    summary.last7Days.commits += 1;
  }
  if (eventTime >= now - 30 * 24 * 60 * 60 * 1000) {
    summary.last30Days.commits += 1;
  }
  if (eventTime >= now - 90 * 24 * 60 * 60 * 1000) {
    summary.last90Days.commits += 1;
  }
}

function mergeUserActivitySummaries(
  summaries: WorkspaceSnapshot["userActivity"][],
) {
  return summaries.reduce<WorkspaceSnapshot["userActivity"]>((accumulator, summary) => {
    accumulator.last7Days.commits += summary.last7Days.commits;
    accumulator.last7Days.linesAdded += summary.last7Days.linesAdded;
    accumulator.last7Days.linesDeleted += summary.last7Days.linesDeleted;
    accumulator.last7Days.pullRequestsMerged += summary.last7Days.pullRequestsMerged;
    accumulator.last7Days.pullRequestsReviewed += summary.last7Days.pullRequestsReviewed;

    accumulator.last30Days.commits += summary.last30Days.commits;
    accumulator.last30Days.linesAdded += summary.last30Days.linesAdded;
    accumulator.last30Days.linesDeleted += summary.last30Days.linesDeleted;
    accumulator.last30Days.pullRequestsMerged += summary.last30Days.pullRequestsMerged;
    accumulator.last30Days.pullRequestsReviewed += summary.last30Days.pullRequestsReviewed;

    accumulator.last90Days.commits += summary.last90Days.commits;
    accumulator.last90Days.linesAdded += summary.last90Days.linesAdded;
    accumulator.last90Days.linesDeleted += summary.last90Days.linesDeleted;
    accumulator.last90Days.pullRequestsMerged += summary.last90Days.pullRequestsMerged;
    accumulator.last90Days.pullRequestsReviewed += summary.last90Days.pullRequestsReviewed;

    return accumulator;
  }, createEmptyUserActivitySummary());
}

function isWorkspaceReviewItem(
  review: WorkspaceReviewItem | null,
): review is WorkspaceReviewItem {
  return review !== null;
}

function isRepositoryScanResult(
  result: RepositoryScanResult | null,
): result is RepositoryScanResult {
  return result !== null;
}

function cacheWorkspaceSnapshot(snapshot: WorkspaceSnapshot | null) {
  if (snapshot) {
    localStorage.setItem(CACHED_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } else {
    localStorage.removeItem(CACHED_SNAPSHOT_KEY);
  }
}

export function getCachedWorkspaceSnapshot() {
  const cachedSnapshot = localStorage.getItem(CACHED_SNAPSHOT_KEY);
  if (!cachedSnapshot) {
    return null;
  }

  try {
    return JSON.parse(cachedSnapshot) as WorkspaceSnapshot;
  } catch {
    return null;
  }
}

async function getDirectoryHandleByPath(
  rootHandle: AppFileSystemDirectoryHandle,
  relativePath?: string,
) {
  let currentHandle = rootHandle;
  for (const segment of relativePath?.split("/").filter(Boolean) ?? []) {
    try {
      currentHandle = await currentHandle.getDirectoryHandle(segment);
    } catch {
      return null;
    }
  }

  return currentHandle;
}

async function getOptionalDirectoryHandle(
  parentHandle: AppFileSystemDirectoryHandle,
  name: string,
) {
  try {
    return await parentHandle.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

async function getOptionalFileHandle(
  parentHandle: AppFileSystemDirectoryHandle,
  name: string,
) {
  try {
    return await parentHandle.getFileHandle(name);
  } catch {
    return null;
  }
}

async function readFileHandleText(fileHandle: AppFileSystemFileHandle) {
  try {
    return await (await fileHandle.getFile()).text();
  } catch {
    return null;
  }
}

async function readTextAtPath(
  rootHandle: AppFileSystemDirectoryHandle,
  relativePath: string,
) {
  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) {
    return null;
  }

  const directoryHandle = await getDirectoryHandleByPath(rootHandle, segments.join("/"));
  if (!directoryHandle) {
    return null;
  }

  const fileHandle = await getOptionalFileHandle(directoryHandle, fileName);
  return fileHandle ? readFileHandleText(fileHandle) : null;
}

function parseConfigOriginUrl(configText: string | null) {
  if (!configText) {
    return null;
  }

  let isOriginBlock = false;
  for (const line of configText.split(/\r?\n/)) {
    if (line.trim().startsWith("[remote ")) {
      isOriginBlock = line.includes('"origin"');
      continue;
    }

    if (!isOriginBlock) {
      continue;
    }

    const match = line.match(/^\s*url\s*=\s*(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function parseRefName(refText: string | null) {
  if (!refText) {
    return null;
  }

  const trimmedText = refText.trim();
  if (!trimmedText.startsWith("ref:")) {
    return trimmedText.slice(0, 7);
  }

  return trimmedText.split("/").pop() ?? null;
}

function parseLastReflogEntry(logText: string | null) {
  if (!logText) {
    return null;
  }

  const lastLine = logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!lastLine) {
    return null;
  }

  const match = lastLine.match(
    /^([0-9a-f]{40}) ([0-9a-f]{40}) (.+) <([^>]+)> (\d+) [+-]\d+\t(.+)$/,
  );

  if (!match) {
    return null;
  }

  return {
    authorEmail: match[4],
    authorName: match[3],
    commitSha: match[2],
    message: match[6],
    timestamp: new Date(Number.parseInt(match[5], 10) * 1000).toISOString(),
  } satisfies ReflogEntry;
}

function parseRecentReflogEntries(logText: string | null, limit = 5) {
  if (!logText) {
    return [] as ReflogEntry[];
  }

  return logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
    .map((line) =>
      line.match(
        /^([0-9a-f]{40}) ([0-9a-f]{40}) (.+) <([^>]+)> (\d+) [+-]\d+\t(.+)$/,
      ),
    )
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      authorEmail: match[4],
      authorName: match[3],
      commitSha: match[2],
      message: match[6],
      timestamp: new Date(Number.parseInt(match[5], 10) * 1000).toISOString(),
    }));
}

function countContributorsInLastWeek(logText: string | null) {
  if (!logText) {
    return 0;
  }

  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const authors = new Set<string>();
  for (const entry of parseRecentReflogEntries(logText, 200)) {
    if (new Date(entry.timestamp).getTime() >= cutoff && entry.authorEmail) {
      authors.add(entry.authorEmail);
    }
  }

  return authors.size;
}

function inferStatus(lastUpdated: string): WorkspaceProjectStatus {
  const ageInDays =
    (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);

  if (ageInDays <= 7) {
    return "healthy";
  }

  if (ageInDays <= 30) {
    return "warning";
  }

  return "critical";
}

function inferTeam(relativePath?: string) {
  return relativePath?.split("/").filter(Boolean)[0] ?? "root";
}

async function collectExtensionCounts(
  directoryHandle: AppFileSystemDirectoryHandle,
  extensionCounts = new Map<string, number>(),
  budget = { remaining: 800 },
) {
  if (budget.remaining <= 0) {
    return extensionCounts;
  }

  for await (const entry of directoryHandle.values()) {
    if (budget.remaining <= 0) {
      break;
    }

    if (entry.kind === "directory") {
      if (DIRECTORY_NAMES_TO_IGNORE.has(entry.name)) {
        continue;
      }

      await collectExtensionCounts(entry, extensionCounts, budget);
      continue;
    }

    const extension = entry.name.split(".").pop()?.toLowerCase();
    if (!extension || extension === entry.name.toLowerCase()) {
      continue;
    }

    budget.remaining -= 1;
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }

  return extensionCounts;
}

async function inferLanguage(directoryHandle: AppFileSystemDirectoryHandle) {
  const extensionCounts = await collectExtensionCounts(directoryHandle);
  const topExtension = Array.from(extensionCounts.entries()).sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];

  if (!topExtension) {
    return "Unknown";
  }

  return LANGUAGE_BY_EXTENSION[topExtension] ?? topExtension.toUpperCase();
}

async function inferDescription(
  repositoryHandle: AppFileSystemDirectoryHandle,
  language: string,
  repositoryName: string,
) {
  const packageJsonText = await readTextAtPath(repositoryHandle, "package.json");
  if (packageJsonText) {
    try {
      const packageJson = JSON.parse(packageJsonText) as { description?: string };
      if (packageJson.description) {
        return packageJson.description;
      }
    } catch {
      // Ignore malformed package.json content and fall back to defaults.
    }
  }

  return language === "Unknown"
    ? `Local repository ${repositoryName}`
    : `Local ${language} repository`;
}

async function collectBranchLogFiles(
  directoryHandle: AppFileSystemDirectoryHandle,
  currentPath = "",
  branchFiles: Array<{ fileHandle: AppFileSystemFileHandle; path: string }> = [],
) {
  for await (const entry of directoryHandle.values()) {
    const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      await collectBranchLogFiles(entry, nextPath, branchFiles);
    } else {
      branchFiles.push({ fileHandle: entry, path: nextPath });
    }
  }

  return branchFiles;
}

async function scanRepository(
  rootName: string,
  monitoredProject: MonitoredProject,
  repositoryHandle: AppFileSystemDirectoryHandle,
) {
  const gitHandle = await getOptionalDirectoryHandle(repositoryHandle, ".git");
  if (!gitHandle) {
    return null;
  }

  const [headText, configText, originHeadText, headLogText, branchLogsHandle, language] =
    await Promise.all([
      readTextAtPath(gitHandle, "HEAD"),
      readTextAtPath(gitHandle, "config"),
      readTextAtPath(gitHandle, "refs/remotes/origin/HEAD"),
      readTextAtPath(gitHandle, "logs/HEAD"),
      getDirectoryHandleByPath(gitHandle, "logs/refs/heads"),
      inferLanguage(repositoryHandle),
    ]);

  const currentBranch = parseRefName(headText) ?? "detached";
  const defaultBranch = parseRefName(originHeadText) ?? currentBranch;
  const lastHeadEntry = parseLastReflogEntry(headLogText);
  const lastUpdated = lastHeadEntry?.timestamp ?? new Date().toISOString();
  const branchLogFiles = branchLogsHandle
    ? await collectBranchLogFiles(branchLogsHandle)
    : [];
  const branches = branchLogFiles.map((branchLog) => branchLog.path);
  const branchReviews: Array<WorkspaceReviewItem | null> = await Promise.all(
    branchLogFiles
      .filter((branchLog) => branchLog.path !== defaultBranch)
      .map(async (branchLog) => {
        const reflogText = await readFileHandleText(branchLog.fileHandle);
        const lastEntry = parseLastReflogEntry(reflogText);
        if (!lastEntry) {
          return null;
        }

        const isStale =
          Date.now() - new Date(lastEntry.timestamp).getTime() >
          1000 * 60 * 60 * 24 * 14;

        return {
          author: lastEntry.authorName,
          branch: branchLog.path,
          id: `${monitoredProject.id}:${branchLog.path}`,
          repo: monitoredProject.name,
          status: isStale ? "stale" : "active",
          summary: lastEntry.message,
          updatedAt: lastEntry.timestamp,
        } satisfies WorkspaceReviewItem;
      }),
  );

  const description = await inferDescription(
    repositoryHandle,
    language,
    monitoredProject.name,
  );
  const remoteUrl = parseConfigOriginUrl(configText);
  const staleBranchCount = branchReviews.filter(
    (review) => review?.status === "stale",
  ).length;
  const project: WorkspaceProject = {
    aheadBy: 0,
    awaitingReviewCount: 0,
    behindBy: 0,
    branchCount: Math.max(branches.length, 1),
    ciStatus: "unknown",
    contributorCount7d: countContributorsInLastWeek(headLogText),
    currentBranch,
    defaultBranch,
    description,
    hasUpstream: false,
    id: monitoredProject.id,
    language,
    lastActivityMessage: lastHeadEntry?.message ?? null,
    lastUpdated,
    localPath:
      monitoredProject.localPath ??
      (monitoredProject.isRoot
        ? rootName
        : `${rootName}/${monitoredProject.relativePath ?? monitoredProject.name}`),
    name: monitoredProject.name,
    openPullRequestCount: 0,
    remoteUrl,
    relativePath: monitoredProject.relativePath,
    reviewedByViewerCount: 0,
    staleBranchCount,
    status: inferStatus(lastUpdated),
    team: inferTeam(monitoredProject.relativePath),
    unpushedCommitCount: 0,
  };

  const activities = parseRecentReflogEntries(headLogText, 5).map((entry, index) => {
  const type = entry.message.startsWith("checkout:")
    ? "checkout"
    : entry.message.startsWith("commit")
      ? "commit"
      : "repo";

    return {
      author: entry.authorName,
      commitIntegrationStatus: type === "commit" ? "unknown" : null,
      commitSha: type === "commit" ? entry.commitSha : null,
      description: entry.message,
      id: `${project.id}:activity:${index}:${entry.timestamp}`,
      repo: project.name,
      timestamp: entry.timestamp,
      title:
        type === "checkout"
          ? `Branch switched in ${project.name}`
          : type === "commit"
            ? `Commit recorded in ${project.name}`
            : `Repository activity in ${project.name}`,
      type,
    } satisfies WorkspaceActivityItem;
  });
  const userActivity = createEmptyUserActivitySummary();
  for (const entry of parseRecentReflogEntries(headLogText, 400)) {
    if (entry.message.startsWith("commit")) {
      addUserActivityCommit(userActivity, entry.timestamp);
    }
  }

  return {
    activities,
    authoredPullRequests: [],
    branches,
    project,
    pullRequests: [],
    reviews: branchReviews.filter(isWorkspaceReviewItem),
    userActivity,
  } satisfies RepositoryScanResult;
}

function createInsights(projects: WorkspaceProject[]) {
  const needsAttention = projects
    .filter((project) => project.status !== "healthy" || !project.remoteUrl)
    .slice(0, 2)
    .map((project) => ({
      title: !project.remoteUrl
        ? `${project.name} has no origin remote`
        : `${project.name} needs attention`,
      description: !project.remoteUrl
        ? "Connect a remote if you want hosted review and sync metadata."
        : `Latest repository activity was ${project.status === "warning" ? "over a week" : "over a month"} ago.`,
    }));

  const recentHighlights = [...projects]
    .sort(
      (left, right) =>
        new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime(),
    )
    .slice(0, 2)
    .map((project) => ({
      title: `${project.name} was active recently`,
      description: project.lastActivityMessage ?? `Current branch: ${project.currentBranch}`,
    }));

  return { needsAttention, recentHighlights };
}

function buildWorkspaceSnapshot(results: RepositoryScanResult[]) {
  const projects = results.map((result) => result.project);
  const githubStatus: WorkspaceGitHubStatus = {
    authenticated: false,
    connectedRepositoryCount: projects.filter((project) => Boolean(project.remoteUrl)).length,
    message: "GitHub pull request sync is available in the desktop app.",
    state: "unsupported",
    viewerLogin: null,
  };
  const reviews = results
    .flatMap((result) => result.reviews)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  const activities = results
    .flatMap((result) => result.activities)
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  const authoredPullRequests = results.flatMap(
    (result) => result.authoredPullRequests,
  );
  const userActivity = mergeUserActivitySummaries(
    results.map((result) => result.userActivity),
  );

  return {
    activities,
    authoredPullRequests,
    generatedAt: new Date().toISOString(),
    githubStatus,
    insights: createInsights(projects),
    pullRequests: [],
    projects,
    reviews,
    summary: {
      healthyRepositories: projects.filter((project) => project.status === "healthy")
        .length,
      localBranches: results.reduce(
        (total, result) => total + Math.max(result.branches.length, 1),
        0,
      ),
      openPullRequests: 0,
      repositories: projects.length,
      staleBranches: reviews.filter((review) => review.status === "stale").length,
    },
    userActivity,
  } satisfies WorkspaceSnapshot;
}

export async function loadWorkspaceSnapshot() {
  const workspaceSelection = getWorkspaceSelection();
  if (!workspaceSelection) {
    cacheWorkspaceSnapshot(null);
    return null;
  }

  const desktopApi = getDesktopApi();
  if (desktopApi) {
    const snapshot = await desktopApi.loadWorkspaceSnapshot(workspaceSelection);
    cacheWorkspaceSnapshot(snapshot);
    return snapshot;
  }

  const workspaceHandle = await getWorkspaceHandle();
  if (!workspaceHandle || !(await ensureWorkspaceHandlePermission(workspaceHandle))) {
    return getCachedWorkspaceSnapshot();
  }

  const repositoryResults: Array<RepositoryScanResult | null> = await Promise.all(
    workspaceSelection.projects.map(async (project) => {
      const repositoryHandle = await getDirectoryHandleByPath(
        workspaceHandle,
        project.relativePath,
      );

      if (!repositoryHandle) {
        return null;
      }

      return scanRepository(workspaceSelection.rootName, project, repositoryHandle);
    }),
  );

  const snapshot = buildWorkspaceSnapshot(
    repositoryResults.filter(isRepositoryScanResult),
  );
  cacheWorkspaceSnapshot(snapshot);

  return snapshot;
}
