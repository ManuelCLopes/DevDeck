import test from "node:test";
import assert from "node:assert/strict";
import {
  computeJiraRetryDelayMs,
  getIssue,
  listProjects,
  searchIssues,
  testConnection,
} from "./jira-client";
import { JiraApiError } from "./jira-errors";

const CREDENTIALS = {
  accountEmail: "dev@example.com",
  apiToken: "token-123",
  baseUrl: "https://example.atlassian.net",
};

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...headers },
    status,
  });
}

const noWait = async () => {};

test("testConnection sends Basic auth built from email:token and reports success", async () => {
  let capturedAuthHeader: string | null = null;
  const restore = stubFetch(async (_input, init) => {
    capturedAuthHeader = (init?.headers as Record<string, string>).Authorization;
    return jsonResponse({ displayName: "Dev Example" });
  });

  try {
    const health = await testConnection(CREDENTIALS, { wait: noWait });
    assert.deepEqual(health, { displayName: "Dev Example", ok: true, reason: null });
    assert.equal(
      capturedAuthHeader,
      `Basic ${Buffer.from("dev@example.com:token-123").toString("base64")}`,
    );
  } finally {
    restore();
  }
});

test("testConnection reports failure with Jira's message on 401 without retrying", async () => {
  let callCount = 0;
  const restore = stubFetch(async () => {
    callCount += 1;
    return jsonResponse({ errorMessages: ["Invalid credentials."] }, 401);
  });

  try {
    const health = await testConnection(CREDENTIALS, { wait: noWait });
    assert.equal(health.ok, false);
    assert.match(health.reason ?? "", /Invalid credentials\./);
    assert.equal(callCount, 1);
  } finally {
    restore();
  }
});

test("jiraApiRequest retries a plain 500 (not just 502/503/504), then succeeds", async () => {
  let callCount = 0;
  const restore = stubFetch(async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({ errorMessages: ["Internal server error."] }, 500);
    }
    return jsonResponse({ displayName: "Dev Example" });
  });

  try {
    const health = await testConnection(CREDENTIALS, { wait: noWait });
    assert.equal(health.ok, true);
    assert.equal(callCount, 2);
  } finally {
    restore();
  }
});

test("jiraApiRequest retries a 429 honouring Retry-After, then succeeds", async () => {
  let callCount = 0;
  const waitedMs: number[] = [];
  const restore = stubFetch(async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({}, 429, { "Retry-After": "2" });
    }
    return jsonResponse({ displayName: "Dev Example" });
  });

  try {
    const health = await testConnection(CREDENTIALS, {
      wait: async (ms) => {
        waitedMs.push(ms);
      },
    });
    assert.equal(health.ok, true);
    assert.equal(callCount, 2);
    assert.deepEqual(waitedMs, [2000]);
  } finally {
    restore();
  }
});

test("jiraApiRequest retries transient 5xx failures up to maxAttempts, then throws", async () => {
  let callCount = 0;
  const restore = stubFetch(async () => {
    callCount += 1;
    return jsonResponse({ errorMessages: ["Service unavailable."] }, 503);
  });

  try {
    await assert.rejects(
      () =>
        searchIssues(
          CREDENTIALS,
          { jql: "project = ENG", maxResults: 10, startAt: 0 },
          "project-config-1",
          { maxAttempts: 3, wait: noWait },
        ),
      (error: unknown) => {
        assert.ok(error instanceof JiraApiError);
        assert.equal(error.code, "JIRA_UNAVAILABLE");
        return true;
      },
    );
    assert.equal(callCount, 3);
  } finally {
    restore();
  }
});

test("jiraApiRequest does not retry a non-retryable 400 (invalid JQL)", async () => {
  let callCount = 0;
  const restore = stubFetch(async () => {
    callCount += 1;
    return jsonResponse({ errorMessages: ["Error in the JQL Query"] }, 400);
  });

  try {
    await assert.rejects(
      () =>
        searchIssues(
          CREDENTIALS,
          { jql: "not valid jql", maxResults: 10, startAt: 0 },
          "project-config-1",
          { wait: noWait },
        ),
      (error: unknown) => {
        assert.ok(error instanceof JiraApiError);
        assert.equal(error.code, "JQL_INVALID");
        return true;
      },
    );
    assert.equal(callCount, 1);
  } finally {
    restore();
  }
});

test("listProjects paginates until isLast is true", async () => {
  let callCount = 0;
  const restore = stubFetch(async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({
        isLast: false,
        values: [{ id: "1", key: "ENG", name: "Engineering" }],
      });
    }
    return jsonResponse({
      isLast: true,
      values: [{ id: "2", key: "OPS", name: "Operations" }],
    });
  });

  try {
    const projects = await listProjects(CREDENTIALS, { wait: noWait });
    assert.deepEqual(projects, [
      { id: "1", key: "ENG", name: "Engineering" },
      { id: "2", key: "OPS", name: "Operations" },
    ]);
    assert.equal(callCount, 2);
  } finally {
    restore();
  }
});

test("searchIssues normalises issues with the given local project id and computes isLast", async () => {
  const restore = stubFetch(async () =>
    jsonResponse({
      issues: [
        {
          fields: {
            issuetype: { name: "Task" },
            status: { name: "Open" },
            summary: "Do the thing",
            updated: "2026-08-01T00:00:00.000Z",
          },
          id: "1",
          key: "ENG-1",
        },
      ],
      maxResults: 50,
      startAt: 0,
      total: 1,
    }),
  );

  try {
    const page = await searchIssues(
      CREDENTIALS,
      { jql: "project = ENG", maxResults: 50, startAt: 0 },
      "project-config-1",
      { wait: noWait },
    );
    assert.equal(page.isLast, true);
    assert.equal(page.issues.length, 1);
    assert.equal(page.issues[0].record.projectId, "project-config-1");
    assert.equal(page.issues[0].record.issueKey, "ENG-1");
  } finally {
    restore();
  }
});

test("getIssue requests the fixed field set and normalises a single issue", async () => {
  let requestedUrl = "";
  const restore = stubFetch(async (input) => {
    requestedUrl = String(input);
    return jsonResponse({
      fields: {
        issuetype: { name: "Bug" },
        status: { name: "Open" },
        summary: "Fix it",
        updated: "2026-08-01T00:00:00.000Z",
      },
      id: "1",
      key: "ENG-1",
    });
  });

  try {
    const issue = await getIssue(CREDENTIALS, "ENG-1", "project-config-1", { wait: noWait });
    assert.equal(issue.record.issueKey, "ENG-1");
    assert.match(requestedUrl, /\/rest\/api\/3\/issue\/ENG-1\?fields=/);
  } finally {
    restore();
  }
});

test("computeJiraRetryDelayMs prefers Retry-After over the exponential curve", () => {
  assert.equal(computeJiraRetryDelayMs(1, 3), 3000);
  assert.equal(computeJiraRetryDelayMs(5, 0), 0);
});

test("computeJiraRetryDelayMs grows exponentially with jitter bounded to +25%", () => {
  const baseDelayMs = 100;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const delay = computeJiraRetryDelayMs(attempt, null, baseDelayMs);
    const expected = baseDelayMs * 2 ** (attempt - 1);
    assert.ok(delay >= expected, `attempt ${attempt}: ${delay} >= ${expected}`);
    assert.ok(delay <= expected * 1.25, `attempt ${attempt}: ${delay} <= ${expected * 1.25}`);
  }
});
