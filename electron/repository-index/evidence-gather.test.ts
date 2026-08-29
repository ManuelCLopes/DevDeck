import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openSqliteConnection } from "../persistence/sqlite-driver";
import { runMigrations } from "../persistence/migration-runner";
import { backlogMigrations } from "../persistence/migrations";
import {
  upsertJiraConnection,
  upsertJiraIssues,
  upsertJiraProjectConfig,
} from "../persistence/jira-repository";
import { getEvidenceForIssue } from "../persistence/evidence-repository";
import { gatherEvidence } from "./evidence-gather";

function createFixtureRepository(): string {
  const repositoryPath = mkdtempSync(join(tmpdir(), "devdeck-evidence-gather-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath, stdio: "ignore" });
  writeFileSync(join(repositoryPath, "cache.ts"), "export function loadCache() {\n  // ENG-1 caching fix\n}\n");
  execFileSync("git", ["add", "cache.ts"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=DevDeck Tests",
      "-c",
      "user.email=tests@devdeck.local",
      "commit",
      "-m",
      "ENG-1: add caching",
    ],
    { cwd: repositoryPath, stdio: "ignore" },
  );
  return repositoryPath;
}

function setUp() {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });
  const projectConfig = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "project = ENG",
    name: "Engineering",
    projectKey: "ENG",
  });
  // scan_items.issue_key has a NOT NULL FK to jira_issues — evidence
  // gathering only makes sense for an already-synced issue in the real
  // app flow (the UI only offers "gather evidence" from a synced issue's
  // detail page).
  upsertJiraIssues(db, [
    {
      comments: [],
      links: [],
      record: {
        components: [],
        description: null,
        issueKey: "ENG-1",
        issueType: "Task",
        jiraUpdatedAt: "2026-08-01T00:00:00.000Z",
        labels: [],
        outOfScope: false,
        parentIssueKey: null,
        projectId: projectConfig.id,
        status: "Open",
        summary: "Add caching",
        syncedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  ]);
  return { db, projectConfig };
}

test("gatherEvidence collects commit and lexical evidence, and persists it", async () => {
  const { db, projectConfig } = setUp();
  const repositoryPath = createFixtureRepository();

  try {
    const result = await gatherEvidence({
      db,
      jiraProjectId: projectConfig.id,
      request: {
        issueKey: "ENG-1",
        repositories: [
          { githubRepositorySlug: null, localProjectId: "local-1", repositoryPath },
        ],
      },
    });

    assert.deepEqual(result.unavailableRepositories, []);
    assert.equal(result.repositorySnapshots.length, 1);
    assert.equal(result.repositorySnapshots[0].localProjectId, "local-1");

    const kinds = result.evidence.map((item) => item.kind).sort();
    assert.deepEqual(kinds, ["code_file", "git_commit"]);

    const commitEvidence = result.evidence.find((item) => item.kind === "git_commit");
    assert.equal(commitEvidence?.strength, "high");
    assert.equal(commitEvidence?.title, "ENG-1: add caching");

    const codeEvidence = result.evidence.find((item) => item.kind === "code_file");
    assert.equal(codeEvidence?.strength, "low");
    // No leading "./" — code-search.ts normalises real ripgrep's path
    // format (not guaranteed across versions) to match the Node
    // fallback's, so filePath is consistent either way.
    assert.equal(codeEvidence?.filePath, "cache.ts");

    // Persisted, not just returned.
    const stored = getEvidenceForIssue(db, projectConfig.id, "ENG-1");
    assert.equal(stored.length, result.evidence.length);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
    db.close();
  }
});

test("gatherEvidence records an unavailable repository without failing the whole gather", async () => {
  const { db, projectConfig } = setUp();
  const goodRepositoryPath = createFixtureRepository();

  try {
    const result = await gatherEvidence({
      db,
      jiraProjectId: projectConfig.id,
      request: {
        issueKey: "ENG-1",
        repositories: [
          { githubRepositorySlug: null, localProjectId: "missing", repositoryPath: "/does/not/exist" },
          { githubRepositorySlug: null, localProjectId: "local-1", repositoryPath: goodRepositoryPath },
        ],
      },
    });

    assert.equal(result.unavailableRepositories.length, 1);
    assert.equal(result.unavailableRepositories[0].repositoryPath, "/does/not/exist");
    // The second, valid repository still produced evidence.
    assert.ok(result.evidence.length > 0);
    assert.equal(result.repositorySnapshots.length, 1);
  } finally {
    rmSync(goodRepositoryPath, { force: true, recursive: true });
    db.close();
  }
});

test("gatherEvidence stops early when the signal is already aborted", async () => {
  const { db, projectConfig } = setUp();
  const repositoryPath = createFixtureRepository();
  const controller = new AbortController();
  controller.abort();

  try {
    await assert.rejects(
      () =>
        gatherEvidence({
          db,
          jiraProjectId: projectConfig.id,
          request: {
            issueKey: "ENG-1",
            repositories: [
              { githubRepositorySlug: null, localProjectId: "local-1", repositoryPath },
            ],
          },
          signal: controller.signal,
        }),
      /cancelled/i,
    );
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
    db.close();
  }
});

test("gatherEvidence reports progress per repository processed", async () => {
  const { db, projectConfig } = setUp();
  const repositoryPath = createFixtureRepository();
  const progressUpdates: number[] = [];

  try {
    await gatherEvidence({
      db,
      jiraProjectId: projectConfig.id,
      onProgress: (progress) => progressUpdates.push(progress),
      request: {
        issueKey: "ENG-1",
        repositories: [
          { githubRepositorySlug: null, localProjectId: "local-1", repositoryPath },
        ],
      },
    });

    assert.deepEqual(progressUpdates, [1]);
  } finally {
    rmSync(repositoryPath, { force: true, recursive: true });
    db.close();
  }
});
