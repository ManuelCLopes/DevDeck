import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "../persistence/sqlite-driver";
import { runMigrations } from "../persistence/migration-runner";
import { backlogMigrations } from "../persistence/migrations";
import {
  getJiraConnection,
  getJiraIssueDetail,
  getJiraProjectConfig,
  upsertJiraConnection,
  upsertJiraIssues,
  upsertJiraProjectConfig,
} from "../persistence/jira-repository";
import { runFullJiraSync, runIncrementalJiraSync } from "./jira-sync";

const CREDENTIALS = {
  accountEmail: "dev@example.com",
  apiToken: "token-123",
  baseUrl: "https://example.atlassian.net",
};

function stubFetch(handler: (init: RequestInit | undefined) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) =>
    handler(init)) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function rawIssue(key: string, updated = "2026-08-01T00:00:00.000Z") {
  return {
    fields: {
      issuetype: { name: "Task" },
      status: { name: "Open" },
      summary: `Summary for ${key}`,
      updated,
    },
    id: key,
    key,
  };
}

function setUp() {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);
  upsertJiraConnection(db, {
    accountEmail: CREDENTIALS.accountEmail,
    baseUrl: CREDENTIALS.baseUrl,
    id: "conn-1",
  });
  const projectConfig = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "statusCategory != Done",
    name: "Engineering",
    projectKey: "ENG",
  });
  return { db, projectConfig };
}

test("runFullJiraSync upserts every page and marks issues no longer returned as out of scope", async () => {
  const { db, projectConfig } = setUp();

  // Pre-existing issue from a previous sync that will not appear this time.
  upsertJiraIssues(db, [
    {
      comments: [],
      links: [],
      record: {
        components: [],
        description: null,
        issueKey: "ENG-OLD",
        issueType: "Task",
        jiraUpdatedAt: "2026-07-01T00:00:00.000Z",
        labels: [],
        outOfScope: false,
        parentIssueKey: null,
        projectId: projectConfig.id,
        status: "Open",
        summary: "Stale issue",
        syncedAt: "2026-07-01T00:00:00.000Z",
      },
    },
  ]);

  let callCount = 0;
  const restore = stubFetch(async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({
        issues: [rawIssue("ENG-1"), rawIssue("ENG-2")],
        maxResults: 2,
        startAt: 0,
        total: 3,
      });
    }
    return jsonResponse({ issues: [rawIssue("ENG-3")], maxResults: 2, startAt: 2, total: 3 });
  });

  try {
    const result = await runFullJiraSync({
      clientOptions: { wait: async () => {} },
      connectionId: "conn-1",
      credentials: CREDENTIALS,
      db,
      pageSize: 2,
      projectConfig,
    });

    assert.equal(callCount, 2);
    assert.equal(result.mode, "full");
    assert.equal(result.fetchedIssueCount, 3);
    assert.equal(result.markedOutOfScopeCount, 1);

    assert.ok(getJiraIssueDetail(db, "ENG-1"));
    assert.ok(getJiraIssueDetail(db, "ENG-2"));
    assert.ok(getJiraIssueDetail(db, "ENG-3"));
    assert.equal(getJiraIssueDetail(db, "ENG-OLD")?.record.outOfScope, true);

    const refreshedConfig = getJiraProjectConfig(db, projectConfig.id);
    assert.ok(refreshedConfig?.lastFullSyncAt);
    assert.equal(getJiraConnection(db, "conn-1")?.lastSuccessfulSyncAt, refreshedConfig?.lastFullSyncAt);
  } finally {
    restore();
  }
});

test("runFullJiraSync always scopes the query to the configured project, even with no additional JQL", async () => {
  const { db, projectConfig } = setUp();
  // Simulate the "user cleared the filter" case the review flagged: a
  // saved project config with no JQL of its own.
  const unfilteredConfig = { ...projectConfig, jql: null };

  let capturedJql = "";
  const restore = stubFetch(async (init) => {
    const body = JSON.parse(String(init?.body)) as { jql: string };
    capturedJql = body.jql;
    return jsonResponse({ issues: [], maxResults: 50, startAt: 0, total: 0 });
  });

  try {
    await runFullJiraSync({
      clientOptions: { wait: async () => {} },
      connectionId: "conn-1",
      credentials: CREDENTIALS,
      db,
      projectConfig: unfilteredConfig,
    });

    // Must never run unscoped — every issue a site-wide query returned
    // would otherwise be attributed to this local project config.
    assert.equal(capturedJql, '(project = "ENG")');
  } finally {
    restore();
  }
});

test("runFullJiraSync records the failure on the connection and rethrows", async () => {
  const { db, projectConfig } = setUp();
  const restore = stubFetch(async () =>
    jsonResponse({ errorMessages: ["Service unavailable."] }, 503),
  );

  try {
    await assert.rejects(() =>
      runFullJiraSync({
        clientOptions: { maxAttempts: 1, wait: async () => {} },
        connectionId: "conn-1",
        credentials: CREDENTIALS,
        db,
        projectConfig,
      }),
    );

    assert.match(getJiraConnection(db, "conn-1")?.lastError ?? "", /unavailable/i);
  } finally {
    restore();
  }
});

test("runIncrementalJiraSync refuses to run before any full sync has completed", async () => {
  const { db, projectConfig } = setUp();

  await assert.rejects(
    () =>
      runIncrementalJiraSync({
        connectionId: "conn-1",
        credentials: CREDENTIALS,
        db,
        projectConfig,
      }),
    /never completed a full sync/,
  );
});

test("runIncrementalJiraSync scopes the JQL to a relative updated window and never marks issues out of scope", async () => {
  const { db, projectConfig } = setUp();

  // Establish a baseline full sync cursor and one out-of-scope-eligible issue.
  const fullSyncRestore = stubFetch(async () =>
    jsonResponse({ issues: [rawIssue("ENG-1")], maxResults: 50, startAt: 0, total: 1 }),
  );
  const fullSyncResult = await runFullJiraSync({
    clientOptions: { wait: async () => {} },
    connectionId: "conn-1",
    credentials: CREDENTIALS,
    db,
    projectConfig,
  });
  fullSyncRestore();

  const refreshedConfig = getJiraProjectConfig(db, projectConfig.id)!;
  assert.ok(refreshedConfig.lastFullSyncAt);
  void fullSyncResult;

  let capturedJql = "";
  const incrementalRestore = stubFetch(async (init) => {
    const body = JSON.parse(String(init?.body)) as { jql: string };
    capturedJql = body.jql;
    return jsonResponse({ issues: [rawIssue("ENG-1", "2026-08-19T00:00:00.000Z")], maxResults: 50, startAt: 0, total: 1 });
  });

  try {
    const incrementalResult = await runIncrementalJiraSync({
      clientOptions: { wait: async () => {} },
      connectionId: "conn-1",
      credentials: CREDENTIALS,
      db,
      projectConfig: refreshedConfig,
    });

    assert.equal(incrementalResult.mode, "incremental");
    assert.equal(incrementalResult.markedOutOfScopeCount, 0);
    assert.match(
      capturedJql,
      /^\(project = "ENG"\) AND \(statusCategory != Done\) AND \(updated >= "-\d+m"\)$/,
    );

    // ENG-1's record is updated, and out_of_scope is never touched by an
    // incremental sync — nothing here asserts it changed either way,
    // which is the point: only a full sync may mark issues out of scope.
    assert.equal(getJiraIssueDetail(db, "ENG-1")?.record.outOfScope, false);
  } finally {
    incrementalRestore();
  }
});
