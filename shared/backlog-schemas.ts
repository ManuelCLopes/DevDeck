import { z } from "zod";

/**
 * Zod schemas mirroring shared/backlog.ts.
 *
 * These validate anything crossing the preload boundary. Electron must
 * treat renderer-supplied payloads as untrusted input even though the
 * renderer is DevDeck's own UI — see ADR-0007 (typed, narrow IPC).
 */

export const backlogClassificationSchema = z.enum([
  "valid",
  "possibly_implemented",
  "partially_implemented",
  "possibly_obsolete",
  "possible_duplicate",
  "needs_rewrite",
  "insufficient_evidence",
]);

export const suggestedActionSchema = z.enum([
  "keep",
  "investigate",
  "rewrite",
  "link_duplicate",
  "consider_closing",
  "split",
  "no_action",
]);

export const evidenceKindSchema = z.enum([
  "jira_field",
  "jira_comment",
  "jira_history",
  "jira_link",
  "git_commit",
  "github_pull_request",
  "code_file",
  "code_symbol",
  "test",
  "migration",
  "configuration",
  "documentation",
  "component_removed",
  "repository_activity",
]);

export const confidenceBandSchema = z.enum(["low", "medium", "high"]);

export const repositoryMappingMatchSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project_default") }),
  z.object({ type: z.literal("component"), value: z.string().min(1) }),
  z.object({ type: z.literal("label"), value: z.string().min(1) }),
  z.object({ type: z.literal("issue"), value: z.string().min(1) }),
]);

export const repositoryMappingRuleSchema = z.object({
  enabled: z.boolean(),
  id: z.string().min(1),
  jiraProjectKey: z.string().min(1),
  localProjectIds: z.array(z.string().min(1)),
  match: repositoryMappingMatchSchema,
  priority: z.number().int(),
});

export const backlogSummarySchema = z.object({
  connectedJiraProjectCount: z.number().int().nonnegative(),
  lastScanAt: z.string().nullable(),
  mappedRepositoryCount: z.number().int().nonnegative(),
  pendingReviewIssueCount: z.number().int().nonnegative(),
  syncedIssueCount: z.number().int().nonnegative(),
});

export const backlogFeatureFlagsSchema = z.object({
  backlogIntelligenceEnabled: z.boolean(),
  jiraSyncEnabled: z.boolean(),
  repositoryIndexEnabled: z.boolean(),
  rulesAssessmentEnabled: z.boolean(),
  modelAssessmentEnabled: z.boolean(),
  backgroundSyncEnabled: z.boolean(),
  jiraWriteBackEnabled: z.boolean(),
  semanticIndexEnabled: z.boolean(),
});
