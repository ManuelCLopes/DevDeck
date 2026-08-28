import { randomUUID } from "node:crypto";
import type { RulesScanStatus, RulesScanSummary } from "../../shared/assessment";
import type { SqliteConnection } from "./sqlite-driver";

/**
 * Scan lifecycle for Phase 4's rules-only scans, built on the `scans` /
 * `scan_items` tables from schema v1 (electron/persistence/migrations/
 * 0001-init.ts) — the comment on evidence-repository.ts's manual scan
 * said Phase 4 would populate these tables with "rules-derived
 * assessments layered on top" of the same shape; this is that.
 *
 * Unlike Phase 3's evidence gather (one reused scan per project, since
 * it's just a cache), every rules scan run gets its own `scans` row —
 * scan history (BI-050) is part of the point of this phase, so runs
 * must stay distinguishable over time rather than collapsing into one.
 */

interface ScanRow {
  cancelled_at: string | null;
  completed_at: string | null;
  engine_version: string;
  error_code: string | null;
  id: string;
  jira_project_id: string | null;
  started_at: string;
  status: string;
}

/**
 * The `scans` table is shared with Phase 3's evidence gathering, which
 * writes its own synthetic scan there with status `"manual_evidence_
 * gather"` (electron/persistence/evidence-repository.ts) — a marker
 * value, not one of this module's lifecycle states. Every query here
 * scopes to `RULES_SCAN_STATUSES` so a project's evidence-gather scan
 * never leaks into a rules-scan listing.
 */
export const RULES_SCAN_STATUSES: RulesScanStatus[] = [
  "running",
  "completed",
  "failed",
  "cancelled",
];
const RULES_SCAN_STATUS_PLACEHOLDERS = RULES_SCAN_STATUSES.map(() => "?").join(",");

export function createRulesScan(
  db: SqliteConnection,
  jiraProjectId: string,
  engineVersion: string,
): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scans (
       id, jira_project_id, status, engine_version, prompt_version,
       repository_snapshot_ids, started_at, completed_at, cancelled_at, error_code
     ) VALUES (@id, @jiraProjectId, 'running', @engineVersion, NULL, '[]', @now, NULL, NULL, NULL)`,
  ).run({ engineVersion, id, jiraProjectId, now });
  return id;
}

export function completeRulesScan(db: SqliteConnection, scanId: string): void {
  db.prepare("UPDATE scans SET status = 'completed', completed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    scanId,
  );
}

export function failRulesScan(db: SqliteConnection, scanId: string, errorCode: string): void {
  db.prepare(
    "UPDATE scans SET status = 'failed', completed_at = ?, error_code = ? WHERE id = ?",
  ).run(new Date().toISOString(), errorCode, scanId);
}

export function cancelRulesScan(db: SqliteConnection, scanId: string): void {
  db.prepare("UPDATE scans SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    scanId,
  );
}

/** Per-issue failure isolation (BI-053): one scan_items row tracks each issue's own outcome within a scan, independent of the others. */
export function startScanItem(db: SqliteConnection, scanId: string, issueKey: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO scan_items (id, scan_id, issue_key, status, error_code, started_at, completed_at)
     VALUES (?, ?, ?, 'running', NULL, ?, NULL)`,
  ).run(id, scanId, issueKey, new Date().toISOString());
  return id;
}

export function completeScanItem(db: SqliteConnection, scanItemId: string): void {
  db.prepare("UPDATE scan_items SET status = 'completed', completed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    scanItemId,
  );
}

export function failScanItem(
  db: SqliteConnection,
  scanItemId: string,
  errorCode: string,
): void {
  db.prepare(
    "UPDATE scan_items SET status = 'failed', error_code = ?, completed_at = ? WHERE id = ?",
  ).run(errorCode, new Date().toISOString(), scanItemId);
}

function countScanItemsByStatus(
  db: SqliteConnection,
  scanId: string,
  status: "completed" | "failed",
): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM scan_items WHERE scan_id = ? AND status = ?")
    .get(scanId, status) as { count: number };
  return row.count;
}

function rowToSummary(db: SqliteConnection, row: ScanRow): RulesScanSummary {
  return {
    assessedIssueCount: countScanItemsByStatus(db, row.id, "completed"),
    cancelledAt: row.cancelled_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    failedIssueCount: countScanItemsByStatus(db, row.id, "failed"),
    id: row.id,
    // scans.jira_project_id is nullable (ON DELETE SET NULL) so a scan
    // outlives its project config being removed; callers always query
    // by a live jiraProjectId, so this only matters for that edge case.
    jiraProjectId: row.jira_project_id ?? "",
    startedAt: row.started_at,
    status: row.status as RulesScanStatus,
  };
}

export function getRulesScan(db: SqliteConnection, scanId: string): RulesScanSummary | null {
  const row = db.prepare("SELECT * FROM scans WHERE id = ?").get(scanId) as ScanRow | undefined;
  return row ? rowToSummary(db, row) : null;
}

export function listRulesScansForProject(
  db: SqliteConnection,
  jiraProjectId: string,
  limit = 20,
): RulesScanSummary[] {
  // rowid breaks ties when two scans start within the same
  // millisecond (started_at's resolution) — it's SQLite's own
  // monotonically increasing insertion order for this table, so "newest
  // first" stays correct even then.
  const rows = db
    .prepare(
      `SELECT * FROM scans
       WHERE jira_project_id = ? AND status IN (${RULES_SCAN_STATUS_PLACEHOLDERS})
       ORDER BY started_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(jiraProjectId, ...RULES_SCAN_STATUSES, limit) as ScanRow[];
  return rows.map((row) => rowToSummary(db, row));
}
