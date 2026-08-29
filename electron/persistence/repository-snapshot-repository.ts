import { createHash, randomUUID } from "node:crypto";
import type { RepositorySnapshot } from "../../shared/evidence";
import type { SqliteConnection } from "./sqlite-driver";

/**
 * Bump when the indexing/evidence-collection logic changes materially
 * enough that old snapshots should no longer be treated as equivalent
 * to a fresh one at the same HEAD SHA (docs/BACKLOG_INTELLIGENCE_
 * INTEGRATION_PLAN.md section 15: "repository fingerprint").
 */
export const REPOSITORY_INDEXER_VERSION = "1";

export function computeRepositoryFingerprint(input: {
  headSha: string;
  ignorePolicyHash: string;
  indexerVersion: string;
  repositoryPath: string;
}): string {
  return createHash("sha256")
    .update(input.repositoryPath)
    .update("\0")
    .update(input.headSha)
    .update("\0")
    .update(input.indexerVersion)
    .update("\0")
    .update(input.ignorePolicyHash)
    .digest("hex");
}

interface RepositorySnapshotRow {
  created_at: string;
  default_branch: string | null;
  head_sha: string;
  id: string;
  indexer_version: string | null;
  local_project_id: string;
  repository_path: string;
}

function rowToSnapshot(row: RepositorySnapshotRow): RepositorySnapshot {
  return {
    createdAt: row.created_at,
    defaultBranch: row.default_branch,
    headSha: row.head_sha,
    id: row.id,
    indexerVersion: row.indexer_version ?? REPOSITORY_INDEXER_VERSION,
    localProjectId: row.local_project_id,
    repositoryPath: row.repository_path,
  };
}

export interface GetOrCreateRepositorySnapshotInput {
  defaultBranch: string | null;
  headSha: string;
  indexerVersion?: string;
  localProjectId: string;
  repositoryPath: string;
}

/**
 * Reuses an existing snapshot at the same (local project, repository
 * path, HEAD SHA, indexer version) instead of inserting a duplicate —
 * repeatedly gathering evidence without the repository changing should
 * not grow this table unboundedly. A genuinely new HEAD SHA (or a
 * bumped indexer version) always gets its own row, preserving history.
 *
 * repositoryPath is part of the reuse key, matching
 * computeRepositoryFingerprint's inputs above: a local project ID that
 * gets moved or replaced by a different checkout (same ID, same HEAD
 * SHA by coincidence — e.g. a fresh clone at an identical commit) must
 * not reuse the old snapshot's now-stale repositoryPath, or newly
 * gathered evidence and the UI's file links would point at the wrong
 * location.
 */
export function getOrCreateRepositorySnapshot(
  db: SqliteConnection,
  input: GetOrCreateRepositorySnapshotInput,
): RepositorySnapshot {
  const indexerVersion = input.indexerVersion ?? REPOSITORY_INDEXER_VERSION;

  const existing = db
    .prepare(
      `SELECT * FROM repository_snapshots
       WHERE local_project_id = ? AND repository_path = ? AND head_sha = ? AND indexer_version = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(input.localProjectId, input.repositoryPath, input.headSha, indexerVersion) as
    | RepositorySnapshotRow
    | undefined;
  if (existing) {
    return rowToSnapshot(existing);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO repository_snapshots (
       id, local_project_id, repository_path, head_sha, default_branch, indexer_version, created_at
     ) VALUES (@id, @localProjectId, @repositoryPath, @headSha, @defaultBranch, @indexerVersion, @now)`,
  ).run({
    defaultBranch: input.defaultBranch,
    headSha: input.headSha,
    id,
    indexerVersion,
    localProjectId: input.localProjectId,
    now,
    repositoryPath: input.repositoryPath,
  });

  return {
    createdAt: now,
    defaultBranch: input.defaultBranch,
    headSha: input.headSha,
    id,
    indexerVersion,
    localProjectId: input.localProjectId,
    repositoryPath: input.repositoryPath,
  };
}

export function getRepositorySnapshot(
  db: SqliteConnection,
  id: string,
): RepositorySnapshot | null {
  const row = db.prepare("SELECT * FROM repository_snapshots WHERE id = ?").get(id) as
    | RepositorySnapshotRow
    | undefined;
  return row ? rowToSnapshot(row) : null;
}
