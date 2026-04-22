import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import type {
  CreateGitWorktreeSessionRequest,
  CreateGitWorktreeSessionResult,
  DevSessionOperationalSnapshot,
  InspectDevSessionRequest,
  RemoveGitWorktreeSessionRequest,
} from "../shared/sessions";

const execFileAsync = promisify(execFile);

async function execGit(
  repositoryPath: string,
  args: string[],
  options?: { timeout?: number },
) {
  return execFileAsync("git", ["-C", repositoryPath, ...args], {
    maxBuffer: 1024 * 128,
    timeout: options?.timeout ?? 4000,
  });
}

async function readGitOutput(
  repositoryPath: string,
  args: string[],
  options?: { timeout?: number },
) {
  const { stdout } = await execGit(repositoryPath, args, options);
  return stdout.trim();
}

async function readOptionalGitOutput(
  repositoryPath: string,
  args: string[],
  options?: { timeout?: number },
) {
  try {
    return await readGitOutput(repositoryPath, args, options);
  } catch {
    return null;
  }
}

export function sanitizeWorktreeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "session";
}

async function gitLocalBranchExists(repositoryPath: string, branchName: string) {
  try {
    await execGit(repositoryPath, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchName}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

function buildWorktreePath(
  repositoryPath: string,
  branchName: string,
  sessionPath?: string | null,
) {
  if (sessionPath?.trim()) {
    return sessionPath.trim();
  }

  const repositoryName = path.basename(repositoryPath);
  const parentDirectory = path.dirname(repositoryPath);
  const sanitizedBranch = sanitizeWorktreeSegment(branchName);
  let suffix = 0;

  while (true) {
    const candidateName =
      suffix === 0
        ? `${repositoryName}--${sanitizedBranch}`
        : `${repositoryName}--${sanitizedBranch}-${suffix + 1}`;
    const candidatePath = path.join(parentDirectory, candidateName);

    if (!existsSync(candidatePath)) {
      return candidatePath;
    }

    suffix += 1;
  }
}

async function resolveAvailableBranchName(
  repositoryPath: string,
  requestedBranchName: string,
) {
  const sanitizedBaseBranch = sanitizeWorktreeSegment(requestedBranchName);
  let suffix = 0;

  while (true) {
    const candidateBranch =
      suffix === 0 ? sanitizedBaseBranch : `${sanitizedBaseBranch}-${suffix + 1}`;

    if (!(await gitLocalBranchExists(repositoryPath, candidateBranch))) {
      return candidateBranch;
    }

    suffix += 1;
  }
}

export async function createGitWorktreeSession(
  request: CreateGitWorktreeSessionRequest,
): Promise<CreateGitWorktreeSessionResult> {
  const baseRef = request.baseRef.trim() || "HEAD";
  const branchName = await resolveAvailableBranchName(
    request.repositoryPath,
    request.branchName,
  );
  const localPath = buildWorktreePath(
    request.repositoryPath,
    branchName,
    request.sessionPath,
  );

  await execFileAsync("git", [
    "-C",
    request.repositoryPath,
    "worktree",
    "add",
    "-b",
    branchName,
    localPath,
    baseRef,
  ]);

  return {
    branchName,
    localPath,
  };
}

export async function removeGitWorktreeSession(
  request: RemoveGitWorktreeSessionRequest,
) {
  await execFileAsync("git", [
    "-C",
    request.repositoryPath,
    "worktree",
    "remove",
    "--force",
    request.worktreePath,
  ]);
  await execFileAsync("git", [
    "-C",
    request.repositoryPath,
    "worktree",
    "prune",
  ]);
}

async function getBranchSyncStatus(repositoryPath: string) {
  try {
    const stdout = await readGitOutput(repositoryPath, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ]);
    const [aheadRaw = "0", behindRaw = "0"] = stdout.split(/\s+/);

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

async function getUniqueCommitCount(
  repositoryPath: string,
  defaultBranchRef: string | null,
) {
  if (!defaultBranchRef) {
    return null;
  }

  const stdout = await readOptionalGitOutput(repositoryPath, [
    "rev-list",
    "--count",
    `${defaultBranchRef}..HEAD`,
  ]);
  if (!stdout) {
    return null;
  }

  return Number.parseInt(stdout, 10) || 0;
}

export async function inspectDevSession(
  request: InspectDevSessionRequest,
): Promise<DevSessionOperationalSnapshot> {
  const baseSnapshot: DevSessionOperationalSnapshot = {
    aheadBy: 0,
    behindBy: 0,
    currentBranch: null,
    defaultBranch: null,
    exists: existsSync(request.localPath),
    hasUncommittedChanges: false,
    hasUpstream: false,
    isDetached: false,
    isRepository: false,
    lastCommitCommittedAt: null,
    lastCommitSha: null,
    lastCommitShortSha: null,
    lastCommitSubject: null,
    sessionId: request.sessionId,
    uniqueCommitCount: null,
  };

  if (!baseSnapshot.exists) {
    return baseSnapshot;
  }

  try {
    await execGit(request.localPath, ["rev-parse", "--show-toplevel"]);
  } catch {
    return baseSnapshot;
  }

  const [
    branchName,
    originHeadRef,
    syncStatus,
    statusOutput,
    lastCommitOutput,
  ] = await Promise.all([
    readOptionalGitOutput(request.localPath, ["branch", "--show-current"]),
    readOptionalGitOutput(request.localPath, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD",
    ]),
    getBranchSyncStatus(request.localPath),
    readOptionalGitOutput(request.localPath, ["status", "--porcelain"]),
    readOptionalGitOutput(request.localPath, [
      "log",
      "-1",
      "--pretty=format:%H%x1f%h%x1f%s%x1f%cI",
    ]),
  ]);

  const currentBranch = branchName && branchName.length > 0 ? branchName : null;
  const defaultBranchRef = originHeadRef && originHeadRef.length > 0 ? originHeadRef : null;
  const defaultBranch = defaultBranchRef
    ? defaultBranchRef.replace(/^origin\//, "")
    : currentBranch;
  const uniqueCommitCount = await getUniqueCommitCount(
    request.localPath,
    defaultBranchRef ?? defaultBranch,
  );

  let lastCommitSha: string | null = null;
  let lastCommitShortSha: string | null = null;
  let lastCommitSubject: string | null = null;
  let lastCommitCommittedAt: string | null = null;

  if (lastCommitOutput) {
    const [sha, shortSha, subject, committedAt] = lastCommitOutput.split("\u001f");
    lastCommitSha = sha ?? null;
    lastCommitShortSha = shortSha ?? null;
    lastCommitSubject = subject ?? null;
    lastCommitCommittedAt = committedAt ?? null;
  }

  return {
    ...baseSnapshot,
    aheadBy: syncStatus.aheadBy,
    behindBy: syncStatus.behindBy,
    currentBranch,
    defaultBranch,
    hasUncommittedChanges: Boolean(statusOutput),
    hasUpstream: syncStatus.hasUpstream,
    isDetached: currentBranch === null,
    isRepository: true,
    lastCommitCommittedAt,
    lastCommitSha,
    lastCommitShortSha,
    lastCommitSubject,
    uniqueCommitCount,
  };
}

export async function inspectDevSessions(
  requests: InspectDevSessionRequest[],
) {
  return Promise.all(requests.map((request) => inspectDevSession(request)));
}
