import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "./sqlite-driver";
import { runMigrations } from "./migration-runner";
import { backlogMigrations } from "./migrations";
import {
  deleteBacklogMapping,
  listBacklogMappings,
  resolveRepositoryMapping,
  upsertBacklogMapping,
} from "./backlog-mapping-repository";

function createTestDatabase() {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);
  return db;
}

test("upsertBacklogMapping creates then updates a rule by id", () => {
  const db = createTestDatabase();

  const created = upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["proj-1"],
    match: { type: "component", value: "backend" },
    priority: 1,
  });
  assert.equal(created.match.type, "component");

  const updated = upsertBacklogMapping(db, {
    ...created,
    localProjectIds: ["proj-1", "proj-2"],
    priority: 5,
  });
  assert.equal(updated.id, created.id);
  assert.deepEqual(updated.localProjectIds, ["proj-1", "proj-2"]);
  assert.equal(updated.priority, 5);
  assert.equal(listBacklogMappings(db, "ENG").length, 1);

  db.close();
});

test("deleteBacklogMapping removes a rule", () => {
  const db = createTestDatabase();
  const rule = upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["proj-1"],
    match: { type: "project_default" },
    priority: 0,
  });

  deleteBacklogMapping(db, rule.id);
  assert.equal(listBacklogMappings(db, "ENG").length, 0);

  db.close();
});

test("resolveRepositoryMapping follows precedence: issue > component > label > project default", () => {
  const db = createTestDatabase();

  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["default-project"],
    match: { type: "project_default" },
    priority: 0,
  });
  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["label-project"],
    match: { type: "label", value: "backend" },
    priority: 0,
  });
  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["component-project"],
    match: { type: "component", value: "api" },
    priority: 0,
  });
  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["issue-project"],
    match: { type: "issue", value: "ENG-1" },
    priority: 0,
  });

  // Only the project fallback applies.
  assert.deepEqual(
    resolveRepositoryMapping(db, {
      components: [],
      issueKey: "ENG-2",
      jiraProjectKey: "ENG",
      labels: [],
    })?.localProjectIds,
    ["default-project"],
  );

  // Label beats the project fallback.
  assert.deepEqual(
    resolveRepositoryMapping(db, {
      components: [],
      issueKey: "ENG-2",
      jiraProjectKey: "ENG",
      labels: ["backend"],
    })?.localProjectIds,
    ["label-project"],
  );

  // Component beats label.
  assert.deepEqual(
    resolveRepositoryMapping(db, {
      components: ["api"],
      issueKey: "ENG-2",
      jiraProjectKey: "ENG",
      labels: ["backend"],
    })?.localProjectIds,
    ["component-project"],
  );

  // An exact issue override beats everything else.
  assert.deepEqual(
    resolveRepositoryMapping(db, {
      components: ["api"],
      issueKey: "ENG-1",
      jiraProjectKey: "ENG",
      labels: ["backend"],
    })?.localProjectIds,
    ["issue-project"],
  );

  db.close();
});

test("resolveRepositoryMapping returns null (never 'all repositories') when nothing matches", () => {
  const db = createTestDatabase();
  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["component-project"],
    match: { type: "component", value: "api" },
    priority: 0,
  });

  const resolved = resolveRepositoryMapping(db, {
    components: ["frontend"],
    issueKey: "ENG-2",
    jiraProjectKey: "ENG",
    labels: [],
  });
  assert.equal(resolved, null);

  db.close();
});

test("resolveRepositoryMapping ignores disabled rules", () => {
  const db = createTestDatabase();
  upsertBacklogMapping(db, {
    enabled: false,
    jiraProjectKey: "ENG",
    localProjectIds: ["disabled-project"],
    match: { type: "project_default" },
    priority: 0,
  });

  const resolved = resolveRepositoryMapping(db, {
    components: [],
    issueKey: "ENG-1",
    jiraProjectKey: "ENG",
    labels: [],
  });
  assert.equal(resolved, null);

  db.close();
});

test("resolveRepositoryMapping breaks ties within the same match type using the higher priority", () => {
  const db = createTestDatabase();
  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["low-priority"],
    match: { type: "label", value: "backend" },
    priority: 1,
  });
  upsertBacklogMapping(db, {
    enabled: true,
    jiraProjectKey: "ENG",
    localProjectIds: ["high-priority"],
    match: { type: "label", value: "backend" },
    priority: 10,
  });

  const resolved = resolveRepositoryMapping(db, {
    components: [],
    issueKey: "ENG-1",
    jiraProjectKey: "ENG",
    labels: ["backend"],
  });
  assert.deepEqual(resolved?.localProjectIds, ["high-priority"]);

  db.close();
});
