import test from "node:test";
import assert from "node:assert/strict";
import {
  createGitHubPullRequestComment,
  fetchGitHubCommitSearchResults,
  fetchGitHubPullRequestSearchResults,
  fetchGitHubPullRequests,
  GitHubApiError,
  GitHubConnectivityError,
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

test("fetchGitHubPullRequests surfaces connectivity failures as GitHubConnectivityError", async () => {
  const originalFetch = globalThis.fetch;
  const fetchError = new TypeError("fetch failed");
  (fetchError as TypeError & { cause?: { code: string } }).cause = {
    code: "ENOTFOUND",
  };

  globalThis.fetch = (async () => {
    throw fetchError;
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchGitHubPullRequests("acme/repo", "test-token"),
      (error: unknown) =>
        error instanceof GitHubConnectivityError &&
        error.message === "GitHub could not be reached. Check your connection and retry.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGitHubPullRequestSearchResults encodes the search query and returns items", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(
      JSON.stringify({
        incomplete_results: false,
        items: [
          {
            closed_at: "2026-04-01T10:00:00Z",
            html_url: "https://github.com/acme/repo/pull/42",
            number: 42,
            repository_url: "https://api.github.com/repos/acme/repo",
            title: "Improve queue",
            updated_at: "2026-04-01T10:00:00Z",
            user: { login: "manuel" },
          },
        ],
        total_count: 1,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const response = await fetchGitHubPullRequestSearchResults(
      "is:pr author:manuel merged:>=2026-01-01",
      "test-token",
    );
    assert.equal(response.items.length, 1);
    assert.equal(response.items[0]?.number, 42);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(
    requestUrl,
    /https:\/\/api\.github\.com\/search\/issues\?q=is%3Apr%20author%3Amanuel%20merged%3A%3E%3D2026-01-01&per_page=100&page=1$/,
  );
});

test("fetchGitHubCommitSearchResults returns commit nodes from GraphQL search", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({
        data: {
          search: {
            nodes: [
              {
                additions: 12,
                committedDate: "2026-04-03T10:00:00Z",
                deletions: 4,
                oid: "abc123",
                repository: {
                  nameWithOwner: "acme/repo",
                },
              },
            ],
            pageInfo: {
              endCursor: null,
              hasNextPage: false,
            },
          },
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const response = await fetchGitHubCommitSearchResults(
      "author:manuel author-date:>=2026-01-01 sort:author-date-desc",
      "test-token",
    );
    assert.equal(response.items.length, 1);
    assert.equal(response.items[0]?.additions, 12);
    assert.equal(response.items[0]?.deletions, 4);
    assert.equal(response.items[0]?.oid, "abc123");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestUrl, "https://api.github.com/graphql");
  assert.equal(requestInit?.method, "POST");
  assert.equal(
    (requestInit?.headers as Record<string, string>).Authorization,
    "Bearer test-token",
  );
});
