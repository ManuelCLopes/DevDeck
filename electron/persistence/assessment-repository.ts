import { randomUUID } from "node:crypto";
import type {
  Assessment,
  AssessmentFeedback,
  AssessmentFeedbackDecision,
  ProjectAssessmentSummary,
} from "../../shared/assessment";
import type { BacklogClassification, ConfidenceBand, SuggestedAction } from "../../shared/backlog";
import { RULES_SCAN_STATUSES } from "./rules-scan-repository";
import type { SqliteConnection } from "./sqlite-driver";

const RULES_SCAN_STATUS_PLACEHOLDERS = RULES_SCAN_STATUSES.map(() => "?").join(",");

/**
 * Persists Phase 4 rules-only assessments into the `assessments` /
 * `assessment_feedback` tables from schema v1. Each row is one scan's
 * verdict on one issue — a new row per (re-)scan, never updated in
 * place, so `listAssessmentHistoryForIssue` is a real history rather
 * than the single latest state.
 */

const ALL_CLASSIFICATIONS: BacklogClassification[] = [
  "valid",
  "possibly_implemented",
  "partially_implemented",
  "possibly_obsolete",
  "possible_duplicate",
  "needs_rewrite",
  "insufficient_evidence",
];

interface AssessmentRow {
  classification: string;
  confidence: number;
  confidence_band: string;
  contradictions: string;
  created_at: string;
  engine_version: string;
  evidence_ids: string;
  id: string;
  issue_key: string;
  open_questions: string;
  prompt_version: string | null;
  rationale: string;
  repository_snapshot_ids: string;
  scan_id: string;
  stale: number;
  suggested_action: string;
  suggested_description: string | null;
  suggested_title: string | null;
  summary: string;
}

function rowToAssessment(row: AssessmentRow): Assessment {
  return {
    classification: row.classification as BacklogClassification,
    confidence: row.confidence,
    confidenceBand: row.confidence_band as ConfidenceBand,
    contradictions: JSON.parse(row.contradictions) as string[],
    createdAt: row.created_at,
    engineVersion: row.engine_version,
    evidenceIds: JSON.parse(row.evidence_ids) as string[],
    id: row.id,
    issueKey: row.issue_key,
    openQuestions: JSON.parse(row.open_questions) as string[],
    promptVersion: row.prompt_version,
    rationale: row.rationale,
    repositorySnapshotIds: JSON.parse(row.repository_snapshot_ids) as string[],
    scanId: row.scan_id,
    stale: row.stale === 1,
    suggestedAction: row.suggested_action as SuggestedAction,
    suggestedDescription: row.suggested_description,
    suggestedTitle: row.suggested_title,
    summary: row.summary,
  };
}

export interface InsertAssessmentInput {
  classification: BacklogClassification;
  confidence: number;
  confidenceBand: ConfidenceBand;
  contradictions: string[];
  engineVersion: string;
  evidenceIds: string[];
  issueKey: string;
  openQuestions: string[];
  promptVersion?: string | null;
  rationale: string;
  repositorySnapshotIds: string[];
  scanId: string;
  suggestedAction: SuggestedAction;
  suggestedDescription?: string | null;
  suggestedTitle?: string | null;
  summary: string;
}

