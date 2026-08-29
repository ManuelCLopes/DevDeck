import type { SqliteConnection } from "../persistence/sqlite-driver";
import { getEvidenceForIssue } from "../persistence/evidence-repository";
import { getJiraIssueDetail, listJiraIssuesForProject } from "../persistence/jira-repository";
import { insertAssessment } from "../persistence/assessment-repository";
import {
  cancelRulesScan,
  completeRulesScan,
  completeScanItem,
  createRulesScan,
  failRulesScan,
  failScanItem,
  startScanItem,
} from "../persistence/rules-scan-repository";
import { aggregateSignals, RULES_ENGINE_VERSION } from "./confidence";
import { computeAssessmentSignals } from "./signals";

/**
 * Orchestrates one rules-only scan across every issue currently synced
 * for a Jira project (Phase 4 — docs/BACKLOG_INTELLIGENCE_INTEGRATION_
 * PLAN.md "Phase 4"). Registered as the "rules-scan-project" Engineering
 * Brain operation kind (electron/rules-engine-ipc.ts), the same
 * start/progress/cancel machinery every other long-running operation
 * uses.
 *
 * Deliberately assesses every synced issue, including ones already
 * marked `outOfScope` by Jira sync — that's exactly the case
 * computeObsolescenceSignal (signals.ts) is meant to surface, and
 * skipping them here would mean it never fires in a real scan.
 *
 * Per-issue failure isolation (BI-053): one issue's assessment failing
 * (a corrupt evidence row, an unexpected error) is recorded on its own
 * scan_items row and does not stop the rest of the scan — matching
 * evidence-gather.ts's per-repository isolation in Phase 3.
 */

// Bounds how many issues are pulled into memory per page — keeps a
// large project's scan from loading every issue at once, without
// needing a new "list all" repository function.
const ISSUE_PAGE_SIZE = 200;

export interface RunRulesScanContext {
  db: SqliteConnection;
  jiraProjectId: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export interface RulesScanFailure {
  issueKey: string;
  message: string;
}

export interface RulesScanResult {
  assessedIssueCount: number;
  cancelled: boolean;
  failedIssues: RulesScanFailure[];
  scanId: string;
}

/** Hands control back to Electron's main-process event loop — see its call site's comment. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function collectAllIssueKeys(db: SqliteConnection, jiraProjectId: string): string[] {
  const issueKeys: string[] = [];
  let offset = 0;

  while (true) {
    const page = listJiraIssuesForProject(db, jiraProjectId, {
      limit: ISSUE_PAGE_SIZE,
      offset,
    });
    issueKeys.push(...page.issues.map((issue) => issue.issueKey));
    offset += page.issues.length;

    if (page.issues.length === 0 || offset >= page.total) {
      break;
    }
  }

  return issueKeys;
}

function assessIssue(
  db: SqliteConnection,
  jiraProjectId: string,
  scanId: string,
  issueKey: string,
): void {
  const issueDetail = getJiraIssueDetail(db, issueKey);
  if (!issueDetail) {
    // Should not happen — the issue key came from listJiraIssuesForProject
    // moments ago — but a concurrent sync could in principle remove it
    // mid-scan, and per-issue isolation means this issue simply fails
    // rather than the whole scan.
    throw new Error(`Issue ${issueKey} is no longer synced locally.`);
  }

  const evidence = getEvidenceForIssue(db, jiraProjectId, issueKey);
  const signals = computeAssessmentSignals(issueDetail, evidence);
  const aggregated = aggregateSignals(signals);

  const repositorySnapshotIds = Array.from(
    new Set(
      evidence
        .map((item) => item.repositorySnapshotId)
        .filter((id): id is string => id !== null),
    ),
  );

  insertAssessment(db, {
    classification: aggregated.classification,
    confidence: aggregated.confidence,
    confidenceBand: aggregated.confidenceBand,
    contradictions: aggregated.contradictions,
    engineVersion: RULES_ENGINE_VERSION,
    evidenceIds: aggregated.evidenceIds,
    issueKey,
    openQuestions: aggregated.openQuestions,
    rationale: aggregated.rationale,
    repositorySnapshotIds,
    scanId,
    suggestedAction: aggregated.suggestedAction,
    summary: aggregated.summary,
  });
}

export async function runRulesScan(context: RunRulesScanContext): Promise<RulesScanResult> {
  const { db, jiraProjectId } = context;
  const scanId = createRulesScan(db, jiraProjectId, RULES_ENGINE_VERSION);

  let issueKeys: string[];
  try {
    issueKeys = collectAllIssueKeys(db, jiraProjectId);
  } catch (error) {
    failRulesScan(db, scanId, "ISSUE_LIST_FAILED");
    throw error;
  }

  if (issueKeys.length === 0) {
    completeRulesScan(db, scanId);
    context.onProgress?.(1);
    return { assessedIssueCount: 0, cancelled: false, failedIssues: [], scanId };
  }

  const failedIssues: RulesScanFailure[] = [];
  let assessedIssueCount = 0;

  for (let index = 0; index < issueKeys.length; index += 1) {
    // Every step in assessIssue (SQLite reads/writes, pure signal/
    // confidence computation) is synchronous, so without this the whole
    // loop would run as one blocking stretch on Electron's main thread —
    // a cancel IPC call (which only sets context.signal.aborted) would
    // have no chance to run until the entire scan finished, and every
    // other main-process IPC handler would stall along with it. Yielding
    // once per issue keeps a large scan responsive to both.
    // eslint-disable-next-line no-await-in-loop
    await yieldToEventLoop();

    if (context.signal?.aborted) {
      cancelRulesScan(db, scanId);
      return { assessedIssueCount, cancelled: true, failedIssues, scanId };
    }

    const issueKey = issueKeys[index];
    const scanItemId = startScanItem(db, scanId, issueKey);

    try {
      assessIssue(db, jiraProjectId, scanId, issueKey);
      completeScanItem(db, scanItemId);
      assessedIssueCount += 1;
    } catch (error) {
      failScanItem(db, scanItemId, "ASSESSMENT_FAILED");
      failedIssues.push({
        issueKey,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    context.onProgress?.((index + 1) / issueKeys.length);
  }

  completeRulesScan(db, scanId);
  return { assessedIssueCount, cancelled: false, failedIssues, scanId };
}
