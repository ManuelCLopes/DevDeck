import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  createGitWorktreeSession,
  inspectDevSession,
  removeGitWorktreeSession,
  sanitizeWorktreeSegment,
} from "./git-worktree";

function createFixtureRepository() {
  const rootDirectory = mkdtempSync(path.join(tmpdir(), "devdeck-worktree-"));
  const repositoryPath = path.join(rootDirectory, "repo");

  execFileSync("git", ["init", repositoryPath], { stdio: "ignore" });
  execFileSync("git", ["-C", repositoryPath, "config", "user.name", "DevDeck"], {
    stdio: "ignore",
  });
  execFileSync(
    "git",
    ["-C", repositoryPath, "config", "user.email", "devdeck@example.com"],
    { stdio: "ignore" },
  );
  writeFileSync(path.join(repositoryPath, "README.md"), "hello\n", "utf8");
  execFileSync("git", ["-C", repositoryPath, "add", "README.md"], {
    stdio: "ignore",
  });
  execFileSync("git", ["-C", repositoryPath, "commit", "-m", "initial"], {
    stdio: "ignore",
  });

  return {
    cleanup() {
      rmSync(rootDirectory, { force: true, recursive: true });
    },
    repositoryPath,
  };
}

test("sanitizeWorktreeSegment normalizes branch-like input", () => {
  assert.equal(
    sanitizeWorktreeSegment("Review / PR-42!"),
    "review-pr-42",
  );
});

test("createGitWorktreeSession creates a sibling worktree and branch", async () => {
  const fixture = createFixtureRepository();

  try {
    const session = await createGitWorktreeSession({
      baseRef: "HEAD",
      branchName: "feature/review-pr-42",
      repositoryPath: fixture.repositoryPath,
    });

    assert.match(session.branchName, /^feature-review-pr-42$/);
    assert.ok(session.localPath.startsWith(path.dirname(fixture.repositoryPath)));

    const worktreeBranch = execFileSync(
      "git",
      ["-C", session.localPath, "branch", "--show-current"],
      { encoding: "utf8" },
    ).trim();
    assert.equal(worktreeBranch, session.branchName);
  } finally {
    fixture.cleanup();
  }
});

test("createGitWorktreeSession de-conflicts existing local branches", async () => {
  const fixture = createFixtureRepository();

  try {
    execFileSync("git", ["-C", fixture.repositoryPath, "branch", "session"], {
      stdio: "ignore",
    });

    const session = await createGitWorktreeSession({
      baseRef: "HEAD",
      branchName: "session",
      repositoryPath: fixture.repositoryPath,
    });

    assert.equal(session.branchName, "session-2");
  } finally {
    fixture.cleanup();
  }
});

test("removeGitWorktreeSession removes the created worktree path", async () => {
  const fixture = createFixtureRepository();

  try {
    const session = await createGitWorktreeSession({
      baseRef: "HEAD",
      branchName: "cleanup-check",
      repositoryPath: fixture.repositoryPath,
    });

    await removeGitWorktreeSession({
      repositoryPath: fixture.repositoryPath,
      worktreePath: session.localPath,
    });

    assert.equal(
      execFileSync(
        "git",
        ["-C", fixture.repositoryPath, "worktree", "list", "--porcelain"],
        { encoding: "utf8" },
      ).includes(session.localPath),
      false,
    );
  } finally {
    fixture.cleanup();
  }
});

test("inspectDevSession reports clean branch state and last commit", async () => {
  const fixture = createFixtureRepository();

  try {
    const snapshot = await inspectDevSession({
      localPath: fixture.repositoryPath,
      repositoryPath: fixture.repositoryPath,
      sessionId: "session-1",
    });

    assert.equal(snapshot.exists, true);
    assert.equal(snapshot.isRepository, true);
    assert.equal(snapshot.hasUncommittedChanges, false);
    assert.equal(snapshot.lastCommitSubject, "initial");
    assert.ok(snapshot.currentBranch);
  } finally {
    fixture.cleanup();
  }
});

test("inspectDevSession reports uncommitted changes", async () => {
  const fixture = createFixtureRepository();

  try {
    writeFileSync(path.join(fixture.repositoryPath, "README.md"), "hello\nchange\n", "utf8");

    const snapshot = await inspectDevSession({
      localPath: fixture.repositoryPath,
      repositoryPath: fixture.repositoryPath,
      sessionId: "session-2",
    });

    assert.equal(snapshot.hasUncommittedChanges, true);
  } finally {
    fixture.cleanup();
  }
});
