import test from "node:test";
import assert from "node:assert/strict";
import {
  createGitHubPullRequestComment,
  fetchGitHubPullRequests,
  GitHubApiError,
  requestGitHubPullRequestReviewers,
} from "./github-api";

test("createGitHubPullRequestComment posts the comment body to GitHub", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ id: 1 }), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    });
  }) as typeof fetch;

  try {
    await createGitHubPullRequestComment("acme/repo", 42, "Follow-up note", "test-token");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestUrl,
    "https://api.github.com/repos/acme/repo/issues/42/comments",
  );
  assert.equal(requestInit?.method, "POST");
  assert.equal(
    (requestInit?.headers as Record<string, string>).Authorization,
    "Bearer test-token",
  );
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    body: "Follow-up note",
  });
});

test("requestGitHubPullRequestReviewers posts reviewer logins to GitHub", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestInit = init;
    return new Response(JSON.stringify({ requested_reviewers: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    });
  }) as typeof fetch;

  try {
    await requestGitHubPullRequestReviewers(
      "acme/repo",
      7,
      ["manuel", "teammate"],
      "test-token",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    reviewers: ["manuel", "teammate"],
  });
});

test("requestGitHubPullRequestReviewers surfaces GitHub API errors", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("Validation failed", {
      status: 422,
    })) as typeof fetch;

  try {
    await assert.rejects(
      requestGitHubPullRequestReviewers("acme/repo", 7, ["manuel"], "test-token"),
      (error: unknown) =>
        error instanceof GitHubApiError &&
        error.status === 422 &&
        error.message === "Validation failed",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGitHubPullRequests retries without auth when a scoped token cannot read a public repo", async () => {
  const originalFetch = globalThis.fetch;
  const seenAuthorizations: Array<string | null> = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const authorization =
      ((init?.headers as Record<string, string> | undefined)?.Authorization as
        | string
        | undefined) ?? null;
    seenAuthorizations.push(authorization);

    if (authorization) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const pullRequests = await fetchGitHubPullRequests("acme/repo", "scoped-token");
    assert.deepEqual(pullRequests, []);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seenAuthorizations, ["Bearer scoped-token", null]);
});
