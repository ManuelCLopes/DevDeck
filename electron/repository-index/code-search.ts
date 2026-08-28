import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_DENY_PATTERNS,
  DEFAULT_IGNORE_RULES,
  MAX_INDEXABLE_FILE_BYTES,
  isLikelyBinaryContent,
  type IgnoreRules,
} from "./ignore-rules";
import { resolveRepositoryPath } from "./git-runner";

const execFileAsync = promisify(execFile);

export interface CodeSearchMatch {
  filePath: string;
  lineNumber: number;
  lineText: string;
}

export interface CodeSearchOptions {
  ignoreRules?: IgnoreRules;
  maxMatches?: number;
  maxMatchesPerFile?: number;
}

const DEFAULT_MAX_MATCHES = 50;
const DEFAULT_MAX_MATCHES_PER_FILE = 5;
const MAX_LINE_LENGTH = 400;
const SEARCH_TIMEOUT_MS = 10_000;

function truncateLine(line: string): string {
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line;
}

interface RipgrepMatchPayload {
  data: {
    line_number: number;
    lines: { text: string };
    path: { text: string };
  };
  type: string;
}

async function searchWithRipgrep(
  repositoryPath: string,
  query: string,
  options: CodeSearchOptions,
): Promise<CodeSearchMatch[]> {
  const maxMatchesPerFile = options.maxMatchesPerFile ?? DEFAULT_MAX_MATCHES_PER_FILE;
  const args = [
    "--json",
    "--fixed-strings",
    "--ignore-case",
    "--max-count",
    String(maxMatchesPerFile),
    "--max-filesize",
    String(MAX_INDEXABLE_FILE_BYTES),
    ...DEFAULT_DENY_PATTERNS.flatMap((pattern) => ["-g", `!${pattern}`]),
    "--",
    query,
    ".",
  ];

  let stdout: string;
  try {
    const result = await execFileAsync("rg", args, {
      cwd: repositoryPath,
      maxBuffer: 1024 * 1024 * 8,
      timeout: SEARCH_TIMEOUT_MS,
    });
    stdout = result.stdout;
  } catch (error) {
    const execError = error as { code?: number | string; stdout?: string };
    // Exit code 1 from ripgrep means "ran fine, found nothing" — not a
    // failure. Anything else (including ENOENT — rg isn't installed) is
    // handled by the caller, which falls back to the Node implementation.
    if (execError.code === 1) {
      stdout = execError.stdout ?? "";
    } else {
      throw error;
    }
  }

  const maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES;
  const matches: CodeSearchMatch[] = [];

  for (const line of stdout.split("\n")) {
    if (matches.length >= maxMatches || !line.trim()) {
      continue;
    }

    let payload: RipgrepMatchPayload;
    try {
      payload = JSON.parse(line) as RipgrepMatchPayload;
    } catch {
      continue;
    }

    if (payload.type !== "match") {
      continue;
    }

    matches.push({
      // Real ripgrep's leading "./" (from searching path ".") isn't
      // guaranteed across versions/builds — some strip it, some don't.
      // Stripped here so filePath has one consistent format regardless
      // of which rg produced it, matching searchWithNodeFallback below
      // (which never had a "./" to begin with).
      filePath: payload.data.path.text.replace(/^\.\//, ""),
      lineNumber: payload.data.line_number,
      lineText: truncateLine(payload.data.lines.text.trimEnd()),
    });
  }

  return matches.slice(0, maxMatches);
}

/** Bounds a Node-fallback walk so a pathological repository can't hang indexing. */
const MAX_FILES_SCANNED = 20_000;

/** Exported for direct testing of the fallback path without needing to hide `rg` from PATH. */
export function searchWithNodeFallback(
  repositoryPath: string,
  query: string,
  options: CodeSearchOptions,
): CodeSearchMatch[] {
  const ignoreRules = options.ignoreRules ?? DEFAULT_IGNORE_RULES;
  const maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES;
  const maxMatchesPerFile = options.maxMatchesPerFile ?? DEFAULT_MAX_MATCHES_PER_FILE;
  const needle = query.toLowerCase();

  const matches: CodeSearchMatch[] = [];
  let filesScanned = 0;

  const walk = (absoluteDir: string, relativeDir: string) => {
    if (matches.length >= maxMatches || filesScanned >= MAX_FILES_SCANNED) {
      return;
    }

    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxMatches || filesScanned >= MAX_FILES_SCANNED) {
        return;
      }

      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (ignoreRules.isIgnored(entry.isDirectory() ? `${relativePath}/` : relativePath)) {
        continue;
      }

      const absolutePath = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      filesScanned += 1;

      let fileStats;
      try {
        fileStats = statSync(absolutePath);
      } catch {
        continue;
      }
      if (fileStats.size === 0 || fileStats.size > MAX_INDEXABLE_FILE_BYTES) {
        continue;
      }

      let content: Buffer;
      try {
        content = readFileSync(absolutePath);
      } catch {
        continue;
      }
      if (isLikelyBinaryContent(content)) {
        continue;
      }

      const lines = content.toString("utf8").split("\n");
      let matchesInFile = 0;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        if (matchesInFile >= maxMatchesPerFile || matches.length >= maxMatches) {
          break;
        }
        if (lines[lineIndex].toLowerCase().includes(needle)) {
          matches.push({
            filePath: relativePath,
            lineNumber: lineIndex + 1,
            lineText: truncateLine(lines[lineIndex].trimEnd()),
          });
          matchesInFile += 1;
        }
      }
    }
  };

  walk(repositoryPath, "");
  return matches;
}

function isSpawnUnavailableError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "ENOENT";
}

/**
 * Lexical search across a repository's current files (BI-043). Prefers
 * ripgrep when it's on PATH — much faster, and respects `.gitignore` in
 * addition to the explicit deny patterns — falling back to a bounded
 * Node walk when it isn't installed. Both paths apply the same deny
 * patterns; excluded files are never read by either.
 */
export async function searchRepositoryText(
  repositoryPathInput: string,
  query: string,
  options: CodeSearchOptions = {},
): Promise<CodeSearchMatch[]> {
  const repositoryPath = resolveRepositoryPath(repositoryPathInput);

  try {
    return await searchWithRipgrep(repositoryPath, query, options);
  } catch (error) {
    if (isSpawnUnavailableError(error)) {
      return searchWithNodeFallback(repositoryPath, query, options);
    }
    throw error;
  }
}
