import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeComment,
  normalizeJiraChangelogEntries,
  normalizeJiraIssue,
  type JiraApiIssue,
} from "./jira-normalizer";

test("normalizeJiraIssue maps required fields and defaults absent optionals", () => {
  const rawIssue: JiraApiIssue = {
    fields: {
      issuetype: { name: "Task" },
      status: { name: "In Progress" },
      summary: "Improve caching",
      updated: "2026-08-01T12:00:00.000+0000",
    },
    id: "10001",
    key: "ENG-1",
  };

  const normalized = normalizeJiraIssue(rawIssue, "project-config-1", "2026-08-19T00:00:00.000Z");

  assert.deepEqual(normalized.record, {
    components: [],
    description: null,
    issueKey: "ENG-1",
    issueType: "Task",
    jiraUpdatedAt: "2026-08-01T12:00:00.000+0000",
    labels: [],
    outOfScope: false,
    parentIssueKey: null,
    projectId: "project-config-1",
    status: "In Progress",
    summary: "Improve caching",
    syncedAt: "2026-08-19T00:00:00.000Z",
  });
  assert.deepEqual(normalized.comments, []);
  assert.deepEqual(normalized.links, []);
});

test("normalizeJiraIssue converts ADF description, labels, components, and parent", () => {
  const rawIssue: JiraApiIssue = {
    fields: {
      components: [{ name: "backend" }, { name: "api" }],
      description: {
        content: [{ content: [{ text: "Needs a cache layer.", type: "text" }], type: "paragraph" }],
        type: "doc",
      },
      issuetype: { name: "Story" },
      labels: ["performance"],
      parent: { key: "ENG-0" },
      status: { name: "Open" },
      summary: "Add caching",
      updated: "2026-08-01T12:00:00.000+0000",
    },
    id: "10002",
    key: "ENG-2",
  };

  const normalized = normalizeJiraIssue(rawIssue, "project-config-1", "2026-08-19T00:00:00.000Z");

  assert.equal(normalized.record.description, "Needs a cache layer.");
  assert.deepEqual(normalized.record.components, ["backend", "api"]);
  assert.deepEqual(normalized.record.labels, ["performance"]);
  assert.equal(normalized.record.parentIssueKey, "ENG-0");
});

test("normalizeJiraIssue normalises inbound and outbound issue links", () => {
  const rawIssue: JiraApiIssue = {
    fields: {
      issuelinks: [
        {
          id: "10100",
          outwardIssue: { key: "ENG-9" },
          type: { name: "relates to", outward: "relates to" },
        },
        {
          inwardIssue: { key: "ENG-8" },
          type: { inward: "is blocked by", name: "blocks" },
        },
      ],
      issuetype: { name: "Task" },
      status: { name: "Open" },
      summary: "Investigate flaky test",
      updated: "2026-08-01T12:00:00.000+0000",
    },
    id: "10003",
    key: "ENG-3",
  };

  const normalized = normalizeJiraIssue(rawIssue, "project-config-1", "2026-08-19T00:00:00.000Z");

  assert.deepEqual(normalized.links, [
    { id: "10100", issueKey: "ENG-3", linkType: "relates to", relatedIssueKey: "ENG-9" },
    {
      id: "ENG-3:ENG-8:is blocked by",
      issueKey: "ENG-3",
      linkType: "is blocked by",
      relatedIssueKey: "ENG-8",
    },
  ]);
});

test("normalizeJiraIssue normalises comments, defaulting a missing author and body", () => {
  const rawIssue: JiraApiIssue = {
    fields: {
      comment: {
        comments: [
          { author: { displayName: "Ana" }, body: "Looks good.", created: "2026-08-02T09:00:00.000Z", id: "1" },
          { body: null, created: "2026-08-03T09:00:00.000Z", id: "2" },
        ],
      },
      issuetype: { name: "Task" },
      status: { name: "Open" },
      summary: "Review PR",
      updated: "2026-08-01T12:00:00.000+0000",
    },
    id: "10004",
    key: "ENG-4",
  };

  const normalized = normalizeJiraIssue(rawIssue, "project-config-1", "2026-08-19T00:00:00.000Z");

  assert.deepEqual(normalized.comments, [
    { author: "Ana", body: "Looks good.", id: "1", issueKey: "ENG-4", jiraCreatedAt: "2026-08-02T09:00:00.000Z" },
    { author: null, body: "", id: "2", issueKey: "ENG-4", jiraCreatedAt: "2026-08-03T09:00:00.000Z" },
  ]);
});

test("normalizeComment is the single source of truth reused by the client's getComments", () => {
  const comment = normalizeComment(
    { author: { displayName: "Bo" }, body: "hi", created: "2026-08-01T00:00:00.000Z", id: "5" },
    "ENG-5",
  );
  assert.deepEqual(comment, {
    author: "Bo",
    body: "hi",
    id: "5",
    issueKey: "ENG-5",
    jiraCreatedAt: "2026-08-01T00:00:00.000Z",
  });
});

test("normalizeJiraChangelogEntries flattens one entry's items into separate records", () => {
  const entries = normalizeJiraChangelogEntries([
    {
      author: { displayName: "Ana" },
      created: "2026-08-01T00:00:00.000Z",
      id: "900",
      items: [
        { field: "status", fromString: "Open", toString: "In Progress" },
        { field: "assignee", fromString: null, toString: "Ana" },
      ],
    },
  ]);

  assert.deepEqual(entries, [
    {
      author: "Ana",
      created: "2026-08-01T00:00:00.000Z",
      field: "status",
      fromValue: "Open",
      id: "900:status",
      toValue: "In Progress",
    },
    {
      author: "Ana",
      created: "2026-08-01T00:00:00.000Z",
      field: "assignee",
      fromValue: null,
      id: "900:assignee",
      toValue: "Ana",
    },
  ]);
});
