import type { EvidenceKind } from "./backlog";

/**
 * Repository evidence domain types for Phase 3 ("Repository mapping and
 * deterministic evidence" — docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md
 * section 15, docs/ENGINEERING_BRAIN_RFC.md section 19-20).
 *
 * DevDeck's renderer — not Electron — owns the list of local projects and
 * their filesystem paths (client/src/lib/workspace-selection.ts,
 * persisted in the renderer, never in SQLite). Electron is stateless
 * about "which projects exist": every call that touches a repository on
 * disk takes an explicit RepositoryReference from the renderer, the same
 * way loadWorkspaceSnapshot(selection) already works. Storing a bare
 * `localProjectId` string in backlog_mappings / repository_snapshots is
 * therefore only ever meaningful together with a path supplied
 * alongside it at call time.
 */

/** What the renderer already knows about one local project — enough to run git/ripgrep against it. */
export interface RepositoryReference {
  githubRepositorySlug: string | null;
  localProjectId: string;
  repositoryPath: string;
}

export interface RepositorySnapshot {
  createdAt: string;
  defaultBranch: string | null;
  headSha: string;
  id: string;
  indexerVersion: string;
  localProjectId: string;
  repositoryPath: string;
}

export interface EvidenceItem {
  collectedAt: string;
  collectorVersion: string;
  excerpt: string | null;
  filePath: string | null;
  id: string;
  kind: EvidenceKind;
  metadata: Record<string, unknown>;
  query: string | null;
  repositorySnapshotId: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  strength: "high" | "low" | "medium";
  symbol: string | null;
  title: string | null;
}

export interface GatherEvidenceRequest {
  issueKey: string;
  repositories: RepositoryReference[];
}

/**
 * `EvidenceItem.filePath` is relative to the repository it was found in
 * (e.g. `"cache.ts"`) — it only means something combined with that
 * repository's absolute path. `repositoryPathsBySnapshotId` carries
 * exactly enough to resolve it: each evidence item's
 * `repositorySnapshotId` looks up the absolute `repositoryPath` it was
 * collected against, without exposing the renderer's full
 * RepositorySnapshot rows.
 */
export interface EvidenceForIssueResult {
  evidence: EvidenceItem[];
  repositoryPathsBySnapshotId: Record<string, string>;
}

export interface UnavailableRepository {
  message: string;
  repositoryPath: string;
}

export interface GatherEvidenceResult {
  evidence: EvidenceItem[];
  issueKey: string;
  repositorySnapshots: RepositorySnapshot[];
  /** Repositories that failed (path missing, not a git repo, git error) — evidence still ran for the rest. */
  unavailableRepositories: UnavailableRepository[];
}
