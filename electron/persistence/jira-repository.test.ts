import test from "node:test";
import assert from "node:assert/strict";
import type { JiraIssueDetail } from "../../shared/jira";
import { openSqliteConnection } from "./sqlite-driver";
import { runMigrations } from "./migration-runner";
import { backlogMigrations } from "./migrations";
import {
  deleteJiraConnection,
  getJiraConnection,
  getJiraIssueDetail,
  getJiraProjectConfig,
  listJiraIssuesForProject,
  listJiraProjectConfigs,
  markJiraIssuesOutOfScope,
  recordJiraConnectionHealth,
  updateJiraProjectSyncCursor,
  upsertJiraConnection,
  upsertJiraIssues,
  upsertJiraProjectConfig,
} from "./jira-repository";

function createTestDatabase() {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);
  return db;
}

function buildIssue(overrides: Partial<JiraIssueDetail["record"]> = {}): JiraIssueDetail {
  return {
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
      projectId: "project-config-1",
      status: "Open",
      summary: "Do the thing",
      syncedAt: "2026-08-19T00:00:00.000Z",
      ...overrides,
    },
  };
}

test("upsertJiraConnection creates then updates a connection", () => {
  const db = createTestDatabase();

  const created = upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });
  assert.equal(created.baseUrl, "https://example.atlassian.net");

  const updated = upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://renamed.atlassian.net",
    id: "conn-1",
  });
  assert.equal(updated.baseUrl, "https://renamed.atlassian.net");
  assert.equal(getJiraConnection(db, "conn-1")?.baseUrl, "https://renamed.atlassian.net");

  db.close();
});

test("deleteJiraConnection cascades to remove dependent projects, issues, comments, and links", () => {
  const db = createTestDatabase();
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });
  const projectConfig = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: null,
    name: "Engineering",
    projectKey: "ENG",
  });
  upsertJiraIssues(db, [
    {
      ...buildIssue({ issueKey: "ENG-1", projectId: projectConfig.id }),
      comments: [
        {
          author: "Dev",
          body: "A comment",
          id: "c-1",
          issueKey: "ENG-1",
          jiraCreatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      links: [
        {
          id: "ENG-1:ENG-2:blocks",
          issueKey: "ENG-1",
          linkType: "blocks",
          relatedIssueKey: "ENG-2",
        },
      ],
    },
  ]);

  assert.ok(getJiraIssueDetail(db, "ENG-1"));

  deleteJiraConnection(db, "conn-1");

  assert.equal(getJiraConnection(db, "conn-1"), null);
  assert.equal(getJiraProjectConfig(db, projectConfig.id), null);
  assert.equal(getJiraIssueDetail(db, "ENG-1"), null);

  db.close();
});

test("recordJiraConnectionHealth stores the last error and only advances lastSuccessfulSyncAt on success", () => {
  const db = createTestDatabase();
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });

  recordJiraConnectionHealth(db, "conn-1", { errorMessage: "boom", succeededAt: null });
  let connection = getJiraConnection(db, "conn-1");
  assert.equal(connection?.lastError, "boom");
  assert.equal(connection?.lastSuccessfulSyncAt, null);

  recordJiraConnectionHealth(db, "conn-1", {
    errorMessage: null,
    succeededAt: "2026-08-19T00:00:00.000Z",
  });
  connection = getJiraConnection(db, "conn-1");
  assert.equal(connection?.lastError, null);
  assert.equal(connection?.lastSuccessfulSyncAt, "2026-08-19T00:00:00.000Z");

  db.close();
});

test("upsertJiraProjectConfig is idempotent on (connectionId, projectKey)", () => {
  const db = createTestDatabase();
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });

  const first = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "project = ENG",
    name: "Engineering",
    projectKey: "ENG",
  });
  const second = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "project = ENG AND statusCategory != Done",
    name: "Engineering",
    projectKey: "ENG",
  });

  assert.equal(first.id, second.id);
  assert.equal(second.jql, "project = ENG AND statusCategory != Done");
  assert.equal(listJiraProjectConfigs(db, "conn-1").length, 1);
  assert.equal(getJiraProjectConfig(db, first.id)?.projectKey, "ENG");

  db.close();
});

test("updateJiraProjectSyncCursor only touches the fields it is given", () => {
  const db = createTestDatabase();
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });
  const config = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: null,
    name: "Engineering",
    projectKey: "ENG",
  });

  updateJiraProjectSyncCursor(db, config.id, { lastFullSyncAt: "2026-08-19T00:00:00.000Z" });
  let refreshed = getJiraProjectConfig(db, config.id);
  assert.equal(refreshed?.lastFullSyncAt, "2026-08-19T00:00:00.000Z");
  assert.equal(refreshed?.lastIncrementalSyncAt, null);

  updateJiraProjectSyncCursor(db, config.id, {
    lastIncrementalSyncAt: "2026-08-19T01:00:00.000Z",
  });
  refreshed = getJiraProjectConfig(db, config.id);
  assert.equal(refreshed?.lastFullSyncAt, "2026-08-19T00:00:00.000Z");
  assert.equal(refreshed?.lastIncrementalSyncAt, "2026-08-19T01:00:00.000Z");

  db.close();
});

