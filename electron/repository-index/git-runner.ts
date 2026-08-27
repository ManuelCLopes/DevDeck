import { execFile } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FIELD_SEPARATOR = "\x1f";
const DEFAULT_MAX_COMMITS = 50;
const MAX_COMMITS_CAP = 200;
const GIT_TIMEOUT_MS = 8000;
const GIT_MAX_BUFFER_BYTES = 1024 * 1024 * 4;

export class RepositoryPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryPathError";
  }
}

/**
 * Resolves and validates a repository path before any git command runs
 * against it: must exist, must be a directory, and symlinks are
 * resolved to their real target (canonical path resolution — a
 * DevDeck-wide invariant for anything that reads the filesystem from a
 * renderer-supplied path). Does not by itself prove the path is a git
 * repository; git itself reports that clearly enough on the first
 * command (`not a git repository`) that duplicating the check here
 * would only add a second, possibly-inconsistent way to say the same
 * thing.
 */
export function resolveRepositoryPath(repositoryPath: string): string {
  let stats;
  try {
    stats = statSync(repositoryPath);
  } catch {
    throw new RepositoryPathError(`Repository path does not exist: ${repositoryPath}`);
  }

  if (!stats.isDirectory()) {
    throw new RepositoryPathError(`Repository path is not a directory: ${repositoryPath}`);
  }

  try {
    return realpathSync(repositoryPath);
  } catch {
    throw new RepositoryPathError(`Could not resolve repository path: ${repositoryPath}`);
  }
}

async function runGit(repositoryPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repositoryPath,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout;
}

export interface RepositoryHeadInfo {
  defaultBranch: string | null;
  headSha: string;
}

export async function getRepositoryHeadInfo(
  repositoryPathInput: string,
): Promise<RepositoryHeadInfo> {
  const repositoryPath = resolveRepositoryPath(repositoryPathInput);
  const headSha = (await runGit(repositoryPath, ["rev-parse", "HEAD"])).trim();

  let defaultBranch: string | null = null;
  try {
    const symbolicRef = (
      await runGit(repositoryPath, ["symbolic-ref", "refs/remotes/origin/HEAD"])
    ).trim();
    // "refs/remotes/origin/main" -> "main"
    defaultBranch = symbolicRef.split("/").pop() ?? null;
  } catch {
    // No configured remote HEAD (e.g. a local-only repository, or the
    // remote was never fetched with --tags/--prune). Not fatal.
  }

  return { defaultBranch, headSha };
}

export interface GitCommitMatch {
  authorDate: string;
  authorName: string;
  sha: string;
  subject: string;
}

/**
 * Exact issue-key commit search (BI-041) — the highest-confidence
 * evidence source per the retrieval order in
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 4.2. Matches
 * `--fixed-strings` (no regex interpretation of the issue key) across
 * every local ref, case-insensitively (commit conventions vary:
 * "Eng-123" vs "ENG-123").
 */
export async function searchCommitsByIssueKey(
  repositoryPathInput: string,
  issueKey: string,
  options: { maxResults?: number } = {},
): Promise<GitCommitMatch[]> {
  const repositoryPath = resolveRepositoryPath(repositoryPathInput);
  const maxResults = Math.min(options.maxResults ?? DEFAULT_MAX_COMMITS, MAX_COMMITS_CAP);

  const stdout = await runGit(repositoryPath, [
    "log",
    "--all",
    "--fixed-strings",
    "--regexp-ignore-case",
    `--grep=${issueKey}`,
    `--format=%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`,
    `-n${maxResults}`,
  ]);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, authorName, authorDate, subject] = line.split(FIELD_SEPARATOR);
      return { authorDate, authorName, sha, subject };
    });
}