export function insertAssessment(db: SqliteConnection, input: InsertAssessmentInput): Assessment {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO assessments (
       id, scan_id, issue_key, classification, confidence, confidence_band, summary, rationale,
       evidence_ids, contradictions, open_questions, suggested_action, suggested_title,
       suggested_description, engine_version, prompt_version, repository_snapshot_ids, stale, created_at
     ) VALUES (
       @id, @scanId, @issueKey, @classification, @confidence, @confidenceBand, @summary, @rationale,
       @evidenceIds, @contradictions, @openQuestions, @suggestedAction, @suggestedTitle,
       @suggestedDescription, @engineVersion, @promptVersion, @repositorySnapshotIds, 0, @createdAt
     )`,
  ).run({
    classification: input.classification,
    confidence: input.confidence,
    confidenceBand: input.confidenceBand,
    contradictions: JSON.stringify(input.contradictions),
    createdAt: now,
    engineVersion: input.engineVersion,
    evidenceIds: JSON.stringify(input.evidenceIds),
    id,
    issueKey: input.issueKey,
    openQuestions: JSON.stringify(input.openQuestions),
    promptVersion: input.promptVersion ?? null,
    rationale: input.rationale,
    repositorySnapshotIds: JSON.stringify(input.repositorySnapshotIds),
    scanId: input.scanId,
    suggestedAction: input.suggestedAction,
    suggestedDescription: input.suggestedDescription ?? null,
    suggestedTitle: input.suggestedTitle ?? null,
    summary: input.summary,
  });

  return {
    classification: input.classification,
    confidence: input.confidence,
    confidenceBand: input.confidenceBand,
    contradictions: input.contradictions,
    createdAt: now,
    engineVersion: input.engineVersion,
    evidenceIds: input.evidenceIds,
    id,
    issueKey: input.issueKey,
    openQuestions: input.openQuestions,
    promptVersion: input.promptVersion ?? null,
    rationale: input.rationale,
    repositorySnapshotIds: input.repositorySnapshotIds,
    scanId: input.scanId,
    stale: false,
    suggestedAction: input.suggestedAction,
    suggestedDescription: input.suggestedDescription ?? null,
    suggestedTitle: input.suggestedTitle ?? null,
    summary: input.summary,
  };
}

// rowid breaks ties when two assessments for the same issue land in the
// same millisecond (created_at's resolution) — SQLite's own
// monotonically increasing insertion order for this table, so "most
// recent" stays correct even then.
const ORDER_BY_MOST_RECENT = "ORDER BY created_at DESC, rowid DESC";

export function getLatestAssessmentForIssue(
  db: SqliteConnection,
  issueKey: string,
): Assessment | null {
  const row = db
    .prepare(`SELECT * FROM assessments WHERE issue_key = ? ${ORDER_BY_MOST_RECENT} LIMIT 1`)
    .get(issueKey) as AssessmentRow | undefined;
  return row ? rowToAssessment(row) : null;
}

export function listAssessmentHistoryForIssue(
  db: SqliteConnection,
  issueKey: string,
  limit = 10,
): Assessment[] {
  const rows = db
    .prepare(`SELECT * FROM assessments WHERE issue_key = ? ${ORDER_BY_MOST_RECENT} LIMIT ?`)
    .all(issueKey, limit) as AssessmentRow[];
  return rows.map(rowToAssessment);
}

/**
 * Classification breakdown across every issue's *most recent*
 * assessment in one Jira project — a re-scanned issue's older
 * assessments don't double-count. The correlated subquery picks each
 * issue's newest assessment row (ties broken by rowid, SQLite's
 * insertion order, so the count is stable even if two assessments in
 * the same project somehow share a timestamp) before grouping.
 */
export function getProjectAssessmentSummary(
  db: SqliteConnection,
  jiraProjectId: string,
): ProjectAssessmentSummary {
  const rows = db
    .prepare(
      `SELECT a.classification AS classification, COUNT(*) AS count
       FROM assessments a
       JOIN scans s ON s.id = a.scan_id
       WHERE s.jira_project_id = ?
         AND a.id = (
           SELECT a2.id
           FROM assessments a2
           JOIN scans s2 ON s2.id = a2.scan_id
           WHERE a2.issue_key = a.issue_key AND s2.jira_project_id = ?
           ORDER BY a2.created_at DESC, a2.rowid DESC
           LIMIT 1
         )
       GROUP BY a.classification`,
    )
    .all(jiraProjectId, jiraProjectId) as Array<{ classification: string; count: number }>;

  const countsByClassification = Object.fromEntries(
    ALL_CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<BacklogClassification, number>;
  for (const row of rows) {
    countsByClassification[row.classification as BacklogClassification] = row.count;
  }

  // scans is shared with Phase 3's evidence gathering, which writes its
  // own synthetic scan there with status "manual_evidence_gather" — not
  // one of the rules-scan lifecycle states. Excluded here the same way
  // listRulesScansForProject (rules-scan-repository.ts) excludes it, so
  // an evidence gather can't be reported as the project's last rules scan.
  const lastScan = db
    .prepare(
      `SELECT started_at FROM scans
       WHERE jira_project_id = ? AND status IN (${RULES_SCAN_STATUS_PLACEHOLDERS})
       ORDER BY started_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get(jiraProjectId, ...RULES_SCAN_STATUSES) as { started_at: string } | undefined;

  return {
    countsByClassification,
    jiraProjectId,
    lastScanAt: lastScan?.started_at ?? null,
  };
}

interface AssessmentFeedbackRow {
  assessment_id: string;
  corrected_classification: string | null;
  created_at: string;
  decision: string;
  id: string;
  note: string | null;
}

function rowToFeedback(row: AssessmentFeedbackRow): AssessmentFeedback {
  return {
    assessmentId: row.assessment_id,
    correctedClassification: row.corrected_classification as BacklogClassification | null,
    createdAt: row.created_at,
    decision: row.decision as AssessmentFeedbackDecision,
    id: row.id,
    note: row.note,
  };
}

export interface InsertAssessmentFeedbackInput {
  assessmentId: string;
  correctedClassification?: BacklogClassification | null;
  decision: AssessmentFeedbackDecision;
  note?: string | null;
}

export function insertAssessmentFeedback(
  db: SqliteConnection,
  input: InsertAssessmentFeedbackInput,
): AssessmentFeedback {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO assessment_feedback (id, assessment_id, decision, corrected_classification, note, created_at)
     VALUES (@id, @assessmentId, @decision, @correctedClassification, @note, @createdAt)`,
  ).run({
    assessmentId: input.assessmentId,
    correctedClassification: input.correctedClassification ?? null,
    createdAt: now,
    decision: input.decision,
    id,
    note: input.note ?? null,
  });

  return {
    assessmentId: input.assessmentId,
    correctedClassification: input.correctedClassification ?? null,
    createdAt: now,
    decision: input.decision,
    id,
    note: input.note ?? null,
  };
}

export function listAssessmentFeedback(
  db: SqliteConnection,
  assessmentId: string,
): AssessmentFeedback[] {
  const rows = db
    .prepare("SELECT * FROM assessment_feedback WHERE assessment_id = ? ORDER BY created_at ASC")
    .all(assessmentId) as AssessmentFeedbackRow[];
  return rows.map(rowToFeedback);
}
