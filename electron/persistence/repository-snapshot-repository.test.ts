import test from "node:test";
import assert from "node:assert/strict";
import { openSqliteConnection } from "./sqlite-driver";
import { runMigrations } from "./migration-runner";
import { backlogMigrations } from "./migrations";
import {
  computeRepositoryFingerprint,
  getOrCreateRepositorySnapshot,
  getRepositorySnapshot,
} from "./repository-snapshot-repository";

function createTestDatabase() {
  const db = openSqliteConnection({ path: ":memory:" });
  runMigrations(db, backlogMigrations);
  return db;
}

test("getOrCreateRepositorySnapshot creates one row and reuses it for the same HEAD SHA", () => {
  const db = createTestDatabase();

  const first = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    localProjectId: "proj-1",
    repositoryPath: "/repo",
  });
  const second = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    localProjectId: "proj-1",
    repositoryPath: "/repo",
  });

  assert.equal(first.id, second.id);
  assert.equal(getRepositorySnapshot(db, first.id)?.headSha, "abc123");

  db.close();
});

test("getOrCreateRepositorySnapshot creates a new row when the HEAD SHA changes", () => {
  const db = createTestDatabase();

  const first = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    localProjectId: "proj-1",
    repositoryPath: "/repo",
  });
  const second = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "def456",
    localProjectId: "proj-1",
    repositoryPath: "/repo",
  });

  assert.notEqual(first.id, second.id);

  db.close();
});

test("getOrCreateRepositorySnapshot creates a new row when the repository path changes, even with the same local project ID and HEAD SHA", () => {
  const db = createTestDatabase();

  const first = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    localProjectId: "proj-1",
    repositoryPath: "/old/path",
  });
  // Same local project ID and HEAD SHA — e.g. the project was moved or
  // replaced by a fresh checkout that happens to be at an identical
  // commit. Reusing the old snapshot here would attach new evidence to
  // a repository_path that no longer exists.
  const second = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    localProjectId: "proj-1",
    repositoryPath: "/new/path",
  });

  assert.notEqual(first.id, second.id);
  assert.equal(getRepositorySnapshot(db, second.id)?.repositoryPath, "/new/path");

  db.close();
});

test("getOrCreateRepositorySnapshot creates a new row when the indexer version bumps", () => {
  const db = createTestDatabase();

  const first = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    indexerVersion: "1",
    localProjectId: "proj-1",
    repositoryPath: "/repo",
  });
  const second = getOrCreateRepositorySnapshot(db, {
    defaultBranch: "main",
    headSha: "abc123",
    indexerVersion: "2",
    localProjectId: "proj-1",
    repositoryPath: "/repo",
  });

  assert.notEqual(first.id, second.id);

  db.close();
});

test("computeRepositoryFingerprint is deterministic and sensitive to every input", () => {
  const base = {
    headSha: "abc123",
    ignorePolicyHash: "hash-1",
    indexerVersion: "1",
    repositoryPath: "/repo",
  };

  assert.equal(computeRepositoryFingerprint(base), computeRepositoryFingerprint({ ...base }));
  assert.notEqual(
    computeRepositoryFingerprint(base),
    computeRepositoryFingerprint({ ...base, headSha: "different" }),
  );
  assert.notEqual(
    computeRepositoryFingerprint(base),
    computeRepositoryFingerprint({ ...base, ignorePolicyHash: "different" }),
  );
  assert.notEqual(
    computeRepositoryFingerprint(base),
    computeRepositoryFingerprint({ ...base, indexerVersion: "2" }),
  );
});
