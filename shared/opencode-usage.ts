export interface OpenCodeUsageRecord {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  createdAt: string | null;
  directory: string | null;
  inputTokens: number;
  model: string | null;
  opencodeAgent: string | null;
  outputTokens: number;
  projectId: string | null;
  provider: string | null;
  reasoningTokens: number;
  sessionId: string;
  title: string | null;
  totalTokens: number;
  updatedAt: string | null;
}
