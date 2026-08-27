import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearStoredGitHubToken, saveStoredGitHubToken } from "../github-auth";
import { searchGitHubPullRequestsForIssueKey } from "./github-pr-evidence";

function withFileTokenStorage<T>(run: () => Promise<T>): Promise<T> {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-github-pr-evidence-"));
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  return run().finally(async () => {
    delete process.env.DEVDECK_GITHUB_STORAGE;
    delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
    await rm(tempDirectory, { force: true, recursive: true });
  });
}

test("searchGitHubPullRequestsForIssueKey returns an empty list without calling GitHub when no token is stored", async () => {
  await withFileTokenStorage(async () => {
    await clearStoredGitHubToken();
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not be called");
    }) as typeof fetch;

    try {
      const results = await searchGitHubPullRequestsForIssueKey("acme/repo", "ENG-1");
      assert.deepEqual(results, []);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("searchGitHubPullRequestsForIssueKey builds a scoped query and normalises results", async () => {
  await withFileTokenStorage(async () => {
    await saveStoredGitHubToken("test-token");
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          incomplete_results: false,
          items: [
            {
              closed_at: null,
              html_url: "https://github.com/acme/repo/pull/9",
              number: 9,
              repository_url: "https://api.github.com/repos/acme/repo",
              title: "ENG-1: fix caching",
              updated_at: "2026-08-01T00:00:00Z",
              user: { login: "dev" },
            },
          ],
          total_count: 1,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    }) as typeof fetch;

    try {
      const results = await searchGitHubPullRequestsForIssueKey("acme/repo", "ENG-1");
      assert.equal(results.length, 1);
      assert.deepEqual(results[0], {
        htmlUrl: "https://github.com/acme/repo/pull/9",
        number: 9,
        repositorySlug: "acme/repo",
        title: "ENG-1: fix caching",
        updatedAt: "2026-08-01T00:00:00Z",
      });
      assert.match(requestedUrl, /repo%3Aacme%2Frepo/);
      assert.match(requestedUrl, /is%3Apr/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("searchGitHubPullRequestsForIssueKey returns an empty list (not a throw) on a GitHub failure", async () => {
  await withFileTokenStorage(async () => {
    await saveStoredGitHubToken("test-token");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("server error", { status: 500 })) as typeof fetch;

    try {
      const results = await searchGitHubPullRequestsForIssueKey("acme/repo", "ENG-1");
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