function seedProject(db: ReturnType<typeof createTestDatabase>) {
  upsertJiraConnection(db, {
    accountEmail: "dev@example.com",
    baseUrl: "https://example.atlassian.net",
    id: "conn-1",
  });
  return upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "project = ENG",
    name: "Engineering",
    projectKey: "ENG",
  });
}

test("upsertJiraIssues inserts issues with comments and links, and updates on re-sync", () => {
  const db = createTestDatabase();
  const project = seedProject(db);

  const issue = buildIssue({ projectId: project.id, summary: "Original summary" });
  issue.comments = [
    { author: "Ana", body: "First comment", id: "c1", issueKey: "ENG-1", jiraCreatedAt: "2026-08-01T00:00:00.000Z" },
  ];
  issue.links = [
    { id: "l1", issueKey: "ENG-1", linkType: "relates to", relatedIssueKey: "ENG-2" },
  ];
  upsertJiraIssues(db, [issue]);

  let stored = getJiraIssueDetail(db, "ENG-1");
  assert.equal(stored?.record.summary, "Original summary");
  assert.equal(stored?.comments.length, 1);
  assert.equal(stored?.links.length, 1);

  const updatedIssue = buildIssue({ projectId: project.id, summary: "Updated summary" });
  upsertJiraIssues(db, [updatedIssue]);

  stored = getJiraIssueDetail(db, "ENG-1");
  assert.equal(stored?.record.summary, "Updated summary");
  // Comments/links are replaced wholesale on each sync of the same issue.
  assert.equal(stored?.comments.length, 0);
  assert.equal(stored?.links.length, 0);

  db.close();
});

test("upsertJiraIssues clears out_of_scope when a previously out-of-scope issue reappears", () => {
  const db = createTestDatabase();
  const project = seedProject(db);

  upsertJiraIssues(db, [buildIssue({ projectId: project.id })]);
  markJiraIssuesOutOfScope(db, project.id, []);
  assert.equal(getJiraIssueDetail(db, "ENG-1")?.record.outOfScope, true);

  upsertJiraIssues(db, [buildIssue({ projectId: project.id })]);
  assert.equal(getJiraIssueDetail(db, "ENG-1")?.record.outOfScope, false);

  db.close();
});

test("markJiraIssuesOutOfScope only marks issues not in the current key set, scoped to one project", () => {
  const db = createTestDatabase();
  const project = seedProject(db);
  const otherProject = upsertJiraProjectConfig(db, {
    connectionId: "conn-1",
    jql: "project = OPS",
    name: "Operations",
    projectKey: "OPS",
  });

  upsertJiraIssues(db, [
    buildIssue({ issueKey: "ENG-1", projectId: project.id }),
    buildIssue({ issueKey: "ENG-2", projectId: project.id }),
    buildIssue({ issueKey: "OPS-1", projectId: otherProject.id }),
  ]);

  const markedCount = markJiraIssuesOutOfScope(db, project.id, ["ENG-1"]);
  assert.equal(markedCount, 1);
  assert.equal(getJiraIssueDetail(db, "ENG-1")?.record.outOfScope, false);
  assert.equal(getJiraIssueDetail(db, "ENG-2")?.record.outOfScope, true);
  // A different project's issues must never be touched by this call.
  assert.equal(getJiraIssueDetail(db, "OPS-1")?.record.outOfScope, false);

  db.close();
});

test("listJiraIssuesForProject paginates and reports the total", () => {
  const db = createTestDatabase();
  const project = seedProject(db);

  upsertJiraIssues(
    db,
    Array.from({ length: 5 }, (_unused, index) =>
      buildIssue({
        issueKey: `ENG-${index + 1}`,
        jiraUpdatedAt: `2026-08-0${index + 1}T00:00:00.000Z`,
        projectId: project.id,
      }),
    ),
  );

  const firstPage = listJiraIssuesForProject(db, project.id, { limit: 2, offset: 0 });
  assert.equal(firstPage.total, 5);
  assert.equal(firstPage.issues.length, 2);
  // Ordered by jira_updated_at DESC — most recently updated first.
  assert.equal(firstPage.issues[0].issueKey, "ENG-5");

  const secondPage = listJiraIssuesForProject(db, project.id, { limit: 2, offset: 2 });
  assert.equal(secondPage.issues[0].issueKey, "ENG-3");

  db.close();
});
