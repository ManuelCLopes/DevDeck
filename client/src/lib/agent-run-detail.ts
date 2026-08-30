import type { AgentRun, TokenUsageEvent } from "@shared/agents";
import { getTokenUsageTotal, normalizeTokenUsageEvents } from "@/lib/token-usage";

export interface AgentRunUsageSummary {
  cacheTokens: number;
  estimatedCost: number;
  eventCount: number;
  inputTokens: number;
  lastUsedAt: string | null;
  modelLabels: string[];
  outputTokens: number;
  reasoningTokens: number;
  toolCallTokens: number;
  totalTokens: number;
}

function createEmptyRunUsageSummary(): AgentRunUsageSummary {
  return {
    cacheTokens: 0,
    estimatedCost: 0,
    eventCount: 0,
    inputTokens: 0,
    lastUsedAt: null,
    modelLabels: [],
    outputTokens: 0,
    reasoningTokens: 0,
    toolCallTokens: 0,
    totalTokens: 0,
  };
}

export function summarizeTokenUsageForAgentRun(
  events: TokenUsageEvent[],
  run: AgentRun,
): AgentRunUsageSummary {
  const matchingEvents = normalizeTokenUsageEvents(events).filter((event) => {
    if (event.agentRunId === run.id) {
      return true;
    }

    return Boolean(run.opencodeSessionId && event.id === `opencode:${run.opencodeSessionId}`);
  });
  const summary = createEmptyRunUsageSummary();
  const modelLabels = new Set<string>();

  for (const event of matchingEvents) {
    summary.cacheTokens += event.cacheReadTokens + event.cacheWriteTokens;
    summary.estimatedCost += event.estimatedCost ?? 0;
    summary.eventCount += 1;
    summary.inputTokens += event.inputTokens;
    summary.outputTokens += event.outputTokens;
    summary.reasoningTokens += event.reasoningTokens;
    summary.toolCallTokens += event.toolCallTokens;
    summary.totalTokens += getTokenUsageTotal(event);
    if (event.model || event.provider) {
      modelLabels.add([event.provider, event.model].filter(Boolean).join(" / "));
    }
    if (
      !summary.lastUsedAt ||
      new Date(event.createdAt).getTime() > new Date(summary.lastUsedAt).getTime()
    ) {
      summary.lastUsedAt = event.createdAt;
    }
  }

  summary.modelLabels = Array.from(modelLabels).sort();
  return summary;
}
