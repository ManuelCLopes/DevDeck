import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverWorkspace, loadWorkspaceSnapshot } from "./workspace";

function createCommittedRepository(repositoryPath: string) {
  mkdirSync(repositoryPath, { recursive: true });
  execFileSync("git", ["init"], { cwd: repositoryPath, stdio: "ignore" });
  writeFileSync(join(repositoryPath, "README.md"), "# Repo\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=DevDeck Tests",
      "-c",
      "user.email=tests@devdeck.local",
      "commit",
      "-m",
      "initial commit",
    ],
    {
      cwd: repositoryPath,
      stdio: "ignore",
    },
  );
}

test("discoverWorkspace finds repositories and loadWorkspaceSnapshot scans them", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-workspace-"));
  const workspaceRoot = join(tempDirectory, "workspace");
  const repositoryPath = join(workspaceRoot, "alpha");
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  createCommittedRepository(repositoryPath);
  mkdirSync(join(workspaceRoot, "node_modules", "ignored"), { recursive: true });
  createCommittedRepository(join(workspaceRoot, "node_modules", "ignored"));

  const discovery = await discoverWorkspace(workspaceRoot);
  assert.equal(discovery.rootPath, workspaceRoot);
  assert.equal(discovery.discoveredRepositoryCount, 1);
  assert.equal(discovery.candidates[0]?.name, "alpha");

  const snapshot = await loadWorkspaceSnapshot({
    projects: discovery.candidates,
    rootName: discovery.rootName,
    rootPath: discovery.rootPath,
  });

  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.projects[0]?.name, "alpha");
  assert.equal(snapshot.githubStatus.state, "unauthenticated");
  assert.equal(snapshot.summary.repositories, 1);
  assert.ok(snapshot.projects[0]?.branchCount >= 1);

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
  rmSync(tempDirectory, { force: true, recursive: true });
});
