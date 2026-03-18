import { execFile } from "child_process";
import { access, readFile, readdir } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  fetchGitHubCommitStatus,
  fetchGitHubPullRequestReviews,
  fetchGitHubPullRequests,
  fetchGitHubViewer,
  GitHubApiError,
  type GitHubApiPullRequest,
  type GitHubApiPullRequestReview,
} from "./github-api";
import { readStoredGitHubToken } from "./github-auth";
import type {
  MonitoredProject,
  WorkspaceCiStatus,
  WorkspaceDiscoveryResult,
  WorkspaceGitHubState,
  WorkspaceGitHubStatus,
  WorkspaceProject,
  WorkspacePullRequestReviewEvent,
  WorkspaceProjectStatus,
  WorkspacePullRequestItem,
  WorkspacePullRequestReviewState,
  WorkspacePullRequestStatus,
  WorkspaceReviewItem,
  WorkspaceSnapshot,
} from "../shared/workspace";

interface ReflogEntry {
  authorEmail: string | null;
  authorName: string | null;
  message: string;
  timestamp: string;
}

interface RepositoryScanResult {
  activities: WorkspaceSnapshot["activities"];
  branches: string[];
  project: WorkspaceProject;
  pullRequests: WorkspacePullRequestItem[];
  reviews: WorkspaceReviewItem[];
}

interface RepositorySyncStatus {
  aheadBy: number;
  behindBy: number;
  hasUpstream: boolean;
}

interface GitHubPullRequestRecord {
  author: { login: string } | null;
  baseRefName: string;
  headSha: string;
  headRefName: string;
  isDraft: boolean;
  latestReviews: GitHubPullRequestReviewRecord[];
  number: number;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  reviews: GitHubPullRequestReviewRecord[];
  title: string;
  updatedAt: string;
  url: string;
}

interface GitHubPullRequestReviewRecord {
  author: { login: string } | null;
  state: string;
  submittedAt: string | null;
}

interface GitHubAuthStatus {
  authenticated: boolean;
  message: string | null;
  state: WorkspaceGitHubState;
  token: string | null;
  viewerLogin: string | null;
}

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
const MAX_DISCOVERY_DEPTH = 2;
const MAX_DISCOVERY_DIRECTORIES = 400;
const GITHUB_AUTH_CACHE_TTL_MS = 1000 * 60 * 5;
const PULL_REQUEST_CACHE_TTL_MS = 1000 * 60 * 2;
const CI_STATUS_CACHE_TTL_MS = 1000 * 60 * 2;

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

let cachedGitHubAuthStatus:
  | (GitHubAuthStatus & { expiresAt: number })
  | null = null;
const pullRequestCache = new Map<
  string,
  { expiresAt: number; pullRequests: WorkspacePullRequestItem[] }
>();
const ciStatusCache = new Map<
  string,
  { expiresAt: number; status: WorkspaceCiStatus }
>();

const execFileAsync = promisify(execFile);

function createRepositoryCandidate(
  rootName: string,
  localPath: string,
  relativePath = "",
): MonitoredProject {
  const isRoot = relativePath.length === 0;
  const pathSegments = relativePath.split("/").filter(Boolean);

  return {
    id: `${rootName}/${relativePath || "."}`,
    isRoot,
    localPath,
    name: isRoot ? rootName : pathSegments[pathSegments.length - 1] ?? rootName,
    relativePath: isRoot ? undefined : relativePath,
    repositoryCount: 1,
  };
}

