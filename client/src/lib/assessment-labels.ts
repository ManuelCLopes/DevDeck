import type { BacklogClassification, ConfidenceBand, SuggestedAction } from "@shared/backlog";

/** Display labels for Phase 4's rules-only assessment domain — shared by RulesScanCard and BacklogIssueDetail's assessment panel. */
export const CLASSIFICATION_LABELS: Record<BacklogClassification, string> = {
  insufficient_evidence: "Insufficient evidence",
  needs_rewrite: "Needs rewrite",
  partially_implemented: "Partially implemented",
  possible_duplicate: "Possible duplicate",
  possibly_implemented: "Possibly implemented",
  possibly_obsolete: "Possibly obsolete",
  valid: "Valid",
};

export const SUGGESTED_ACTION_LABELS: Record<SuggestedAction, string> = {
  consider_closing: "Consider closing",
  investigate: "Investigate",
  keep: "Keep",
  link_duplicate: "Link duplicate",
  no_action: "No action",
  rewrite: "Rewrite",
  split: "Split",
};

export const CONFIDENCE_BAND_BADGE_VARIANT: Record<
  ConfidenceBand,
  "default" | "outline" | "secondary"
> = {
  high: "default",
  low: "outline",
  medium: "secondary",
};
