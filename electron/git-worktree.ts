import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import type {
  CreateGitWorktreeSessionRequest,
  CreateGitWorktreeSessionResult,
  RemoveGitWorktreeSessionRequest,
} from "../shared/sessions";

const execFileAsync = promisify(execFile);

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
    await execFileAsync("git", [
      "-C",
      repositoryPath,
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
