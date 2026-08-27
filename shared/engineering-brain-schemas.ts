import { z } from "zod";

/**
 * Zod schemas mirroring shared/engineering-brain.ts, used to validate
 * requests crossing the preload boundary before the operation service
 * ever sees them.
 */

export const engineeringBrainSourceTypeSchema = z.enum([
  "agent_trace",
  "code",
  "documentation",
  "git",
  "github",
  "jira",
]);

export const engineeringBrainOperationStatusSchema = z.enum([
  "cancelled",
  "completed",
  "failed",
  "pending",
  "running",
]);

export const evidenceStrengthSchema = z.enum(["high", "low", "medium"]);

export const engineeringBrainPolicySchema = z.object({
  allowedProjectIds: z.array(z.string().min(1)),
  allowExternalModelRequests: z.boolean(),
  maxConcurrentOperations: z.number().int().positive(),
  maxContextCharacters: z.number().int().positive(),
  maxEstimatedCost: z.number().nonnegative().nullable(),
  maxEvidenceItems: z.number().int().positive(),
  modelProviderId: z.string().min(1).nullable(),
  rulesOnly: z.boolean(),
});

/**
 * `kind` is intentionally an open string, not an enum: Phase 1 ships no
 * concrete operation kinds yet, and each future skill (starting with
 * Backlog Intelligence in M4) will register its own. `input` stays as an
 * unvalidated record here — the operation handler for a given `kind` is
 * responsible for validating its own input shape.
 */
export const startEngineeringBrainOperationRequestSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  kind: z.string().min(1),
  policy: engineeringBrainPolicySchema,
});

export const engineeringBrainOperationSchema = z.object({
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  errorCode: z.string().nullable(),
  id: z.string().min(1),
  kind: z.string().min(1),
  progress: z.number().min(0).max(1),
  status: engineeringBrainOperationStatusSchema,
  updatedAt: z.string(),
});
