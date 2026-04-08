import test from "node:test";
import assert from "node:assert/strict";
import {
  createGitHubPullRequestComment,
  fetchGitHubOrganizationTeams,
  fetchGitHubPullRequestSearchResults,
  fetchGitHubPullRequests,
  fetchGitHubRepositoryCommitHistory,
  fetchGitHubTeamContributionMembers,
  fetchGitHubTeamMembers,
  fetchGitHubViewerOrganizationMemberships,
  fetchGitHubViewerCommitRepositories,
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

test("fetchGitHubViewerCommitRepositories returns contributed repositories", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.github.com/graphql");
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        data: {
          viewer: {
            contributionsCollection: {
              commitContributionsByRepository: [
                {
                  repository: {
                    nameWithOwner: "acme/repo",
                  },
                },
                {
                  repository: {
                    nameWithOwner: "acme/second-repo",
                  },
                },
              ],
            },
            id: "viewer-node-id",
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
    const response = await fetchGitHubViewerCommitRepositories(
      "test-token",
      {
        from: "2026-01-01T00:00:00.000Z",
      },
    );
    assert.deepEqual(response.repositorySlugs, ["acme/repo", "acme/second-repo"]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestBody, /ViewerCommitRepositories/);
});

test("fetchGitHubRepositoryCommitHistory returns default-branch history for the viewer", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.github.com/graphql");
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        data: {
          repository: {
            defaultBranchRef: {
              target: {
                history: {
                      nodes: [
                        {
                          additions: 12,
                          author: {
                            email: "manuel@example.com",
                            user: {
                              login: "manuel",
                            },
                          },
                          committedDate: "2026-04-03T10:00:00Z",
                          deletions: 4,
                          oid: "abc123",
                        },
                      ],
                  pageInfo: {
                    endCursor: null,
                    hasNextPage: false,
                  },
                },
              },
              },
              viewerPossibleCommitEmails: ["manuel@example.com"],
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
    const response = await fetchGitHubRepositoryCommitHistory(
      "acme/repo",
      "test-token",
      {
        since: "2026-01-01T00:00:00.000Z",
      },
    );
    assert.equal(response.items.length, 1);
    assert.equal(response.items[0]?.additions, 12);
    assert.equal(response.items[0]?.deletions, 4);
    assert.equal(response.items[0]?.oid, "abc123");
    assert.equal(response.items[0]?.author?.user?.login, "manuel");
    assert.deepEqual(response.viewerPossibleCommitEmails, ["manuel@example.com"]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestBody, /RepositoryCommitHistory/);
  assert.match(requestBody, /"owner":"acme"/);
  assert.match(requestBody, /"name":"repo"/);
});

test("fetchGitHubViewerOrganizationMemberships returns active org memberships", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          organization: { login: "acme" },
          role: "member",
          state: "active",
        },
      ]),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    )) as typeof fetch;

  try {
    const memberships = await fetchGitHubViewerOrganizationMemberships("test-token");
    assert.equal(memberships[0]?.organization.login, "acme");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGitHubOrganizationTeams returns visible org teams", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(
      JSON.stringify([
        {
          id: 1,
          members_count: 4,
          name: "Platform",
          organization: { login: "acme" },
          slug: "platform",
        },
      ]),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const teams = await fetchGitHubOrganizationTeams("acme", "test-token");
    assert.equal(teams[0]?.slug, "platform");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestUrl,
    "https://api.github.com/orgs/acme/teams?per_page=100",
  );
});

test("fetchGitHubTeamMembers returns visible team members", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          login: "manuel",
        },
      ]),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    )) as typeof fetch;

  try {
    const members = await fetchGitHubTeamMembers("acme", "platform", "test-token");
    assert.equal(members[0]?.login, "manuel");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGitHubTeamContributionMembers aggregates contribution and merge counts", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.github.com/graphql");
    requestBody = String(init?.body ?? "");

    return new Response(
      JSON.stringify({
        data: {
          member0: {
            avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
            contributionsCollection: {
              totalCommitContributions: 8,
              totalPullRequestContributions: 3,
              totalPullRequestReviewContributions: 6,
            },
            login: "manuel",
            name: "Manuel",
          },
          merged0: {
            issueCount: 2,
          },
          authoredPullRequests0: {
            nodes: [
              {
                createdAt: "2026-03-01T08:00:00Z",
                mergedAt: "2026-03-02T08:00:00Z",
                reviews: {
                  nodes: [{ submittedAt: "2026-03-01T12:00:00Z" }],
                },
              },
              {
                createdAt: "2026-03-03T08:00:00Z",
                mergedAt: "2026-03-03T20:00:00Z",
                reviews: {
                  nodes: [{ submittedAt: "2026-03-03T10:00:00Z" }],
                },
              },
            ],
          },
          member1: {
            avatarUrl: null,
            contributionsCollection: {
              totalCommitContributions: 4,
              totalPullRequestContributions: 1,
              totalPullRequestReviewContributions: 2,
            },
            login: "teammate",
            name: "Teammate",
          },
          merged1: {
            issueCount: 1,
          },
          authoredPullRequests1: {
            nodes: [
              {
                createdAt: "2026-03-02T08:00:00Z",
                mergedAt: "2026-03-04T08:00:00Z",
                reviews: {
                  nodes: [{ submittedAt: "2026-03-02T14:00:00Z" }],
                },
              },
            ],
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
    const members = await fetchGitHubTeamContributionMembers(
      ["manuel", "teammate"],
      "test-token",
      {
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-04-01T00:00:00.000Z",
      },
    );

    assert.deepEqual(members, [
      {
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        averageFirstReviewHours: 3,
        averageMergeHours: 18,
        commits: 8,
        login: "manuel",
        mergedPullRequests: 2,
        name: "Manuel",
        openedPullRequests: 3,
        reviewsSubmitted: 6,
      },
      {
        avatarUrl: null,
        averageFirstReviewHours: 6,
        averageMergeHours: 48,
        commits: 4,
        login: "teammate",
        mergedPullRequests: 1,
        name: "Teammate",
        openedPullRequests: 1,
        reviewsSubmitted: 2,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestBody, /TeamContributionMembers/);
  assert.match(requestBody, /is:pr is:merged author:manuel merged:2026-03-01\.\.2026-04-01/);
});
