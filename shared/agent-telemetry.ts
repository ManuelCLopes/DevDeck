import type {
  AgentDefinition,
  AgentRun,
  AgentRunStatus,
  TaskTraceEntry,
  TokenUsageEvent,
  WorkflowDefinition,
} from "./agents";
import type { OpenCodeUsageRecord } from "./opencode-usage";

export const DEFAULT_AGENT_RUN_HISTORY_LIMIT = 2_000;
export const DEFAULT_TASK_TRACE_HISTORY_LIMIT = 10_000;
export const DEFAULT_TOKEN_USAGE_HISTORY_LIMIT = 50_000;

export interface AgentTelemetrySnapshot {
  agentRuns: AgentRun[];
  taskTraceEntries: TaskTraceEntry[];
  tokenUsageEvents: TokenUsageEvent[];
  updatedAt: string | null;
}

export function createAgentRunId() {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTaskTraceEntryId() {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `task-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTokenUsageEventId() {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `token-usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
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

function normalizeStatus(value: unknown): AgentRunStatus {
  return value === "blocked" ||
    value === "completed" ||
    value === "failed" ||
    value === "paused"
    ? value
    : "active";
}

export function normalizeAgentRuns(rawValue: unknown): AgentRun[] {
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
      branchName: normalizeString(value.branchName),
      endedAt: normalizeString(value.endedAt),
      id: normalizeString(value.id) ?? createAgentRunId(),
      opencodeSessionId: normalizeString(value.opencodeSessionId),
      projectId: normalizeString(value.projectId),
      startedAt: normalizeString(value.startedAt) ?? new Date().toISOString(),
      status: normalizeStatus(value.status),
      taskTitle: normalizeString(value.taskTitle) ?? "Agent run",
      terminalPaneId: normalizeString(value.terminalPaneId),
      tokenBudget: normalizeNullableNumber(value.tokenBudget),
      workflowRunId: normalizeString(value.workflowRunId),
      worktreePath: normalizeString(value.worktreePath),
    }));
}

export function sortAgentRuns(runs: AgentRun[]) {
  return [...runs].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

export function mergeAgentRuns(
  currentRuns: unknown,
  incomingRuns: unknown,
  limit = DEFAULT_AGENT_RUN_HISTORY_LIMIT,
) {
  const runsById = new Map<string, AgentRun>();

  for (const run of normalizeAgentRuns(currentRuns)) {
    runsById.set(run.id, run);
  }
  for (const run of normalizeAgentRuns(incomingRuns)) {
    runsById.set(run.id, run);
  }

  return sortAgentRuns(Array.from(runsById.values())).slice(0, limit);
}

export function updateAgentRunStatus(
  runs: AgentRun[],
  runId: string,
  status: AgentRunStatus,
  endedAt = new Date().toISOString(),
) {
  return sortAgentRuns(
    runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            endedAt:
              status === "completed" || status === "failed"
                ? endedAt
                : status === "active"
                  ? null
                  : run.endedAt,
            status,
          }
        : run,
    ),
  );
}

export function summarizeAgentRunsByStatus(runs: AgentRun[]) {
  return runs.reduce(
    (summary, run) => ({
      ...summary,
      [run.status]: summary[run.status] + 1,
    }),
    {
      active: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    } satisfies Record<AgentRunStatus, number>,
  );
}

function normalizePath(value: string | null | undefined) {
  return value?.replace(/\/+$/, "") ?? null;
}

export function findAgentRunForOpenCodeUsage(
  record: OpenCodeUsageRecord,
  agentRuns: AgentRun[],
) {
  const directMatch = agentRuns.find(
    (run) => run.opencodeSessionId === record.sessionId,
  );
  if (directMatch) {
    return directMatch;
  }

  const recordDirectory = normalizePath(record.directory);
  if (!recordDirectory) {
    return null;
  }

  const candidateRuns = agentRuns.filter(
    (run) => normalizePath(run.worktreePath) === recordDirectory,
  );
  if (candidateRuns.length === 0) {
    return null;
  }

  const recordTime = record.updatedAt
    ? new Date(record.updatedAt).getTime()
    : Date.now();
  return (
    candidateRuns
      .filter((run) => new Date(run.startedAt).getTime() <= recordTime)
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      )[0] ??
    candidateRuns.sort(
      (left, right) =>
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
    )[0] ??
    null
  );
}

export function linkAgentRunsToOpenCodeUsageRecords(
  runs: AgentRun[],
  records: OpenCodeUsageRecord[],
) {
  const runsById = new Map(runs.map((run) => [run.id, run]));

  for (const record of records) {
    const matchedRun = findAgentRunForOpenCodeUsage(record, Array.from(runsById.values()));
    if (!matchedRun || matchedRun.opencodeSessionId) {
      continue;
    }

    runsById.set(matchedRun.id, {
      ...matchedRun,
      opencodeSessionId: record.sessionId,
    });
  }

  return sortAgentRuns(Array.from(runsById.values()));
}

