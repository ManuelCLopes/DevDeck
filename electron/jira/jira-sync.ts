import type { JiraConnectionCredentials, JiraProjectConfig, JiraSyncResult } from "../../shared/jira";
import type { SqliteConnection } from "../persistence/sqlite-driver";
import {
  markJiraIssuesOutOfScope,
  recordJiraConnectionHealth,
  updateJiraProjectSyncCursor,
  upsertJiraIssues,
} from "../persistence/jira-repository";
import { searchIssues, type JiraClientRequestOptions } from "./jira-client";
import { JiraApiError, JiraConnectivityError } from "./jira-errors";

/**
 * Full and incremental Jira sync
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 13,
 * docs/ENGINEERING_BRAIN_RFC.md section 17). Registered as Engineering
 * Brain operation kinds in electron/jira-ipc.ts so start/progress/cancel
 * reuse the Phase 1 operation service rather than a second mechanism.
 */

/** Bounds pagination so a misbehaving response (or an unbounded JQL) can't loop forever. */
const MAX_SYNC_PAGES = 500;
const DEFAULT_PAGE_SIZE = 100;
/** Extra minutes re-fetched on top of the elapsed-since-last-sync window, to absorb clock skew. */
const INCREMENTAL_SYNC_OVERLAP_MINUTES = 5;

export interface JiraSyncContext {
  clientOptions?: JiraClientRequestOptions;
  connectionId: string;
  credentials: JiraConnectionCredentials;
  db: SqliteConnection;
  onProgress?: (progress: number) => void;
  pageSize?: number;
  projectConfig: JiraProjectConfig;
  signal?: AbortSignal;
}

/**
 * Always scopes a sync's JQL to the configured project — the user's own
 * JQL (or the incremental time window) is ANDed onto a mandatory
 * `project = "<key>"` clause rather than trusted to include one itself.
 * Without this, an empty or misconfigured filter would run site-wide
 * and attribute every returned issue to this local project config,
 * corrupting later repository-mapping and evidence lookups.
 */
function buildProjectScopedJql(
  projectConfig: JiraProjectConfig,
  extraClause?: string,
): string {
  const clauses = [`project = "${projectConfig.projectKey}"`];
  if (projectConfig.jql) {
    clauses.push(projectConfig.jql);
  }
  if (extraClause) {
    clauses.push(extraClause);
  }
  return clauses.map((clause) => `(${clause})`).join(" AND ");
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("Sync cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

async function fetchAllPages(
  context: JiraSyncContext,
  jql: string,
): Promise<{ issueKeys: string[] }> {
  const pageSize = context.pageSize ?? DEFAULT_PAGE_SIZE;
  const issueKeys: string[] = [];
  let startAt = 0;
  let total = Infinity;

  for (let page = 0; page < MAX_SYNC_PAGES && startAt < total; page += 1) {
    assertNotAborted(context.signal);

    const result = await searchIssues(
      context.credentials,
      { jql, maxResults: pageSize, startAt },
      context.projectConfig.id,
      context.clientOptions,
    );

    upsertJiraIssues(context.db, result.issues);
    for (const issue of result.issues) {
      issueKeys.push(issue.record.issueKey);
    }

    total = result.total;
    startAt = result.startAt + result.issues.length;
    context.onProgress?.(total > 0 ? Math.min(1, startAt / total) : 1);

    if (result.isLast || result.issues.length === 0) {
      break;
    }
  }

  return { issueKeys };
}

async function withConnectionHealthTracking(
  context: JiraSyncContext,
  run: () => Promise<JiraSyncResult>,
): Promise<JiraSyncResult> {
  try {
    const result = await run();
    recordJiraConnectionHealth(context.db, context.connectionId, {
      errorMessage: null,
      succeededAt: result.syncedAt,
    });
    return result;
  } catch (error) {
    if (error instanceof JiraApiError || error instanceof JiraConnectivityError) {
      recordJiraConnectionHealth(context.db, context.connectionId, {
        errorMessage: error.message,
        succeededAt: null,
      });
    }
    throw error;
  }
}

/**
 * Fetches every issue currently matching the project's JQL, upserts
 * them, and marks previously-synced issues that no longer match as
 * `out_of_scope` (never deleted — see ADR and section 13 of the
 * integration plan). Safe to re-run at any time; it is the periodic
 * full-reconciliation pass as well as the first sync.
 */
export async function runFullJiraSync(context: JiraSyncContext): Promise<JiraSyncResult> {
  return withConnectionHealthTracking(context, async () => {
    const jql = buildProjectScopedJql(context.projectConfig);
    const { issueKeys } = await fetchAllPages(context, jql);

    const markedOutOfScopeCount = markJiraIssuesOutOfScope(
      context.db,
      context.projectConfig.id,
      issueKeys,
    );

    const syncedAt = new Date().toISOString();
    updateJiraProjectSyncCursor(context.db, context.projectConfig.id, {
      lastFullSyncAt: syncedAt,
      lastIncrementalSyncAt: syncedAt,
    });

    return {
      fetchedIssueCount: issueKeys.length,
      markedOutOfScopeCount,
      mode: "full",
      projectConfigId: context.projectConfig.id,
      syncedAt,
      upsertedIssueCount: issueKeys.length,
    };
  });
}

/**
 * Fetches only issues updated since the last sync (plus a safety
 * overlap window) and upserts them. Never marks issues out of scope —
 * an incremental result set is a strict subset of "everything currently
 * matching the JQL" and cannot be used to infer what *stopped* matching
 * (see the doc comment on markJiraIssuesOutOfScope). Requires at least
 * one prior full sync to establish a cursor.
 *
 * Uses JQL's relative-date syntax (`"-Nm"`, resolved against the Jira
 * server's own clock) instead of an absolute timestamp, so this is
 * immune to the requesting machine's and the Jira site's timezone
 * configuration disagreeing — a correctness trap with JQL's absolute
 * date literals.
 */
export async function runIncrementalJiraSync(
  context: JiraSyncContext,
): Promise<JiraSyncResult> {
  return withConnectionHealthTracking(context, async () => {
    const cursor =
      context.projectConfig.lastIncrementalSyncAt ?? context.projectConfig.lastFullSyncAt;
    if (!cursor) {
      throw new Error(
        "This project has never completed a full sync. Run a full sync before an incremental sync.",
      );
    }

    const elapsedMinutes = Math.ceil(
      (Date.now() - new Date(cursor).getTime()) / (60 * 1000),
    );
    const windowMinutes = Math.max(1, elapsedMinutes) + INCREMENTAL_SYNC_OVERLAP_MINUTES;

    const jql = buildProjectScopedJql(context.projectConfig, `updated >= "-${windowMinutes}m"`);
    const { issueKeys } = await fetchAllPages(context, jql);

    const syncedAt = new Date().toISOString();
    updateJiraProjectSyncCursor(context.db, context.projectConfig.id, {
      lastIncrementalSyncAt: syncedAt,
    });

    return {
      fetchedIssueCount: issueKeys.length,
      markedOutOfScopeCount: 0,
      mode: "incremental",
      projectConfigId: context.projectConfig.id,
      syncedAt,
      upsertedIssueCount: issueKeys.length,
    };
  });
}
