import { z } from "zod";
import { backlogClassificationSchema } from "./backlog-schemas";

/**
 * Zod schemas for the Phase 4 rules-engine IPC boundary, mirroring
 * shared/assessment.ts.
 */

export const startRulesScanRequestSchema = z.object({
  jiraProjectId: z.string().min(1),
});

export const getIssueAssessmentRequestSchema = z.object({
  issueKey: z.string().min(1),
});

export const listAssessmentHistoryRequestSchema = z.object({
  issueKey: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
});

export const getProjectAssessmentSummaryRequestSchema = z.object({
  jiraProjectId: z.string().min(1),
});

export const listRulesScansRequestSchema = z.object({
  jiraProjectId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
});

export const submitAssessmentFeedbackRequestSchema = z.object({
  assessmentId: z.string().min(1),
  correctedClassification: backlogClassificationSchema.nullable().optional(),
  decision: z.enum(["accepted", "corrected", "rejected"]),
  note: z.string().max(2000).nullable().optional(),
});
