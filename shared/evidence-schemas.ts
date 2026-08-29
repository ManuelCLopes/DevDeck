import { z } from "zod";
import { repositoryMappingMatchSchema } from "./backlog-schemas";

/**
 * Zod schemas for the repository-evidence IPC boundary (ADR-0007).
 */

export const repositoryReferenceSchema = z.object({
  githubRepositorySlug: z.string().min(1).nullable(),
  localProjectId: z.string().min(1),
  repositoryPath: z.string().min(1),
});

export const gatherEvidenceRequestSchema = z.object({
  issueKey: z.string().min(1),
  repositories: z.array(repositoryReferenceSchema).min(1),
});

export const saveRepositoryMappingInputSchema = z.object({
  /** Present when updating an existing rule; omitted to create one. */
  id: z.string().min(1).optional(),
  enabled: z.boolean(),
  jiraProjectKey: z.string().min(1),
  localProjectIds: z.array(z.string().min(1)),
  match: repositoryMappingMatchSchema,
  priority: z.number().int(),
});

export const resolveRepositoryMappingRequestSchema = z.object({
  components: z.array(z.string()),
  issueKey: z.string().min(1),
  jiraProjectKey: z.string().min(1),
  labels: z.array(z.string()),
});

export const getEvidenceForIssueRequestSchema = z.object({
  issueKey: z.string().min(1),
  jiraProjectId: z.string().min(1),
});

export const startGatherEvidenceRequestSchema = z.object({
  jiraProjectId: z.string().min(1),
  request: gatherEvidenceRequestSchema,
});