function createWorkspaceRootCandidate(rootName: string, localPath: string): MonitoredProject {
  return {
    id: `${rootName}/.`,
    isRoot: true,
    localPath,
    name: rootName,
    repositoryCount: 0,
  };
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectoryEntries(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function shouldSkipDiscoveryDirectory(entryName: string) {
  return (
    DIRECTORY_NAMES_TO_IGNORE.has(entryName) ||
    entryName.startsWith(".") ||
    entryName.endsWith(".app")
  );
}

async function collectRepositoryCandidates(
  rootPath: string,
  rootName: string,
  relativePath = "",
  depth = 0,
  budget = { remaining: MAX_DISCOVERY_DIRECTORIES },
): Promise<MonitoredProject[]> {
  if (budget.remaining <= 0) {
    return [];
  }

  budget.remaining -= 1;
  const directoryPath = relativePath ? path.join(rootPath, relativePath) : rootPath;

  if (await pathExists(path.join(directoryPath, ".git"))) {
    return [createRepositoryCandidate(rootName, directoryPath, relativePath)];
  }

  if (depth >= MAX_DISCOVERY_DEPTH) {
    return [];
  }

  const entries = await readDirectoryEntries(directoryPath);

  const candidates: MonitoredProject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDiscoveryDirectory(entry.name)) {
      continue;
    }

    const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    candidates.push(
      ...(await collectRepositoryCandidates(
        rootPath,
        rootName,
        childRelativePath,
        depth + 1,
        budget,
      )),
    );
  }

  return candidates;
}

export async function discoverWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  const normalizedRootPath = path.resolve(rootPath);
  const rootName = path.basename(normalizedRootPath);
  const discoveredRepositories = await collectRepositoryCandidates(
    normalizedRootPath,
    rootName,
  );
  const candidates =
    discoveredRepositories.length > 0
      ? discoveredRepositories
      : [createWorkspaceRootCandidate(rootName, normalizedRootPath)];

  return {
    candidates,
    discoveredRepositoryCount: discoveredRepositories.length,
    rootName,
    rootPath: normalizedRootPath,
  };
}

async function readOptionalText(targetPath: string) {
  try {
    return await readFile(targetPath, "utf8");
  } catch {
    return null;
  }
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
    /^[0-9a-f]{40} [0-9a-f]{40} (.+) <([^>]+)> (\d+) [+-]\d+\t(.+)$/,
  );

  if (!match) {
    return null;
  }

  return {
    authorEmail: match[2],
    authorName: match[1],
    message: match[4],
    timestamp: new Date(Number.parseInt(match[3], 10) * 1000).toISOString(),
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
      line.match(/^[0-9a-f]{40} [0-9a-f]{40} (.+) <([^>]+)> (\d+) [+-]\d+\t(.+)$/),
    )
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      authorEmail: match[2],
      authorName: match[1],
      message: match[4],
      timestamp: new Date(Number.parseInt(match[3], 10) * 1000).toISOString(),
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

