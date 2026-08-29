import { randomUUID } from "node:crypto";
import type { EvidenceItem } from "../../shared/evidence";
import type { SqliteConnection } from "./sqlite-driver";

/**
 * Persists evidence gathered on demand (Phase 3) by reusing the
 * `scans` / `scan_items` / `evidence` tables from schema v1 rather than
 * introducing a parallel storage shape. Phase 4's real scan
 * orchestration will populate the exact same tables with rules-derived
 * assessments layered on top — this is deliberately not a separate
 * schema to migrate away from later.
 *
 * One synthetic "manual_evidence_gather" scan is reused per Jira
 * project config (evidence gathering here isn't a bounded, versioned
 * scan run the way Phase 4's will be), and each issue gets one
 * scan_item whose evidence is replaced wholesale on every re-gather —
 * the same replace-on-write pattern as jira_comments/jira_issue_links.
 */

const MANUAL_SCAN_STATUS = "manual_evidence_gather";
export const EVIDENCE_COLLECTOR_VERSION = "1";

export function getOrCreateManualScan(db: SqliteConnection, jiraProjectId: string): string {
  const existing = db
    .prepare(
      "SELECT id FROM scans WHERE jira_project_id = ? AND status = ? LIMIT 1",
    )
    .get(jiraProjectId, MANUAL_SCAN_STATUS) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scans (id, jira_project_id, status, engine_version, started_at, completed_at)
     VALUES (@id, @jiraProjectId, @status, @engineVersion, @now, @now)`,
  ).run({
    engineVersion: EVIDENCE_COLLECTOR_VERSION,
    id,
    jiraProjectId,
    now,
    status: MANUAL_SCAN_STATUS,
  });
  return id;
}

function getOrCreateScanItem(db: SqliteConnection, scanId: string, issueKey: string): string {
  const existing = db
    .prepare("SELECT id FROM scan_items WHERE scan_id = ? AND issue_key = ?")
    .get(scanId, issueKey) as { id: string } | undefined;

  const now = new Date().toISOString();
  if (existing) {
    db.prepare("UPDATE scan_items SET status = 'completed', completed_at = ? WHERE id = ?").run(
      now,
      existing.id,
    );
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO scan_items (id, scan_id, issue_key, status, started_at, completed_at)
     VALUES (?, ?, ?, 'completed', ?, ?)`,
  ).run(id, scanId, issueKey, now, now);
  return id;
}

interface EvidenceRow {
  collected_at: string;
  collector_version: string;
  excerpt: string | null;
  file_path: string | null;
  id: string;
  kind: string;
  metadata: string;
  query: string | null;
  repository_snapshot_id: string | null;
  source_id: string | null;
  source_url: string | null;
  strength: string;
  symbol: string | null;
  title: string | null;
}

function rowToEvidenceItem(row: EvidenceRow): EvidenceItem {
  return {
    collectedAt: row.collected_at,
    collectorVersion: row.collector_version,
    excerpt: row.excerpt,
    filePath: row.file_path,
    id: row.id,
    kind: row.kind as EvidenceItem["kind"],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    query: row.query,
    repositorySnapshotId: row.repository_snapshot_id,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    strength: row.strength as EvidenceItem["strength"],
    symbol: row.symbol,
    title: row.title,
  };
}

/**
 * Replaces every evidence row for one issue (within the manual scan for
 * `jiraProjectId`) with `evidenceItems`, in one transaction. Safe to
 * call repeatedly for the same issue — a re-gather fully supersedes the
 * previous result rather than accumulating duplicates.
 */
export function replaceEvidenceForIssue(
  db: SqliteConnection,
  jiraProjectId: string,
  issueKey: string,
  evidenceItems: EvidenceItem[],
): void {
  const scanId = getOrCreateManualScan(db, jiraProjectId);
  const scanItemId = getOrCreateScanItem(db, scanId, issueKey);

  const deleteExisting = db.prepare("DELETE FROM evidence WHERE scan_item_id = ?");
  const insertEvidence = db.prepare(
    `INSERT INTO evidence (
       id, scan_item_id, kind, source_id, source_url, repository_snapshot_id,
       file_path, symbol, title, excerpt, strength, query, collected_at, collector_version, metadata
     ) VALUES (
       @id, @scanItemId, @kind, @sourceId, @sourceUrl, @repositorySnapshotId,
       @filePath, @symbol, @title, @excerpt, @strength, @query, @collectedAt, @collectorVersion, @metadata
     )`,
  );

  const applyReplace = db.transaction(() => {
    deleteExisting.run(scanItemId);
    for (const item of evidenceItems) {
      insertEvidence.run({
        collectedAt: item.collectedAt,
        collectorVersion: item.collectorVersion,
        excerpt: item.excerpt,
        filePath: item.filePath,
        id: item.id,
        kind: item.kind,
        metadata: JSON.stringify(item.metadata),
        query: item.query,
        repositorySnapshotId: item.repositorySnapshotId,
        scanItemId,
        sourceId: item.sourceId,
        sourceUrl: item.sourceUrl,
        strength: item.strength,
        symbol: item.symbol,
        title: item.title,
      });
    }
  });
  applyReplace();
}

export function getEvidenceForIssue(
  db: SqliteConnection,
  jiraProjectId: string,
  issueKey: string,
): EvidenceItem[] {
  const scanItem = db
    .prepare(
      `SELECT scan_items.id AS id
       FROM scan_items
       JOIN scans ON scans.id = scan_items.scan_id
       WHERE scans.jira_project_id = ? AND scans.status = ? AND scan_items.issue_key = ?`,
    )
    .get(jiraProjectId, MANUAL_SCAN_STATUS, issueKey) as { id: string } | undefined;
  if (!scanItem) {
    return [];
  }

  // "strength DESC" alone would sort alphabetically (high, low, medium) —
  // rank explicitly so high-strength evidence actually comes first.
  const rows = db
    .prepare(
      `SELECT * FROM evidence
       WHERE scan_item_id = ?
       ORDER BY CASE strength WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, collected_at DESC`,
    )
    .all(scanItem.id) as EvidenceRow[];
  return rows.map(rowToEvidenceItem);
}
