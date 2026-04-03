import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearWorkspaceSnapshotCaches,
  discoverWorkspace,
  loadWorkspaceSnapshot,
} from "./workspace";

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

function createRepositoryWithFeatureCommit(repositoryPath: string) {
  mkdirSync(repositoryPath, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
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

  execFileSync("git", ["checkout", "-b", "feature/review"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  writeFileSync(join(repositoryPath, "feature.txt"), "feature branch\n", "utf8");
  execFileSync("git", ["add", "feature.txt"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=DevDeck Tests",
      "-c",
      "user.email=tests@devdeck.local",
      "commit",
      "-m",
      "feature commit",
    ],
    {
      cwd: repositoryPath,
      stdio: "ignore",
    },
  );

  execFileSync("git", ["checkout", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
}

function createRepositoryAheadOfOriginMain(repositoryPath: string, remotePath: string) {
  mkdirSync(repositoryPath, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  execFileSync("git", ["init", "--bare", remotePath], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  execFileSync("git", ["remote", "add", "origin", remotePath], {
    cwd: repositoryPath,
    stdio: "ignore",
  });

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
  execFileSync("git", ["push", "-u", "origin", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });

  writeFileSync(join(repositoryPath, "feature.txt"), "local only\n", "utf8");
  execFileSync("git", ["add", "feature.txt"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=DevDeck Tests",
      "-c",
      "user.email=tests@devdeck.local",
      "commit",
      "-m",
      "local main commit",
    ],
    {
      cwd: repositoryPath,
      stdio: "ignore",
    },
  );
}

function createRepositoryWithContributionStats(repositoryPath: string) {
  mkdirSync(repositoryPath, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "DevDeck Tests"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "tests@devdeck.local"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });

  writeFileSync(join(repositoryPath, "README.md"), "alpha\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    ["commit", "-m", "initial commit"],
    {
      cwd: repositoryPath,
      stdio: "ignore",
    },
  );

  writeFileSync(join(repositoryPath, "README.md"), "alpha updated\nbeta\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    ["commit", "-m", "expand readme"],
    {
      cwd: repositoryPath,
      stdio: "ignore",
    },
  );
}

function createRepositoryWithMixedContributionStats(repositoryPath: string) {
  mkdirSync(repositoryPath, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "DevDeck Tests"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "tests@devdeck.local"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });

  writeFileSync(join(repositoryPath, "README.md"), "viewer\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "viewer commit"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });

  writeFileSync(join(repositoryPath, "README.md"), "viewer\nteammate\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "commit",
      "--author",
      "Teammate <teammate@example.com>",
      "-m",
      "teammate commit",
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

test("loadWorkspaceSnapshot marks commit activity as merged or not merged into default branch", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-activity-status-"));
  const workspaceRoot = join(tempDirectory, "workspace");
  const repositoryPath = join(workspaceRoot, "alpha");
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  createRepositoryWithFeatureCommit(repositoryPath);

  const discovery = await discoverWorkspace(workspaceRoot);
  const snapshot = await loadWorkspaceSnapshot({
    projects: discovery.candidates,
    rootName: discovery.rootName,
    rootPath: discovery.rootPath,
  });

  const commitActivities = snapshot.activities.filter(
    (activity) => activity.type === "commit",
  );

  assert.ok(
    commitActivities.some(
      (activity) => activity.commitIntegrationStatus === "in_default_branch",
    ),
  );
  assert.ok(
    commitActivities.some(
      (activity) => activity.commitIntegrationStatus === "not_in_default_branch",
    ),
  );

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
  rmSync(tempDirectory, { force: true, recursive: true });
});

test("loadWorkspaceSnapshot compares commit activity against origin default branch when available", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-origin-status-"));
  const workspaceRoot = join(tempDirectory, "workspace");
  const repositoryPath = join(workspaceRoot, "alpha");
  const remotePath = join(tempDirectory, "alpha-remote.git");
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  createRepositoryAheadOfOriginMain(repositoryPath, remotePath);

  const discovery = await discoverWorkspace(workspaceRoot);
  const snapshot = await loadWorkspaceSnapshot({
    projects: discovery.candidates,
    rootName: discovery.rootName,
    rootPath: discovery.rootPath,
  });

  const localOnlyCommit = snapshot.activities.find((activity) =>
    activity.description.includes("local main commit"),
  );
  const pushedCommit = snapshot.activities.find((activity) =>
    activity.description.includes("initial commit"),
  );

  assert.equal(localOnlyCommit?.commitIntegrationStatus, "not_in_default_branch");
  assert.equal(pushedCommit?.commitIntegrationStatus, "in_default_branch");

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
  rmSync(tempDirectory, { force: true, recursive: true });
});

test("loadWorkspaceSnapshot aggregates user activity insights from local git history", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-user-activity-"));
  const workspaceRoot = join(tempDirectory, "workspace");
  const repositoryPath = join(workspaceRoot, "alpha");
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  createRepositoryWithContributionStats(repositoryPath);

  const discovery = await discoverWorkspace(workspaceRoot);
  const snapshot = await loadWorkspaceSnapshot({
    projects: discovery.candidates,
    rootName: discovery.rootName,
    rootPath: discovery.rootPath,
  });

  assert.equal(snapshot.userActivity.last7Days.commits, 2);
  assert.equal(snapshot.userActivity.last7Days.linesAdded, 3);
  assert.equal(snapshot.userActivity.last7Days.linesDeleted, 1);
  assert.equal(snapshot.userActivity.last7Days.pullRequestsMerged, 0);
  assert.equal(snapshot.userActivity.last7Days.pullRequestsReviewed, 0);
  assert.equal(snapshot.userActivity.last7Days.points.length, 7);
  assert.equal(snapshot.userActivity.last30Days.points.length, 30);
  assert.equal(snapshot.userActivity.last90Days.points.length, 90);
  assert.equal(
    snapshot.userActivity.last7Days.points.reduce(
      (total, point) => total + point.commits,
      0,
    ),
    snapshot.userActivity.last7Days.commits,
  );
  assert.equal(
    snapshot.userActivity.last7Days.points.reduce(
      (total, point) => total + point.linesAdded,
      0,
    ),
    snapshot.userActivity.last7Days.linesAdded,
  );
  assert.equal(
    snapshot.userActivity.last7Days.points.reduce(
      (total, point) => total + point.linesDeleted,
      0,
    ),
    snapshot.userActivity.last7Days.linesDeleted,
  );

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
  rmSync(tempDirectory, { force: true, recursive: true });
});

test("loadWorkspaceSnapshot counts only the configured contributor's local commits", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-user-activity-mixed-"));
  const workspaceRoot = join(tempDirectory, "workspace");
  const repositoryPath = join(workspaceRoot, "alpha");
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  createRepositoryWithMixedContributionStats(repositoryPath);

  const discovery = await discoverWorkspace(workspaceRoot);
  const snapshot = await loadWorkspaceSnapshot({
    projects: discovery.candidates,
    rootName: discovery.rootName,
    rootPath: discovery.rootPath,
  });

  assert.equal(snapshot.userActivity.last7Days.commits, 1);
  assert.equal(snapshot.userActivity.last7Days.linesAdded, 1);
  assert.equal(snapshot.userActivity.last7Days.linesDeleted, 0);

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
  rmSync(tempDirectory, { force: true, recursive: true });
});

test("loadWorkspaceSnapshot aggregates merged and reviewed PRs from GitHub across monitored repos", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-user-activity-github-"));
  const workspaceRoot = join(tempDirectory, "workspace");
  const repositoryPath = join(workspaceRoot, "alpha");
  const tokenPath = join(tempDirectory, "github-token.json");
  const originalFetch = globalThis.fetch;
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = tokenPath;

  createCommittedRepository(repositoryPath);
  execFileSync(
    "git",
    ["remote", "add", "origin", "https://github.com/acme/alpha.git"],
    { cwd: repositoryPath, stdio: "ignore" },
  );
  writeFileSync(tokenPath, JSON.stringify({ token: "test-token" }), "utf8");
  clearWorkspaceSnapshotCaches();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const requestUrl = new URL(String(input));
    const pathname = requestUrl.pathname;
    const query = requestUrl.searchParams.get("q") ?? "";

    if (pathname === "/user") {
      return new Response(JSON.stringify({ login: "manuel" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (pathname === "/repos/acme/alpha/pulls") {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (pathname === "/repos/acme/alpha/commits/main/status") {
      return new Response(JSON.stringify({ state: null }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (pathname === "/search/issues" && query.includes("author:manuel")) {
      return new Response(
        JSON.stringify({
          incomplete_results: false,
          items: [
            {
              closed_at: new Date().toISOString(),
              html_url: "https://github.com/acme/alpha/pull/12",
              number: 12,
              repository_url: "https://api.github.com/repos/acme/alpha",
              title: "Ship feature",
              updated_at: new Date().toISOString(),
              user: { login: "manuel" },
            },
            {
              closed_at: new Date().toISOString(),
              html_url: "https://github.com/acme/other/pull/13",
              number: 13,
              repository_url: "https://api.github.com/repos/acme/other",
              title: "Ignore me",
              updated_at: new Date().toISOString(),
              user: { login: "manuel" },
            },
          ],
          total_count: 2,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (pathname === "/search/issues" && query.includes("reviewed-by:manuel")) {
      return new Response(
        JSON.stringify({
          incomplete_results: false,
          items: [
            {
              closed_at: null,
              html_url: "https://github.com/acme/alpha/pull/99",
              number: 99,
              repository_url: "https://api.github.com/repos/acme/alpha",
              title: "Review me",
              updated_at: new Date().toISOString(),
              user: { login: "teammate" },
            },
          ],
          total_count: 1,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (pathname === "/repos/acme/alpha/pulls/99/reviews") {
      return new Response(
        JSON.stringify([
          {
            id: 1,
            state: "APPROVED",
            submitted_at: new Date().toISOString(),
            user: { login: "manuel" },
          },
        ]),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    throw new Error(`Unexpected fetch: ${requestUrl.toString()}`);
  }) as typeof fetch;

  try {
    const discovery = await discoverWorkspace(workspaceRoot);
    const snapshot = await loadWorkspaceSnapshot({
      projects: discovery.candidates,
      rootName: discovery.rootName,
      rootPath: discovery.rootPath,
    });

    assert.equal(snapshot.githubStatus.state, "connected");
    assert.equal(snapshot.userActivity.last7Days.pullRequestsMerged, 1);
    assert.equal(snapshot.userActivity.last7Days.pullRequestsReviewed, 1);
  } finally {
    clearWorkspaceSnapshotCaches();
    globalThis.fetch = originalFetch;
    delete process.env.DEVDECK_GITHUB_STORAGE;
    delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
    rmSync(tempDirectory, { force: true, recursive: true });
  }
});