function inferStatus(project: Pick<
  WorkspaceProject,
  "ciStatus" | "lastUpdated" | "remoteUrl" | "staleBranchCount" | "unpushedCommitCount"
>): WorkspaceProjectStatus {
  if (project.ciStatus === "failing") {
    return "critical";
  }

  const ageInDays =
    (Date.now() - new Date(project.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);

  if (
    ageInDays <= 7 &&
    project.staleBranchCount === 0 &&
    project.unpushedCommitCount === 0 &&
    Boolean(project.remoteUrl) &&
    project.ciStatus !== "pending"
  ) {
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

function parseGitHubRepository(remoteUrl: string | null) {
  const normalizedRemoteUrl = remoteUrl?.trim();
  if (!normalizedRemoteUrl) {
    return null;
  }

  const patterns = [
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^git:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedRemoteUrl.match(pattern);
    const owner = match?.[1];
    const repo = match?.[2]?.replace(/\.git$/, "");
    if (owner && repo) {
      return { owner, repo, slug: `${owner}/${repo}` };
    }
  }

  return null;
}

function normalizePullRequestRecord(
  pullRequest: GitHubApiPullRequest,
  reviews: GitHubApiPullRequestReview[],
) {
  const latestReviewerState = new Map<string, { state: string; submittedAt: number }>();
  const normalizedReviews = reviews
    .map((review) => ({
      author: review.user ? { login: review.user.login } : null,
      state: review.state,
      submittedAt: review.submitted_at,
    }))
    .sort((left, right) => {
      const leftTime = left.submittedAt ? new Date(left.submittedAt).getTime() : 0;
      const rightTime = right.submittedAt ? new Date(right.submittedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  for (const review of reviews) {
    const reviewerLogin = review.user?.login ?? null;
    if (!reviewerLogin) {
      continue;
    }

    const submittedAt = review.submitted_at
      ? new Date(review.submitted_at).getTime()
      : 0;
    const currentLatestReview = latestReviewerState.get(reviewerLogin);
    if (!currentLatestReview || submittedAt >= currentLatestReview.submittedAt) {
      latestReviewerState.set(reviewerLogin, {
        state: review.state,
        submittedAt,
      });
    }
  }

  const latestStates = Array.from(latestReviewerState.values()).map(
    (review) => review.state,
  );
  const latestReviews = Array.from(latestReviewerState.entries()).map(
    ([reviewerLogin, review]) => ({
      author: { login: reviewerLogin },
      state: review.state,
      submittedAt:
        review.submittedAt > 0 ? new Date(review.submittedAt).toISOString() : null,
    }),
  );
  let reviewDecision: GitHubPullRequestRecord["reviewDecision"] = null;
  if (latestStates.includes("CHANGES_REQUESTED")) {
    reviewDecision = "CHANGES_REQUESTED";
  } else if (latestStates.includes("APPROVED")) {
    reviewDecision = "APPROVED";
  } else if (
    pullRequest.requested_reviewers.length > 0 ||
    latestStates.length === 0
  ) {
    reviewDecision = "REVIEW_REQUIRED";
  }

  return {
    author: pullRequest.user ? { login: pullRequest.user.login } : null,
    baseRefName: pullRequest.base.ref,
    headSha: pullRequest.head.sha,
    headRefName: pullRequest.head.ref,
    isDraft: pullRequest.draft,
    latestReviews,
    number: pullRequest.number,
    reviewDecision,
    reviews: normalizedReviews,
    title: pullRequest.title,
    updatedAt: pullRequest.updated_at,
    url: pullRequest.html_url,
  } satisfies GitHubPullRequestRecord;
}

function getPullRequestStatus(
  pullRequest: Pick<GitHubPullRequestRecord, "isDraft" | "reviewDecision">,
): WorkspacePullRequestStatus {
  if (pullRequest.isDraft) {
    return "draft";
  }

  switch (pullRequest.reviewDecision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "REVIEW_REQUIRED":
      return "review_required";
    default:
      return "open";
  }
}

function normalizeReviewerLogins(
  pullRequest: Pick<GitHubPullRequestRecord, "author" | "latestReviews" | "reviews">,
) {
  const authorLogin = pullRequest.author?.login ?? null;
  const reviewerLogins = new Set<string>();

  for (const review of [...pullRequest.latestReviews, ...pullRequest.reviews]) {
    const reviewerLogin = review.author?.login ?? null;
    if (!reviewerLogin || reviewerLogin === authorLogin) {
      continue;
    }

    reviewerLogins.add(reviewerLogin);
  }

  return Array.from(reviewerLogins);
}

function getPullRequestReviewState(
  reviewedByViewer: boolean,
  reviewCount: number,
): WorkspacePullRequestReviewState {
  if (reviewedByViewer) {
    return "reviewed_by_you";
  }

  if (reviewCount > 0) {
    return "reviewed";
  }

  return "unreviewed";
}

export function clearWorkspaceSnapshotCaches() {
  cachedGitHubAuthStatus = null;
  pullRequestCache.clear();
  ciStatusCache.clear();
}

async function getGitHubAuthStatus(): Promise<GitHubAuthStatus> {
  if (
    cachedGitHubAuthStatus &&
    cachedGitHubAuthStatus.expiresAt > Date.now()
  ) {
    return cachedGitHubAuthStatus;
  }

  try {
    const token = await readStoredGitHubToken();
    if (!token) {
      cachedGitHubAuthStatus = {
        authenticated: false,
        expiresAt: Date.now() + GITHUB_AUTH_CACHE_TTL_MS,
        message: "Connect GitHub in Preferences to load live pull request data.",
        state: "unauthenticated",
        token: null,
        viewerLogin: null,
      };

      return cachedGitHubAuthStatus;
    }
    const viewer = await fetchGitHubViewer(token);

    cachedGitHubAuthStatus = {
      authenticated: true,
      expiresAt: Date.now() + GITHUB_AUTH_CACHE_TTL_MS,
      message: "Live GitHub pull request data is available through the GitHub API.",
      state: "connected",
      token,
      viewerLogin: viewer.login,
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) {
      cachedGitHubAuthStatus = {
        authenticated: false,
        expiresAt: Date.now() + GITHUB_AUTH_CACHE_TTL_MS,
        message: "The saved GitHub credentials were rejected. Reconnect GitHub in Preferences.",
        state: "unauthenticated",
        token: null,
        viewerLogin: null,
      };

      return cachedGitHubAuthStatus;
    }

    cachedGitHubAuthStatus = {
      authenticated: false,
      expiresAt: Date.now() + GITHUB_AUTH_CACHE_TTL_MS,
      message: "GitHub could not be reached. Check your connection and retry.",
      state: "error",
      token: null,
      viewerLogin: null,
    };
  }

  return cachedGitHubAuthStatus;
}

async function fetchPullRequests(
  project: Pick<WorkspaceProject, "id" | "name">,
  remoteUrl: string | null,
  githubAuthStatus: GitHubAuthStatus,
) {
  const githubRepository = parseGitHubRepository(remoteUrl);
  if (
    !githubRepository ||
    !githubAuthStatus.authenticated ||
    !githubAuthStatus.token
  ) {
    return [] as WorkspacePullRequestItem[];
  }

  const cachedPullRequests = pullRequestCache.get(githubRepository.slug);
  if (cachedPullRequests && cachedPullRequests.expiresAt > Date.now()) {
    return cachedPullRequests.pullRequests;
  }

  try {
    const pullRequests = await fetchGitHubPullRequests(
      githubRepository.slug,
      githubAuthStatus.token,
    );
    const pullRequestReviews = await Promise.all(
      pullRequests.map((pullRequest) =>
        fetchGitHubPullRequestReviews(
          githubRepository.slug,
          pullRequest.number,
          githubAuthStatus.token!,
        ),
      ),
    );
    const pullRequestCiStatuses = await Promise.all(
      pullRequests.map((pullRequest) =>
        fetchDefaultBranchCiStatus(
          githubRepository.slug,
          pullRequest.head.sha,
          githubAuthStatus,
        ),
      ),
    );

    const workspacePullRequests = pullRequests.map((pullRequest, index) => {
      const reviews = pullRequestReviews[index];
      const ciStatus = pullRequestCiStatuses[index] ?? "unknown";
      const normalizedPullRequest = normalizePullRequestRecord(
        pullRequest,
        reviews,
      );
      const authorLogin = normalizedPullRequest.author?.login ?? null;
      const requestedReviewerLogins = pullRequest.requested_reviewers
        .map((reviewer) => reviewer.login)
        .filter((reviewerLogin) => reviewerLogin !== authorLogin);
      const reviewerLogins = normalizeReviewerLogins(normalizedPullRequest);
      const reviewedByViewer = githubAuthStatus.viewerLogin
        ? reviewerLogins.includes(githubAuthStatus.viewerLogin)
        : false;
      const isViewerRequestedReviewer = githubAuthStatus.viewerLogin
        ? requestedReviewerLogins.includes(githubAuthStatus.viewerLogin)
        : false;
      const reviewedByOthersCount = reviewerLogins.filter(
        (reviewerLogin) => reviewerLogin !== githubAuthStatus.viewerLogin,
      ).length;

      return {
        author: authorLogin,
        authoredByViewer:
          Boolean(githubAuthStatus.viewerLogin) &&
          authorLogin === githubAuthStatus.viewerLogin,
        baseBranch: normalizedPullRequest.baseRefName,
        ciStatus,
        headBranch: normalizedPullRequest.headRefName,
        id: `${githubRepository.slug}#${normalizedPullRequest.number}`,
        isViewerRequestedReviewer,
        number: normalizedPullRequest.number,
        projectId: project.id,
        repo: project.name,
        reviewCount: reviewerLogins.length,
        reviewState: getPullRequestReviewState(
          reviewedByViewer,
          reviewerLogins.length,
        ),
        reviewTimeline: createPullRequestReviewTimeline(
          githubRepository.slug,
          normalizedPullRequest.number,
          normalizedPullRequest.reviews,
        ),
        requestedReviewerLogins,
        reviewedByOthersCount,
        reviewedByViewer,
        reviewerLogins,
        status: getPullRequestStatus(normalizedPullRequest),
        title: normalizedPullRequest.title,
        updatedAt: normalizedPullRequest.updatedAt,
        url: normalizedPullRequest.url,
      } satisfies WorkspacePullRequestItem;
    });

    pullRequestCache.set(githubRepository.slug, {
      expiresAt: Date.now() + PULL_REQUEST_CACHE_TTL_MS,
      pullRequests: workspacePullRequests,
    });

    return workspacePullRequests;
  } catch (error) {
    console.error(
      `Failed to load pull requests for ${githubRepository.slug}`,
      error,
    );
    return [] as WorkspacePullRequestItem[];
  }
}

async function getBranchSyncStatus(
  repositoryPath: string,
): Promise<RepositorySyncStatus> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
      {
        cwd: repositoryPath,
        timeout: 4000,
        maxBuffer: 1024 * 64,
      },
    );
    const [aheadRaw = "0", behindRaw = "0"] = stdout.trim().split(/\s+/);

    return {
      aheadBy: Number.parseInt(aheadRaw, 10) || 0,
      behindBy: Number.parseInt(behindRaw, 10) || 0,
      hasUpstream: true,
    };
  } catch {
    return {
      aheadBy: 0,
      behindBy: 0,
      hasUpstream: false,
    };
  }
}

function mapGitHubCommitStateToCiStatus(commitState: string | null) {
  switch (commitState) {
    case "success":
      return "passing" satisfies WorkspaceCiStatus;
    case "failure":
    case "error":
      return "failing" satisfies WorkspaceCiStatus;
    case "pending":
      return "pending" satisfies WorkspaceCiStatus;
    default:
      return "unknown" satisfies WorkspaceCiStatus;
  }
}

async function fetchDefaultBranchCiStatus(
  repositorySlug: string | null,
  ref: string,
  githubAuthStatus: GitHubAuthStatus,
) {
  if (
    !repositorySlug ||
    !githubAuthStatus.authenticated ||
    !githubAuthStatus.token
  ) {
    return "unknown" satisfies WorkspaceCiStatus;
  }

  const cacheKey = `${repositorySlug}#${ref}`;
  const cachedStatus = ciStatusCache.get(cacheKey);
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) {
    return cachedStatus.status;
  }

  try {
    const commitState = await fetchGitHubCommitStatus(
      repositorySlug,
      ref,
      githubAuthStatus.token,
    );
    const ciStatus = mapGitHubCommitStateToCiStatus(commitState);

    ciStatusCache.set(cacheKey, {
      expiresAt: Date.now() + CI_STATUS_CACHE_TTL_MS,
      status: ciStatus,
    });

    return ciStatus;
  } catch {
    return "unknown" satisfies WorkspaceCiStatus;
  }
}

function createPullRequestReviewTimeline(
  repositorySlug: string,
  pullRequestNumber: number,
  reviews: GitHubPullRequestReviewRecord[],
) {
  return reviews.map((review, index) => ({
    id: `${repositorySlug}#${pullRequestNumber}:review:${index}:${
      review.submittedAt ?? review.author?.login ?? "unknown"
    }`,
    reviewerLogin: review.author?.login ?? null,
    state: review.state,
    submittedAt: review.submittedAt,
  })) satisfies WorkspacePullRequestReviewEvent[];
}

async function collectExtensionCounts(
  directoryPath: string,
  extensionCounts = new Map<string, number>(),
  budget = { remaining: 800 },
) {
  if (budget.remaining <= 0) {
    return extensionCounts;
  }

  const entries = await readDirectoryEntries(directoryPath);
  for (const entry of entries) {
    if (budget.remaining <= 0) {
      break;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (DIRECTORY_NAMES_TO_IGNORE.has(entry.name)) {
        continue;
      }

      await collectExtensionCounts(entryPath, extensionCounts, budget);
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

async function inferLanguage(repositoryPath: string) {
  const extensionCounts = await collectExtensionCounts(repositoryPath);
  const topExtension = Array.from(extensionCounts.entries()).sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];

  if (!topExtension) {
    return "Unknown";
  }

  return LANGUAGE_BY_EXTENSION[topExtension] ?? topExtension.toUpperCase();
}

async function inferDescription(
  repositoryPath: string,
  language: string,
  repositoryName: string,
) {
  const packageJsonText = await readOptionalText(path.join(repositoryPath, "package.json"));
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
  directoryPath: string,
  currentPath = "",
  branchFiles: Array<{ path: string; filePath: string }> = [],
) {
  const entries = await readDirectoryEntries(directoryPath);

  for (const entry of entries) {
    const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await collectBranchLogFiles(entryPath, nextPath, branchFiles);
    } else {
      branchFiles.push({ filePath: entryPath, path: nextPath });
    }
  }

  return branchFiles;
}

async function scanRepository(
  rootPath: string,
  monitoredProject: MonitoredProject,
  githubAuthStatus: GitHubAuthStatus,
) {
  const repositoryPath =
    monitoredProject.localPath ??
    (monitoredProject.relativePath ? path.join(rootPath, monitoredProject.relativePath) : rootPath);

  try {
    const gitPath = path.join(repositoryPath, ".git");

    if (!(await pathExists(gitPath))) {
      return null;
    }

    const [headText, configText, originHeadText, headLogText, language, syncStatus] = await Promise.all([
      readOptionalText(path.join(gitPath, "HEAD")),
      readOptionalText(path.join(gitPath, "config")),
      readOptionalText(path.join(gitPath, "refs", "remotes", "origin", "HEAD")),
      readOptionalText(path.join(gitPath, "logs", "HEAD")),
      inferLanguage(repositoryPath),
      getBranchSyncStatus(repositoryPath),
    ]);

    const branchLogsPath = path.join(gitPath, "logs", "refs", "heads");
    const branchLogFiles = (await pathExists(branchLogsPath))
      ? await collectBranchLogFiles(branchLogsPath)
      : [];

    const currentBranch = parseRefName(headText) ?? "detached";
    const defaultBranch = parseRefName(originHeadText) ?? currentBranch;
    const lastHeadEntry = parseLastReflogEntry(headLogText);
    const lastUpdated = lastHeadEntry?.timestamp ?? new Date().toISOString();
    const branches = branchLogFiles.map((branchLog) => branchLog.path);
    const branchReviews: Array<WorkspaceReviewItem | null> = await Promise.all(
      branchLogFiles
        .filter((branchLog) => branchLog.path !== defaultBranch)
        .map(async (branchLog) => {
          const reflogText = await readOptionalText(branchLog.filePath);
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

    const description = await inferDescription(repositoryPath, language, monitoredProject.name);
    const remoteUrl = parseConfigOriginUrl(configText);
    const githubRepository = parseGitHubRepository(remoteUrl);
    const staleBranchCount = branchReviews.filter(
      (review) => review?.status === "stale",
    ).length;
    const defaultBranchCiStatus = await fetchDefaultBranchCiStatus(
      githubRepository?.slug ?? null,
      defaultBranch,
      githubAuthStatus,
    );
    const baseProject: WorkspaceProject = {
      aheadBy: syncStatus.aheadBy,
      awaitingReviewCount: 0,
      behindBy: syncStatus.behindBy,
      branchCount: Math.max(branches.length, 1),
      ciStatus: defaultBranchCiStatus,
      contributorCount7d: countContributorsInLastWeek(headLogText),
      currentBranch,
      defaultBranch,
      description,
      hasUpstream: syncStatus.hasUpstream,
      id: monitoredProject.id,
      language,
      lastActivityMessage: lastHeadEntry?.message ?? null,
      lastUpdated,
      localPath: repositoryPath,
      name: monitoredProject.name,
      openPullRequestCount: 0,
      remoteUrl,
      relativePath: monitoredProject.relativePath,
      reviewedByViewerCount: 0,
      staleBranchCount,
      status: "healthy",
      team: inferTeam(monitoredProject.relativePath),
      unpushedCommitCount: syncStatus.aheadBy,
    };
    const pullRequests = await fetchPullRequests(
      baseProject,
      remoteUrl,
      githubAuthStatus,
    );
    const project: WorkspaceProject = {
      ...baseProject,
      awaitingReviewCount: pullRequests.filter(
        (pullRequest) => pullRequest.reviewState === "unreviewed",
      ).length,
      openPullRequestCount: pullRequests.length,
      reviewedByViewerCount: pullRequests.filter(
        (pullRequest) => pullRequest.reviewedByViewer,
      ).length,
      status: inferStatus({
        ciStatus: baseProject.ciStatus,
        lastUpdated: baseProject.lastUpdated,
        remoteUrl: baseProject.remoteUrl,
        staleBranchCount: baseProject.staleBranchCount,
        unpushedCommitCount: baseProject.unpushedCommitCount,
      }),
    };

    const activities = parseRecentReflogEntries(headLogText, 5).map((entry, index) => {
      const type = entry.message.startsWith("checkout:")
        ? "checkout"
        : entry.message.startsWith("commit:")
          ? "commit"
          : "repo";

      return {
        author: entry.authorName,
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
      } satisfies WorkspaceSnapshot["activities"][number];
    });

    return {
      activities,
      branches,
      project,
      pullRequests,
      reviews: branchReviews.filter(
        (review): review is WorkspaceReviewItem => review !== null,
      ),
    } satisfies RepositoryScanResult;
  } catch (error) {
    console.error(`Failed to scan repository at ${repositoryPath}`, error);
    return null;
  }
}

function createInsights(projects: WorkspaceProject[]) {
  const needsAttention = projects
    .filter(
      (project) =>
        project.status !== "healthy" ||
        !project.remoteUrl ||
        project.awaitingReviewCount > 0,
    )
    .slice(0, 2)
    .map((project) => ({
      title:
        project.ciStatus === "failing"
          ? `${project.name} has failing CI`
          : project.awaitingReviewCount > 0
            ? `${project.name} has PRs waiting for review`
            : !project.remoteUrl
              ? `${project.name} has no origin remote`
              : `${project.name} needs attention`,
      description:
        project.ciStatus === "failing"
          ? `Default branch checks are failing and ${project.unpushedCommitCount} local commit${project.unpushedCommitCount === 1 ? "" : "s"} are ahead.`
          : project.awaitingReviewCount > 0
            ? `${project.awaitingReviewCount} pull request${project.awaitingReviewCount === 1 ? "" : "s"} still need a first review.`
            : !project.remoteUrl
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

function buildWorkspaceSnapshot(
  results: RepositoryScanResult[],
  githubStatus: WorkspaceGitHubStatus,
) {
  const projects = results.map((result) => result.project);
  const pullRequests = results
    .flatMap((result) => result.pullRequests)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
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

  return {
    activities,
    generatedAt: new Date().toISOString(),
    githubStatus,
    insights: createInsights(projects),
    pullRequests,
    projects,
    reviews,
    summary: {
      healthyRepositories: projects.filter((project) => project.status === "healthy")
        .length,
      localBranches: results.reduce(
        (total, result) => total + Math.max(result.branches.length, 1),
        0,
      ),
      openPullRequests: pullRequests.length,
      repositories: projects.length,
      staleBranches: reviews.filter((review) => review.status === "stale").length,
    },
  } satisfies WorkspaceSnapshot;
}

export async function loadWorkspaceSnapshot(selection: {
  projects: MonitoredProject[];
  rootPath?: string;
  rootName: string;
}) {
  const githubAuthStatus = await getGitHubAuthStatus();
  const repositoryResults: Array<RepositoryScanResult | null> = await Promise.all(
    selection.projects.map((project) =>
      scanRepository(
        project.localPath ?? selection.rootPath ?? selection.rootName,
        project,
        githubAuthStatus,
      ),
    ),
  );
  const connectedRepositoryCount = repositoryResults.reduce((count, result) => {
    if (!result || !parseGitHubRepository(result.project.remoteUrl)) {
      return count;
    }

    return count + 1;
  }, 0);
  const githubStatus: WorkspaceGitHubStatus = {
    authenticated: githubAuthStatus.authenticated,
    connectedRepositoryCount,
    message:
      githubAuthStatus.authenticated && connectedRepositoryCount === 0
        ? "No GitHub remotes were detected in the current workspace."
        : githubAuthStatus.message,
    state: githubAuthStatus.state,
    viewerLogin: githubAuthStatus.viewerLogin,
  };

  return buildWorkspaceSnapshot(
    repositoryResults.filter(
      (result): result is RepositoryScanResult => result !== null,
    ),
    githubStatus,
  );
}
