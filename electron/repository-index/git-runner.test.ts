import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getRepositoryHeadInfo,
  RepositoryPathError,
  resolveRepositoryPath,
  searchCommitsByIssueKey,
} from "./git-runner";

function createFixtureRepository(): string {
  const repositoryPath = mkdtempSync(join(tmpdir(), "devdeck-git-runner-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath, stdio: "ignore" });
  const commit = (message: string, fileName: string, content: string) => {
    writeFileSync(join(repositoryPath, fileName), content);
    execFileSync("git", ["add", fileName], { cwd: repositoryPath, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=DevDeck Tests", "-c", "user.email=tests@devdeck.local", "commit", "-m", message],
      { cwd: repositoryPath, stdio: "ignore" },
    );
  };

  commit("Initial commit", "README.md", "# Fixture\n");
  commit("ENG-123: fix the caching bug", "cache.ts", "export const cache = new Map();\n");
  commit("Unrelated cleanup", "cleanup.ts", "// nothing to see here\n");

  return repositoryPath;
}

test("resolveRepositoryPath resolves an existing directory and rejects missing/non-directory paths", () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "devdeck-git-runner-"));
  try {
    assert.doesNotThrow(() => resolveRepositoryPath(repositoryPath));
    assert.throws(
      () => resolveRepositoryPath(join(repositoryPath, "does-not-exist")),
      RepositoryPathError,
    );

    const filePath = join(repositoryPath, "a-file.txt");
    writeFileSync(filePath, "hello");
    assert.throws(() => resolveRepositoryPath(filePath), RepositoryPathError);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
  }
});

test("getRepositoryHeadInfo returns the real HEAD SHA and null default branch without a remote", async () => {
  const repositoryPath = createFixtureRepository();
  try {
    const expectedSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryPath,
    })
      .toString()
      .trim();

    const info = await getRepositoryHeadInfo(repositoryPath);
    assert.equal(info.headSha, expectedSha);
    assert.equal(info.defaultBranch, null);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
  }
});

test("searchCommitsByIssueKey finds only commits whose message references the key, case-insensitively", async () => {
  const repositoryPath = createFixtureRepository();
  try {
    const matches = await searchCommitsByIssueKey(repositoryPath, "eng-123");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].subject, "ENG-123: fix the caching bug");
    assert.equal(matches[0].authorName, "DevDeck Tests");
    assert.ok(matches[0].sha.length >= 7);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
  }
});

test("searchCommitsByIssueKey returns no matches for an issue key that never appears", async () => {
  const repositoryPath = createFixtureRepository();
  try {
    const matches = await searchCommitsByIssueKey(repositoryPath, "ENG-999");
    assert.deepEqual(matches, []);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
  }
});

test("searchCommitsByIssueKey treats the issue key as a fixed string, not a regex", async () => {
  const repositoryPath = createFixtureRepository();
  try {
    // A regex metacharacter in the query must not be interpreted as one.
    const matches = await searchCommitsByIssueKey(repositoryPath, "ENG-123.*");
    assert.deepEqual(matches, []);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
  }
});
