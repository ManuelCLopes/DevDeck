import { z } from "zod";

/**
 * Zod schemas mirroring shared/jira.ts, validating anything crossing the
 * preload boundary (ADR-0007). The renderer never gets an
 * apiToken/credentials object back — only jiraConnectionCredentialsSchema
 * (write direction) is used, never a matching read schema.
 */

export const jiraConnectionCredentialsSchema = z.object({
  accountEmail: z.string().email(),
  apiToken: z.string().min(1),
  baseUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), {
      message: "Jira base URL must use https://",
    }),
});

export const jiraProjectConfigInputSchema = z.object({
  connectionId: z.string().min(1),
  jql: z.string().min(1).nullable(),
  name: z.string().min(1),
  projectKey: z.string().min(1),
});

export const jiraSyncModeSchema = z.enum(["full", "incremental"]);

export const startJiraSyncRequestSchema = z.object({
  mode: jiraSyncModeSchema,
  projectConfigId: z.string().min(1),
});

export const jqlPreviewRequestSchema = z.object({
  connectionId: z.string().min(1),
  jql: z.string().min(1),
});

export const listLocalIssuesRequestSchema = z.object({
  limit: z.number().int().positive().max(500).default(100),
  offset: z.number().int().nonnegative().default(0),
  projectConfigId: z.string().min(1),
});
