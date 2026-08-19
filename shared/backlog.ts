/**
 * Backlog Intelligence domain types.
 *
 * Phase 1 (Domain foundation) only needs enough of the shape from
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md (sections 6-8) to give the
 * persistence layer and the Backlog route shell a canonical, typed empty
 * state. Jira sync, evidence collection, rules, and model assessment are
 * later phases and are not implemented here.
 */

export type BacklogClassification =
  | "valid"
  | "possibly_implemented"
  | "partially_implemented"
  | "possibly_obsolete"
  | "possible_duplicate"
  | "needs_rewrite"
  | "insufficient_evidence";

export type SuggestedAction =
  | "keep"
  | "investigate"
  | "rewrite"
  | "link_duplicate"
  | "consider_closing"
  | "split"
  | "no_action";

export type EvidenceKind =
  | "jira_field"
  | "jira_comment"
  | "jira_history"
  | "jira_link"
  | "git_commit"
  | "github_pull_request"
  | "code_file"
  | "code_symbol"
  | "test"
  | "migration"
  | "configuration"
  | "documentation"
  | "component_removed"
  | "repository_activity";

export type ConfidenceBand = "low" | "medium" | "high";

export function toConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.85) {
    return "high";
  }
  if (confidence >= 0.65) {
    return "medium";
  }
  return "low";
}

export type RepositoryMappingMatch =
  | { type: "project_default" }
  | { type: "component"; value: string }
  | { type: "label"; value: string }
  | { type: "issue"; value: string };

export interface RepositoryMappingRule {
  enabled: boolean;
  id: string;
  jiraProjectKey: string;
  localProjectIds: string[];
  match: RepositoryMappingMatch;
  priority: number;
}

/**
 * Top-level summary shown by the Backlog route shell and by diagnostics.
 * Every count is zero until Jira sync (M2) and evidence collection (M3)
 * exist — Phase 1 only needs the shape and an empty, honest state.
 */
export interface BacklogSummary {
  connectedJiraProjectCount: number;
  lastScanAt: string | null;
  mappedRepositoryCount: number;
  pendingReviewIssueCount: number;
  syncedIssueCount: number;
}

export const EMPTY_BACKLOG_SUMMARY: BacklogSummary = {
  connectedJiraProjectCount: 0,
  lastScanAt: null,
  mappedRepositoryCount: 0,
  pendingReviewIssueCount: 0,
  syncedIssueCount: 0,
};

/**
 * Health snapshot for the Backlog Intelligence SQLite store, surfaced in
 * Settings diagnostics (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md
 * section 4.6: "Built-in observability").
 */
export interface BacklogDiagnosticsSummary {
  appliedMigrations: string[];
  databasePath: string;
  error: string | null;
  ready: boolean;
  schemaVersion: number;
}
