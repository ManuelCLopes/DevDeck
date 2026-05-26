import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  getConflictedFiles,
  resolveFileConflict,
} from "./git-conflict";

function createFixtureRepository() {
  const rootDirectory = realpathSync(mkdtempSync(path.join(tmpdir(), "devdeck-conflict-")));
  const repositoryPath = path.join(rootDirectory, "repo");

  // Initialize repo
  execFileSync("git", ["init", repositoryPath], { stdio: "ignore" });
  execFileSync("git", ["-C", repositoryPath, "checkout", "-b", "main"], { stdio: "ignore" });
  execFileSync("git", ["-C", repositoryPath, "config", "user.name", "DevDeck"], {
    stdio: "ignore",
  });
  execFileSync(
    "git",
    ["-C", repositoryPath, "config", "user.email", "devdeck@example.com"],
    { stdio: "ignore" },
  );

  // Initial commit
  const filePath = path.join(repositoryPath, "test.txt");
  writeFileSync(filePath, "Line 1\nBase Content\nLine 3\n", "utf8");
  execFileSync("git", ["-C", repositoryPath, "add", "test.txt"], { stdio: "ignore" });
  execFileSync("git", ["-C", repositoryPath, "commit", "-m", "initial"], { stdio: "ignore" });

  // Create and checkout feature branch, make a change
  execFileSync("git", ["-C", repositoryPath, "checkout", "-b", "feature-branch"], { stdio: "ignore" });
  writeFileSync(filePath, "Line 1\nTheir Content (Feature Branch)\nLine 3\n", "utf8");
  execFileSync("git", ["-C", repositoryPath, "add", "test.txt"], { stdio: "ignore" });
  execFileSync("git", ["-C", repositoryPath, "commit", "-m", "feature change"], { stdio: "ignore" });

  // Checkout main, make conflicting change
  execFileSync("git", ["-C", repositoryPath, "checkout", "main"], { stdio: "ignore" });
  writeFileSync(filePath, "Line 1\nOur Content (Main Branch)\nLine 3\n", "utf8");
  execFileSync("git", ["-C", repositoryPath, "add", "test.txt"], { stdio: "ignore" });
  execFileSync("git", ["-C", repositoryPath, "commit", "-m", "main change"], { stdio: "ignore" });

  // Merge feature-branch into main (expecting failure due to conflict)
  try {
    execFileSync("git", ["-C", repositoryPath, "merge", "feature-branch"], { stdio: "ignore" });
  } catch (e) {
    // Conflict expected
  }

  return {
    cleanup() {
      rmSync(rootDirectory, { force: true, recursive: true });
    },
    repositoryPath,
    filePath,
  };
}

test("getConflictedFiles parses merge conflict markers correctly", async () => {
  const fixture = createFixtureRepository();

  try {
    const conflicted = await getConflictedFiles(fixture.repositoryPath);
    assert.equal(conflicted.length, 1);
    assert.equal(conflicted[0]?.filePath, "test.txt");
    assert.equal(conflicted[0]?.fileName, "test.txt");
    assert.equal(conflicted[0]?.conflicts.length, 1);

    const conflict = conflicted[0]?.conflicts[0];
    assert.ok(conflict);
    assert.equal(conflict.ourContent, "Our Content (Main Branch)");
    assert.equal(conflict.theirContent, "Their Content (Feature Branch)");
    assert.ok(conflict.ourBranch.includes("main") || conflict.ourBranch.includes("HEAD"));
    assert.ok(conflict.theirBranch.includes("feature-branch"));
  } finally {
    fixture.cleanup();
  }
});

test("resolveFileConflict resolves conflict choosing 'our'", async () => {
  const fixture = createFixtureRepository();

  try {
    const conflicted = await getConflictedFiles(fixture.repositoryPath);
    const segmentId = conflicted[0]?.conflicts[0]?.id;
    assert.ok(segmentId);

    await resolveFileConflict(fixture.repositoryPath, "test.txt", {
      [segmentId]: "our",
    });

    const activeConflicts = await getConflictedFiles(fixture.repositoryPath);
    assert.equal(activeConflicts.length, 0); // staged and resolved
  } finally {
    fixture.cleanup();
  }
});

test("resolveFileConflict resolves conflict choosing 'both'", async () => {
  const fixture = createFixtureRepository();

  try {
    const conflicted = await getConflictedFiles(fixture.repositoryPath);
    const segmentId = conflicted[0]?.conflicts[0]?.id;
    assert.ok(segmentId);

    await resolveFileConflict(fixture.repositoryPath, "test.txt", {
      [segmentId]: "both",
    });

    const activeConflicts = await getConflictedFiles(fixture.repositoryPath);
    assert.equal(activeConflicts.length, 0);
  } finally {
    fixture.cleanup();
  }
});
