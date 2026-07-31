import type { AgentRun, TokenUsageEvent } from "@shared/agents";
import type { OpenCodeUsageRecord } from "@shared/opencode-usage";
import { findAgentRunForOpenCodeUsage } from "@/lib/agent-runs";

export const TOKEN_USAGE_EVENTS_STORAGE_KEY = "devdeck:token-usage-events";

export interface TokenUsageSummary {
  agentId: string | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  eventCount: number;
  inputTokens: number;
  lastUsedAt: string | null;
  outputTokens: number;
  reasoningTokens: number;
  toolCallTokens: number;
  totalTokens: number;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function createTokenUsageEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `token-usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getTokenUsageTotal(event: TokenUsageEvent) {
  return (
    event.inputTokens +
    event.outputTokens +
    event.reasoningTokens +
    event.cacheReadTokens +
    event.cacheWriteTokens +
    event.toolCallTokens
  );
}

export function normalizeTokenUsageEvents(rawValue: unknown): TokenUsageEvent[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object",
    )
    .map((value) => ({
      agentId: normalizeString(value.agentId),
      agentRunId: normalizeString(value.agentRunId),
      cacheReadTokens: normalizeNumber(value.cacheReadTokens),
      cacheWriteTokens: normalizeNumber(value.cacheWriteTokens),
      createdAt: normalizeString(value.createdAt) ?? new Date().toISOString(),
      estimatedCost: normalizeNullableNumber(value.estimatedCost),
      id: normalizeString(value.id) ?? createTokenUsageEventId(),
      inputTokens: normalizeNumber(value.inputTokens),
      model: normalizeString(value.model),
      outputTokens: normalizeNumber(value.outputTokens),
      projectId: normalizeString(value.projectId),
      provider: normalizeString(value.provider),
      reasoningTokens: normalizeNumber(value.reasoningTokens),
      toolCallTokens: normalizeNumber(value.toolCallTokens),
      workflowRunId: normalizeString(value.workflowRunId),
    }));
}

function createEmptySummary(agentId: string | null): TokenUsageSummary {
  return {
    agentId,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    eventCount: 0,
    inputTokens: 0,
    lastUsedAt: null,
    outputTokens: 0,
    reasoningTokens: 0,
    toolCallTokens: 0,
    totalTokens: 0,
  };
}

export function summarizeTokenUsageByAgent(events: TokenUsageEvent[]) {
  const summaries = new Map<string, TokenUsageSummary>();

  for (const event of events) {
    const key = event.agentId ?? "unassigned";
    const summary = summaries.get(key) ?? createEmptySummary(event.agentId);

    summary.cacheReadTokens += event.cacheReadTokens;
    summary.cacheWriteTokens += event.cacheWriteTokens;
    summary.estimatedCost += event.estimatedCost ?? 0;
    summary.eventCount += 1;
    summary.inputTokens += event.inputTokens;
    summary.outputTokens += event.outputTokens;
    summary.reasoningTokens += event.reasoningTokens;
    summary.toolCallTokens += event.toolCallTokens;
    summary.totalTokens += getTokenUsageTotal(event);
    if (
      !summary.lastUsedAt ||
      new Date(event.createdAt).getTime() > new Date(summary.lastUsedAt).getTime()
    ) {
      summary.lastUsedAt = event.createdAt;
    }

    summaries.set(key, summary);
  }

  return Array.from(summaries.values()).sort(
    (left, right) => right.totalTokens - left.totalTokens,
  );
}

export function getTokenUsageSummaryTotal(summaries: TokenUsageSummary[]) {
  return summaries.reduce(
    (total, summary) => ({
      cacheReadTokens: total.cacheReadTokens + summary.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + summary.cacheWriteTokens,
      estimatedCost: total.estimatedCost + summary.estimatedCost,
      eventCount: total.eventCount + summary.eventCount,
      inputTokens: total.inputTokens + summary.inputTokens,
      outputTokens: total.outputTokens + summary.outputTokens,
      reasoningTokens: total.reasoningTokens + summary.reasoningTokens,
      toolCallTokens: total.toolCallTokens + summary.toolCallTokens,
      totalTokens: total.totalTokens + summary.totalTokens,
    }),
    {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      eventCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      toolCallTokens: 0,
      totalTokens: 0,
    },
  );
}

export function buildTokenUsageEventsFromOpenCodeRecords(
  records: OpenCodeUsageRecord[],
  agentRuns: AgentRun[],
) {
  return records.map((record) => {
    const matchingRun = findAgentRunForOpenCodeUsage(record, agentRuns);
    return {
      agentId: matchingRun?.agentId ?? null,
      agentRunId: matchingRun?.id ?? null,
      cacheReadTokens: record.cacheReadTokens,
      cacheWriteTokens: record.cacheWriteTokens,
      createdAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString(),
      estimatedCost: record.cost,
      id: `opencode:${record.sessionId}`,
      inputTokens: record.inputTokens,
      model: record.model,
      outputTokens: record.outputTokens,
      projectId: matchingRun?.projectId ?? null,
      provider: record.provider,
      reasoningTokens: record.reasoningTokens,
      toolCallTokens: 0,
      workflowRunId: matchingRun?.workflowRunId ?? null,
    } satisfies TokenUsageEvent;
  });
}

export function mergeTokenUsageEvents(
  currentEvents: TokenUsageEvent[],
  incomingEvents: TokenUsageEvent[],
) {
  const eventsById = new Map<string, TokenUsageEvent>();

  for (const event of normalizeTokenUsageEvents(currentEvents)) {
    eventsById.set(event.id, event);
  }
  for (const event of normalizeTokenUsageEvents(incomingEvents)) {
    eventsById.set(event.id, event);
  }

  return Array.from(eventsById.values()).sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