export function haveAgentRunLinksChanged(left: AgentRun[], right: AgentRun[]) {
  const rightById = new Map(right.map((run) => [run.id, run]));
  return left.some(
    (run) => run.opencodeSessionId !== rightById.get(run.id)?.opencodeSessionId,
  );
}

export function buildAgentRunEnvironment(options: {
  agent: AgentDefinition | null;
  run: AgentRun;
  workflow: WorkflowDefinition | null;
}) {
  const environment: Record<string, string> = {
    DEVDECK_AGENT_RUN_ID: options.run.id,
    DEVDECK_AGENT_RUN_TITLE: options.run.taskTitle,
  };
  if (options.run.tokenBudget) {
    environment.DEVDECK_AGENT_RUN_TOKEN_BUDGET = String(options.run.tokenBudget);
  }

  if (options.agent) {
    environment.DEVDECK_AGENT_ID = options.agent.id;
    environment.DEVDECK_AGENT_NAME = options.agent.name;
    environment.DEVDECK_AGENT_SOURCE = options.agent.sourcePath;
    const effectiveTokenBudget = options.run.tokenBudget ?? options.agent.tokenBudget;
    if (effectiveTokenBudget) {
      environment.DEVDECK_AGENT_TOKEN_BUDGET = String(effectiveTokenBudget);
    }
  }

  if (options.workflow) {
    environment.DEVDECK_WORKFLOW_ID = options.workflow.id;
    environment.DEVDECK_WORKFLOW_NAME = options.workflow.name;
  }

  return environment;
}

export function buildAgentLaunchSummary(options: {
  agent: AgentDefinition | null;
  agentRunId?: string | null;
  branchName: string;
  projectName: string;
  taskTitle: string;
  tokenBudget?: number | null;
  workflow: WorkflowDefinition | null;
}) {
  return [
    `Task: ${options.taskTitle}`,
    `Project: ${options.projectName}`,
    `Branch: ${options.branchName}`,
    `Agent: ${options.agent?.name ?? "Unassigned"}`,
    `Workflow: ${options.workflow?.name ?? "None"}`,
    options.agentRunId ? `Agent Run ID: ${options.agentRunId}` : null,
    options.agentRunId
      ? `Trace: use DEVDECK_AGENT_RUN_ID=${options.agentRunId} in imported taskTraceEntries JSON.`
      : null,
    options.tokenBudget
      ? `Token Budget: ${options.tokenBudget.toLocaleString()} tokens`
      : null,
    options.agent?.responsibilities.length
      ? `Responsibilities: ${options.agent.responsibilities.slice(0, 4).join("; ")}`
      : null,
    options.agent?.boundaries.length
      ? `Boundaries: ${options.agent.boundaries.slice(0, 3).join("; ")}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
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
  currentEvents: unknown,
  incomingEvents: unknown,
  limit = DEFAULT_TOKEN_USAGE_HISTORY_LIMIT,
) {
  const eventsById = new Map<string, TokenUsageEvent>();

  for (const event of normalizeTokenUsageEvents(currentEvents)) {
    eventsById.set(event.id, event);
  }
  for (const event of normalizeTokenUsageEvents(incomingEvents)) {
    eventsById.set(event.id, event);
  }

  return Array.from(eventsById.values())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, limit);
}

export function normalizeTaskTraceEntries(rawValue: unknown): TaskTraceEntry[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object",
    )
    .map((value) => ({
      agentRunId: normalizeString(value.agentRunId) ?? "unassigned",
      commandsRun: normalizeStringArray(value.commandsRun),
      createdAt: normalizeString(value.createdAt) ?? new Date().toISOString(),
      errors: normalizeStringArray(value.errors),
      filesTouched: normalizeStringArray(value.filesTouched),
      handoffTargetAgentId: normalizeString(value.handoffTargetAgentId),
      id: normalizeString(value.id) ?? createTaskTraceEntryId(),
      nextAction: normalizeString(value.nextAction),
      summary: normalizeString(value.summary) ?? "Trace entry",
      testsRun: normalizeStringArray(value.testsRun),
    }));
}

export function mergeTaskTraceEntries(
  currentEntries: unknown,
  incomingEntries: unknown,
  limit = DEFAULT_TASK_TRACE_HISTORY_LIMIT,
) {
  const entriesById = new Map<string, TaskTraceEntry>();

  for (const entry of normalizeTaskTraceEntries(currentEntries)) {
    entriesById.set(entry.id, entry);
  }
  for (const entry of normalizeTaskTraceEntries(incomingEntries)) {
    entriesById.set(entry.id, entry);
  }

  return Array.from(entriesById.values())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, limit);
}

export function normalizeAgentTelemetrySnapshot(rawValue: unknown): AgentTelemetrySnapshot {
  const record =
    Boolean(rawValue) && typeof rawValue === "object"
      ? (rawValue as Record<string, unknown>)
      : {};

  return {
    agentRuns: mergeAgentRuns([], record.agentRuns),
    taskTraceEntries: mergeTaskTraceEntries([], record.taskTraceEntries),
    tokenUsageEvents: mergeTokenUsageEvents([], record.tokenUsageEvents),
    updatedAt: normalizeString(record.updatedAt),
  };
}
