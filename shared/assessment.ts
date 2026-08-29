import type { BacklogClassification, ConfidenceBand, SuggestedAction } from "./backlog";

/**
 * Rules-only assessment domain types (Phase 4 — "Rules-only Backlog
 * Health Scan", docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section
 * "Phase 4", docs/ENGINEERING_BRAIN_RFC.md section 21).
 *
 * Everything here is deterministic: no model call is involved anywhere
 * in electron/rules-engine/. An AssessmentSignal is one rule's opinion;
 * an Assessment is the aggregated, persisted result of combining every
 * signal that fired for one issue in one scan.
 */

/**
 * One rule's opinion, matching the shape documented in the RFC's rules
 * engine section verbatim. `evidenceIds` cite `evidence.id` rows
 * (shared/evidence.ts) wherever a signal is grounded in gathered
 * evidence; a signal derived from Jira's own sync/link state instead
 * (e.g. "this issue fell out of the configured JQL filter") leaves it
 * empty and explains itself in `explanation` instead — see
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md's Phase 4 status note
 * for why that's an intentional v1 simplification, not a bug.
 */
export interface AssessmentSignal {
  category: string;
  classification: BacklogClassification;
  evidenceIds: string[];
  explanation: string;
  id: string;
  score: number;
  weight: number;
}

/**
 * The persisted, normalised shape — matches the `assessments` table
 * from electron/persistence/migrations/0001-init.ts (schema v1, built in
 * Phase 1 in anticipation of this exact phase).
 */
export interface Assessment {
  classification: BacklogClassification;
  confidence: number;
  confidenceBand: ConfidenceBand;
  contradictions: string[];
  createdAt: string;
  engineVersion: string;
  evidenceIds: string[];
  id: string;
  issueKey: string;
  openQuestions: string[];
  promptVersion: string | null;
  rationale: string;
  repositorySnapshotIds: string[];
  scanId: string;
  /** True once repository evidence has moved on past this assessment's cited snapshots — Phase 8 (continuous intelligence) is what actually recomputes it; Phase 4 always writes false. */
  stale: boolean;
  suggestedAction: SuggestedAction;
  suggestedDescription: string | null;
  suggestedTitle: string | null;
  summary: string;
}

export type AssessmentFeedbackDecision = "accepted" | "corrected" | "rejected";

/** Matches the `assessment_feedback` table (schema v1). */
export interface AssessmentFeedback {
  assessmentId: string;
  correctedClassification: BacklogClassification | null;
  createdAt: string;
  decision: AssessmentFeedbackDecision;
  id: string;
  note: string | null;
}

export type RulesScanStatus = "cancelled" | "completed" | "failed" | "running";

export interface RulesScanSummary {
  assessedIssueCount: number;
  cancelledAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  failedIssueCount: number;
  id: string;
  jiraProjectId: string;
  startedAt: string;
  status: RulesScanStatus;
}

/** Classification breakdown across every issue's most recent assessment in one Jira project — the Backlog page's per-project scan summary. */
export interface ProjectAssessmentSummary {
  countsByClassification: Record<BacklogClassification, number>;
  jiraProjectId: string;
  lastScanAt: string | null;
}
