import { randomUUID } from "node:crypto";
import type { EvidenceItem, GatherEvidenceRequest, GatherEvidenceResult } from "../../shared/evidence";
import type { SqliteConnection } from "../persistence/sqlite-driver";
import {
  getOrCreateRepositorySnapshot,
} from "../persistence/repository-snapshot-repository";
import {
  EVIDENCE_COLLECTOR_VERSION,
  replaceEvidenceForIssue,
} from "../persistence/evidence-repository";
import { getRepositoryHeadInfo, searchCommitsByIssueKey } from "./git-runner";
import { searchRepositoryText } from "./code-search";
import { searchGitHubPullRequestsForIssueKey } from "./github-pr-evidence";

/**
 * Gathers deterministic evidence for one issue across its mapped
 * repositories (Phase 3): exact issue-key commit references, lexical
 * code matches, and GitHub PR search — in that priority order, per
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 4.2. No model
 * call anywhere in this file.
 *
 * Registered as the "gather-evidence" Engineering Brain operation kind
 * (electron/repository-evidence-ipc.ts) — reuses Phase 1's
 * start/progress/cancel machinery rather than a second one.
 */

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("Evidence gathering cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

export interface GatherEvidenceContext {
  db: SqliteConnection;
  jiraProjectId: string;
  onProgress?: (progress: number) => void;
  request: GatherEvidenceRequest;
  signal?: AbortSignal;
}

export async function gatherEvidence(
  context: GatherEvidenceContext,
): Promise<GatherEvidenceResult> {
  const { db, jiraProjectId, request } = context;
  const evidence: EvidenceItem[] = [];
  const result: GatherEvidenceResult = {
    evidence,
    issueKey: request.issueKey,
    repositorySnapshots: [],
    unavailableRepositories: [],
  };

  for (let index = 0; index < request.repositories.length; index += 1) {
    assertNotAborted(context.signal);
    const repository = request.repositories[index];

    try {
      await gatherEvidenceForRepository(db, request.issueKey, repository, evidence, result);
    } catch (error) {
      // One repository unavailable must not fail the whole gather (a
      // moved/deleted local project, a repository that is no longer a
      // git checkout, a transient git failure) — record it and move on.
      result.unavailableRepositories.push({
        message: error instanceof Error ? error.message : String(error),
        repositoryPath: repository.repositoryPath,
      });
    }

    context.onProgress?.((index + 1) / request.repositories.length);
  }

  replaceEvidenceForIssue(db, jiraProjectId, request.issueKey, evidence);

  return result;
}

async function gatherEvidenceForRepository(
  db: SqliteConnection,
  issueKey: string,
  repository: GatherEvidenceRequest["repositories"][number],
  evidence: EvidenceItem[],
  result: GatherEvidenceResult,
): Promise<void> {
  const headInfo = await getRepositoryHeadInfo(repository.repositoryPath);
  const snapshot = getOrCreateRepositorySnapshot(db, {
    defaultBranch: headInfo.defaultBranch,
    headSha: headInfo.headSha,
    localProjectId: repository.localProjectId,
    repositoryPath: repository.repositoryPath,
  });
  result.repositorySnapshots.push(snapshot);

  const collectedAt = new Date().toISOString();

  const commitMatches = await searchCommitsByIssueKey(repository.repositoryPath, issueKey);
  for (const commit of commitMatches) {
    evidence.push({
      collectedAt,
      collectorVersion: EVIDENCE_COLLECTOR_VERSION,
      excerpt: `${commit.authorName} · ${commit.authorDate}`,
      filePath: null,
      id: randomUUID(),
      kind: "git_commit",
      metadata: { authorDate: commit.authorDate, authorName: commit.authorName },
      query: issueKey,
      repositorySnapshotId: snapshot.id,
      sourceId: commit.sha,
      sourceUrl: null,
      // Weight 1.00 in the confidence model (section 8) — an exact
      // issue-key commit reference is the strongest signal there is.
      strength: "high",
      symbol: null,
      title: commit.subject,
    });
  }

  const codeMatches = await searchRepositoryText(repository.repositoryPath, issueKey);
  for (const match of codeMatches) {
    evidence.push({
      collectedAt,
      collectorVersion: EVIDENCE_COLLECTOR_VERSION,
      excerpt: match.lineText,
      filePath: match.filePath,
      id: randomUUID(),
      kind: "code_file",
      metadata: { lineNumber: match.lineNumber },
      query: issueKey,
      repositorySnapshotId: snapshot.id,
      sourceId: null,
      sourceUrl: null,
      // "Strong lexical match" is weighted 0.60 in section 8's table —
      // below the 0.65 medium-confidence threshold, so this is "low".
      strength: "low",
      symbol: null,
      title: match.filePath,
    });
  }

  if (repository.githubRepositorySlug) {
    const pullRequestMatches = await searchGitHubPullRequestsForIssueKey(
      repository.githubRepositorySlug,
      issueKey,
    );
    for (const pullRequest of pullRequestMatches) {
      evidence.push({
        collectedAt,
        collectorVersion: EVIDENCE_COLLECTOR_VERSION,
        excerpt: null,
        filePath: null,
        id: randomUUID(),
        kind: "github_pull_request",
        metadata: { updatedAt: pullRequest.updatedAt },
        query: issueKey,
        repositorySnapshotId: snapshot.id,
        sourceId: String(pullRequest.number),
        sourceUrl: pullRequest.htmlUrl,
        strength: "high",
        symbol: null,
        title: pullRequest.title,
      });
    }
  }
}
