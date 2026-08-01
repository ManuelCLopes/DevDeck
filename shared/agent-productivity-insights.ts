import type {
  AgentDefinition,
  AgentHarnessSource,
  AgentRun,
  AgentRunStatus,
  TaskTraceEntry,
  TokenUsageEvent,
  WorkflowDefinition,
} from "./agents";
import {
  getTokenUsageTotal,
  normalizeAgentRuns,
  normalizeTaskTraceEntries,
  normalizeTokenUsageEvents,
} from "./agent-telemetry";

export interface TokenUsageRollup {
  cacheTokens: number;
  estimatedCost: number;
  eventCount: number;
  inputTokens: number;
  lastUsedAt: string | null;
  outputTokens: number;
  reasoningTokens: number;
  toolCallTokens: number;
  totalTokens: number;
}

export interface AgentProductivityTotals extends TokenUsageRollup {
  activeRunCount: number;
  averageDurationMs: number | null;
  averageTokensPerRun: number;
  blockedRunCount: number;
  budgetWarningCount: number;
  completedRunCount: number;
  completionRate: number;
  failedRunCount: number;
  failureRate: number;
  linkedOpenCodeRunCount: number;
  overBudgetRunCount: number;
  pausedRunCount: number;
  pausedOrBlockedRate: number;
  runCount: number;
  runsWithUsageCount: number;
  unlinkedOpenCodeRunCount: number;
  usageCoverageRate: number;
}

export interface AgentProductivityRunInsight extends TokenUsageRollup {
  agentId: string | null;
  agentName: string;
  budgetPercent: number | null;
  durationMs: number | null;
  projectId: string | null;
  projectName: string;
  run: AgentRun;
  workflowId: string | null;
  workflowName: string;
}

export interface AgentProductivityAgentSummary extends TokenUsageRollup {
  activeRunCount: number;
  agentId: string | null;
  agentName: string;
  averageDurationMs: number | null;
  blockedRunCount: number;
  budgetWarningCount: number;
  completedRunCount: number;
  completionRate: number;
  failedRunCount: number;
  lastRunAt: string | null;
  overBudgetRunCount: number;
  pausedRunCount: number;
  projectName: string;
  runCount: number;
}

export interface AgentProductivityWorkflowSummary extends TokenUsageRollup {
  averageDurationMs: number | null;
  averageTokensPerRun: number;
  firstAgentIds: string[];
  lastAgentIds: string[];
  metadataIssues: string[];
  projectName: string;
  runCount: number;
  runsWithUsageCount: number;
  workflowId: string | null;
  workflowName: string;
}

export interface AgentProductivityProjectSummary extends TokenUsageRollup {
  projectId: string | null;
  projectName: string;
  runCount: number;
}

export interface AgentProductivityModelSummary extends TokenUsageRollup {
  label: string;
  model: string | null;
  provider: string | null;
}

export interface AgentHandoffRoleSummary {
  agentId: string;
  agentName: string;
  firstRunCount: number;
  firstWorkflowCount: number;
  lastRunCount: number;
  lastWorkflowCount: number;
}

export interface AgentTelemetryGap {
  agentId: string | null;
  agentName: string;
  createdAt: string;
  issueLabels: string[];
  projectName: string;
  runId: string | null;
  taskTitle: string;
  workflowName: string;
}

export interface AgentReworkSignal {
  agentId: string | null;
  agentName: string;
  failedTraceCount: number;
  latestTraceAt: string | null;
  repeatedFileCount: number;
  repeatedTestCount: number;
  runId: string;
  taskTitle: string;
  traceCount: number;
}

export interface AgentProductivityTrendPoint {
  averageDurationMs: number | null;
  completedRunCount: number;
  day: string;
  estimatedCost: number;
  failedRunCount: number;
  failedTraceCount: number;
  label: string;
  reworkRate: number;
  reworkRunCount: number;
  runCount: number;
  totalTokens: number;
  traceCount: number;
}

export interface AgentThroughputTrendPoint {
  completedRunCount: number;
  day: string;
  failedRunCount: number;
  label: string;
  runCount: number;
}

export interface AgentThroughputTrend {
  agentId: string | null;
  agentName: string;
  averageRunsPerActiveDay: number;
  completedRunCount: number;
  completionRate: number;
  points: AgentThroughputTrendPoint[];
  runCount: number;
}

export interface WorkflowCostTrendPoint {
  day: string;
  estimatedCost: number;
  label: string;
  runCount: number;
  totalTokens: number;
}

export interface WorkflowCostTrend {
  averageTokensPerRun: number;
  estimatedCost: number;
  points: WorkflowCostTrendPoint[];
  runCount: number;
  totalTokens: number;
  workflowId: string | null;
  workflowName: string;
}

export interface AgentHandoffLatencySample {
  fromAgentId: string | null;
  fromAgentName: string;
  handoffAt: string;
  latencyMs: number;
  sourceRunId: string;
  startedAt: string;
  targetRunId: string;
  taskTitle: string;
  toAgentId: string;
  toAgentName: string;
  workflowId: string | null;
  workflowName: string;
}

export interface AgentHandoffLatencySummary {
  averageLatencyMs: number | null;
  maxLatencyMs: number | null;
  sampleCount: number;
  slowestSamples: AgentHandoffLatencySample[];
}

export interface AgentProductivityInsights {
  agentThroughputTrends: AgentThroughputTrend[];
  agentSummaries: AgentProductivityAgentSummary[];
  budgetWarnings: AgentProductivityRunInsight[];
  expensiveRuns: AgentProductivityRunInsight[];
  handoffLatency: AgentHandoffLatencySummary;
  handoffRoles: AgentHandoffRoleSummary[];
  modelSummaries: AgentProductivityModelSummary[];
  productivityTrendPoints: AgentProductivityTrendPoint[];
  projectSummaries: AgentProductivityProjectSummary[];
  reworkSignals: AgentReworkSignal[];
  runInsights: AgentProductivityRunInsight[];
  telemetryGaps: AgentTelemetryGap[];
  totals: AgentProductivityTotals;
  workflowCostTrends: WorkflowCostTrend[];
  workflowSummaries: AgentProductivityWorkflowSummary[];
}

export interface AgentTelemetryExportPayload {
  exportedAt: string;
  harness: {
    agents: AgentDefinition[];
    sources: AgentHarnessSource[];
    workflows: WorkflowDefinition[];
  };
  insights: AgentProductivityInsights;
  schemaVersion: 1;
  telemetry: {
    agentRuns: AgentRun[];
    storeUpdatedAt: string | null;
    taskTraceEntries: TaskTraceEntry[];
    tokenUsageEvents: TokenUsageEvent[];
  };
}

interface AgentProductivityInput {
  agents: AgentDefinition[];
  agentRuns: AgentRun[];
  now?: Date | string;
  sources?: AgentHarnessSource[];
  storeUpdatedAt?: string | null;
  taskTraceEntries?: TaskTraceEntry[];
  tokenUsageEvents: TokenUsageEvent[];
  workflows: WorkflowDefinition[];
}

const STATUS_ORDER: AgentRunStatus[] = [
  "active",
  "blocked",
  "completed",
  "failed",
  "paused",
];
const DAY_MS = 24 * 60 * 60 * 1_000;
const PRODUCTIVITY_TREND_DAY_COUNT = 14;

function createEmptyUsageRollup(): TokenUsageRollup {
  return {
    cacheTokens: 0,
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

function addEventToRollup(rollup: TokenUsageRollup, event: TokenUsageEvent) {
  rollup.cacheTokens += event.cacheReadTokens + event.cacheWriteTokens;
  rollup.estimatedCost += event.estimatedCost ?? 0;
  rollup.eventCount += 1;
  rollup.inputTokens += event.inputTokens;
  rollup.outputTokens += event.outputTokens;
  rollup.reasoningTokens += event.reasoningTokens;
  rollup.toolCallTokens += event.toolCallTokens;
  rollup.totalTokens += getTokenUsageTotal(event);
  if (
    !rollup.lastUsedAt ||
    getTime(event.createdAt) > getTime(rollup.lastUsedAt)
  ) {
    rollup.lastUsedAt = event.createdAt;
  }
}

function addUsageRollup(target: TokenUsageRollup, incoming: TokenUsageRollup) {
  target.cacheTokens += incoming.cacheTokens;
  target.estimatedCost += incoming.estimatedCost;
  target.eventCount += incoming.eventCount;
  target.inputTokens += incoming.inputTokens;
  target.outputTokens += incoming.outputTokens;
  target.reasoningTokens += incoming.reasoningTokens;
  target.toolCallTokens += incoming.toolCallTokens;
  target.totalTokens += incoming.totalTokens;
  if (
    incoming.lastUsedAt &&
    (!target.lastUsedAt || getTime(incoming.lastUsedAt) > getTime(target.lastUsedAt))
  ) {
    target.lastUsedAt = incoming.lastUsedAt;
  }
}

function getTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getRate(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((part / total) * 100);
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function countRepeatedValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function getUtcDayStartMs(time: number) {
  const date = new Date(time);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

function getDayKeyFromMs(time: number) {
  return new Date(getUtcDayStartMs(time)).toISOString().slice(0, 10);
}

function getDayKey(value: string | null | undefined) {
  const time = getTime(value);
  return time > 0 ? getDayKeyFromMs(time) : null;
}

function getDayLabel(day: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}

function getObservedTime(values: Array<string | null | undefined>) {
  return values.map(getTime).filter((time) => time > 0);
}

function buildTrendDays(options: {
  agentRuns: AgentRun[];
  nowMs: number;
  taskTraceEntries: TaskTraceEntry[];
  tokenUsageEvents: TokenUsageEvent[];
}) {
  const observedTimes = [
    ...getObservedTime(
      options.agentRuns.flatMap((run) => [run.startedAt, run.endedAt]),
    ),
    ...getObservedTime(options.taskTraceEntries.map((entry) => entry.createdAt)),
    ...getObservedTime(options.tokenUsageEvents.map((event) => event.createdAt)),
  ];
  const latestObservedTime = observedTimes.length
    ? Math.max(...observedTimes)
    : options.nowMs;
  const latestDayStart = getUtcDayStartMs(latestObservedTime);

  return Array.from({ length: PRODUCTIVITY_TREND_DAY_COUNT }, (_, index) =>
    getDayKeyFromMs(
      latestDayStart - (PRODUCTIVITY_TREND_DAY_COUNT - index - 1) * DAY_MS,
    ),
  );
}

function createProductivityTrendPoint(day: string): AgentProductivityTrendPoint {
  return {
    averageDurationMs: null,
    completedRunCount: 0,
    day,
    estimatedCost: 0,
    failedRunCount: 0,
    failedTraceCount: 0,
    label: getDayLabel(day),
    reworkRate: 0,
    reworkRunCount: 0,
    runCount: 0,
    totalTokens: 0,
    traceCount: 0,
  };
}

function createAgentThroughputTrendPoint(day: string): AgentThroughputTrendPoint {
  return {
    completedRunCount: 0,
    day,
    failedRunCount: 0,
    label: getDayLabel(day),
    runCount: 0,
  };
}

function createWorkflowCostTrendPoint(day: string): WorkflowCostTrendPoint {
  return {
    day,
    estimatedCost: 0,
    label: getDayLabel(day),
    runCount: 0,
    totalTokens: 0,
  };
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function getRunDurationMs(run: AgentRun, nowMs: number) {
  const startedAt = getTime(run.startedAt);
  if (!startedAt) {
    return null;
  }

  const endedAt = getTime(run.endedAt);
  const resolvedEnd = endedAt || nowMs;
  const duration = resolvedEnd - startedAt;
  return duration >= 0 ? duration : null;
}

function summarizeRunUsage(
  events: TokenUsageEvent[],
  run: AgentRun,
): TokenUsageRollup {
  const rollup = createEmptyUsageRollup();

  for (const event of events) {
    const matchesDirectly = event.agentRunId === run.id;
    const matchesOpenCodeSession = Boolean(
      run.opencodeSessionId && event.id === `opencode:${run.opencodeSessionId}`,
    );
    if (matchesDirectly || matchesOpenCodeSession) {
      addEventToRollup(rollup, event);
    }
  }

  return rollup;
}

function getProjectName(projectName: string | null | undefined) {
  return projectName?.trim() || "Workspace";
}

function getAgentName(agent: AgentDefinition | undefined, agentId: string | null) {
  return agent?.name ?? (agentId ? agentId : "Unassigned");
}

function getWorkflowName(
  workflow: WorkflowDefinition | undefined,
  workflowId: string | null,
) {
  return workflow?.name ?? (workflowId ? workflowId : "No workflow");
}

function createAgentSummary(
  agent: AgentDefinition | undefined,
  agentId: string | null,
): AgentProductivityAgentSummary {
  return {
    ...createEmptyUsageRollup(),
    activeRunCount: 0,
    agentId,
    agentName: getAgentName(agent, agentId),
    averageDurationMs: null,
    blockedRunCount: 0,
    budgetWarningCount: 0,
    completedRunCount: 0,
    completionRate: 0,
    failedRunCount: 0,
    lastRunAt: null,
    overBudgetRunCount: 0,
    pausedRunCount: 0,
    projectName: getProjectName(agent?.projectName),
    runCount: 0,
  };
}

function createWorkflowSummary(
  workflow: WorkflowDefinition | undefined,
  workflowId: string | null,
  metadataIssues: string[],
): AgentProductivityWorkflowSummary {
  const firstAgent = workflow?.steps.find((step) => step.agentId)?.agentId ?? null;
  const lastAgent =
    [...(workflow?.steps ?? [])].reverse().find((step) => step.agentId)?.agentId ??
    null;

  return {
    ...createEmptyUsageRollup(),
    averageDurationMs: null,
    averageTokensPerRun: 0,
    firstAgentIds: firstAgent ? [firstAgent] : [],
    lastAgentIds: lastAgent ? [lastAgent] : [],
    metadataIssues,
    projectName: getProjectName(workflow?.projectName),
    runCount: 0,
    runsWithUsageCount: 0,
    workflowId,
    workflowName: getWorkflowName(workflow, workflowId),
  };
}

function createProjectSummary(
  projectId: string | null,
  projectName: string,
): AgentProductivityProjectSummary {
  return {
    ...createEmptyUsageRollup(),
    projectId,
    projectName,
    runCount: 0,
  };
}

function createModelSummary(
  provider: string | null,
  model: string | null,
): AgentProductivityModelSummary {
  return {
    ...createEmptyUsageRollup(),
    label: [provider, model].filter(Boolean).join(" / ") || "Unknown model",
    model,
    provider,
  };
}

function getWorkflowMetadataIssues(
  workflow: WorkflowDefinition,
  agentsById: Map<string, AgentDefinition>,
) {
  const issues = new Set<string>();

  if (workflow.steps.length === 0) {
    issues.add("No steps");
  }

  const referencedAgents = workflow.steps
    .map((step) => step.agentId)
    .filter((agentId): agentId is string => Boolean(agentId));

  if (referencedAgents.length === 0) {
    issues.add("No agent handoffs");
  }

  for (const step of workflow.steps) {
    if (!step.agentId) {
      issues.add("Step without agent");
      continue;
    }

    const agent = agentsById.get(step.agentId);
    if (!agent) {
      issues.add(`Unknown agent: ${step.agentId}`);
      continue;
    }

    if (!agent.tokenBudget) {
      issues.add(`Missing budget: ${agent.name}`);
    }
    if (agent.responsibilities.length === 0 && !agent.description) {
      issues.add(`Missing responsibilities: ${agent.name}`);
    }
    if (agent.boundaries.length === 0) {
      issues.add(`Missing boundaries: ${agent.name}`);
    }
  }

  return Array.from(issues).sort();
}

function sortByUsage(left: TokenUsageRollup, right: TokenUsageRollup) {
  return (
    right.totalTokens - left.totalTokens ||
    right.estimatedCost - left.estimatedCost ||
    getTime(right.lastUsedAt) - getTime(left.lastUsedAt)
  );
}

function resolveEventRun(
  event: TokenUsageEvent,
  runsById: Map<string, AgentRun>,
  runsByOpenCodeUsageId: Map<string, AgentRun>,
) {
  if (event.agentRunId) {
    const run = runsById.get(event.agentRunId);
    if (run) {
      return run;
    }
  }

  return runsByOpenCodeUsageId.get(event.id) ?? null;
}

function buildReworkSignalForRun(
  runInsight: AgentProductivityRunInsight,
  traces: TaskTraceEntry[],
): AgentReworkSignal | null {
  const failedTraceCount = traces.filter((trace) => trace.errors.length > 0).length;
  const repeatedFileCount = countRepeatedValues(
    traces.flatMap((trace) => trace.filesTouched),
  );
  const repeatedTestCount = countRepeatedValues(
    traces.flatMap((trace) => trace.testsRun),
  );
  if (
    failedTraceCount === 0 &&
    repeatedFileCount === 0 &&
    repeatedTestCount === 0
  ) {
    return null;
  }

  return {
    agentId: runInsight.agentId,
    agentName: runInsight.agentName,
    failedTraceCount,
    latestTraceAt:
      traces
        .map((trace) => trace.createdAt)
        .sort((left, right) => getTime(right) - getTime(left))[0] ?? null,
    repeatedFileCount,
    repeatedTestCount,
    runId: runInsight.run.id,
    taskTitle: runInsight.run.taskTitle,
    traceCount: traces.length,
  };
}

function sortReworkSignals(
  left: AgentReworkSignal,
  right: AgentReworkSignal,
) {
  return (
    right.failedTraceCount - left.failedTraceCount ||
    right.repeatedFileCount - left.repeatedFileCount ||
    right.repeatedTestCount - left.repeatedTestCount ||
    getTime(right.latestTraceAt) - getTime(left.latestTraceAt)
  );
}

function matchesHandoffTargetRun(
  sourceRun: AgentRun,
  targetRun: AgentRun,
  targetAgentId: string,
) {
  if (targetRun.id === sourceRun.id || targetRun.agentId !== targetAgentId) {
    return false;
  }
  if (
    sourceRun.workflowRunId &&
    targetRun.workflowRunId &&
    sourceRun.workflowRunId !== targetRun.workflowRunId
  ) {
    return false;
  }
  if (
    sourceRun.projectId &&
    targetRun.projectId &&
    sourceRun.projectId !== targetRun.projectId
  ) {
    return false;
  }

  return true;
}

export function buildAgentProductivityInsights(
  input: AgentProductivityInput,
): AgentProductivityInsights {
  const agents = input.agents;
  const workflows = input.workflows;
  const agentRuns = normalizeAgentRuns(input.agentRuns);
  const taskTraceEntries = normalizeTaskTraceEntries(input.taskTraceEntries ?? []);
  const tokenUsageEvents = normalizeTokenUsageEvents(input.tokenUsageEvents);
  const nowMs = input.now ? new Date(input.now).getTime() : Date.now();
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const runsById = new Map(agentRuns.map((run) => [run.id, run]));
  const runsByOpenCodeUsageId = new Map(
    agentRuns
      .filter((run) => run.opencodeSessionId)
      .map((run) => [`opencode:${run.opencodeSessionId}`, run] as const),
  );
  const projectNamesById = new Map<string, string>();

  for (const agent of agents) {
    if (agent.projectId && agent.projectName) {
      projectNamesById.set(agent.projectId, agent.projectName);
    }
  }
  for (const workflow of workflows) {
    if (workflow.projectId && workflow.projectName) {
      projectNamesById.set(workflow.projectId, workflow.projectName);
    }
  }

  const runUsageById = new Map(
    agentRuns.map((run) => [run.id, summarizeRunUsage(tokenUsageEvents, run)]),
  );
  const taskTraceEntriesByRunId = new Map<string, TaskTraceEntry[]>();
  for (const entry of taskTraceEntries) {
    const runEntries = taskTraceEntriesByRunId.get(entry.agentRunId) ?? [];
    runEntries.push(entry);
    taskTraceEntriesByRunId.set(entry.agentRunId, runEntries);
  }
  const runInsights: AgentProductivityRunInsight[] = agentRuns.map((run) => {
    const agent = run.agentId ? agentsById.get(run.agentId) : undefined;
    const workflow = run.workflowRunId
      ? workflowsById.get(run.workflowRunId)
      : undefined;
    const usage = runUsageById.get(run.id) ?? createEmptyUsageRollup();
    const budgetPercent = run.tokenBudget
      ? Math.round((usage.totalTokens / run.tokenBudget) * 100)
      : null;

    return {
      ...usage,
      agentId: run.agentId,
      agentName: getAgentName(agent, run.agentId),
      budgetPercent,
      durationMs: getRunDurationMs(run, nowMs),
      projectId: run.projectId ?? agent?.projectId ?? workflow?.projectId ?? null,
      projectName: getProjectName(
        agent?.projectName ?? workflow?.projectName ?? null,
      ),
      run,
      workflowId: run.workflowRunId,
      workflowName: getWorkflowName(workflow, run.workflowRunId),
    };
  });

  const statusCounts = STATUS_ORDER.reduce(
    (counts, status) => ({ ...counts, [status]: 0 }),
    {} as Record<AgentRunStatus, number>,
  );
  const durations = runInsights
    .map((runInsight) => runInsight.durationMs)
    .filter((duration): duration is number => duration !== null);
  const totals: AgentProductivityTotals = {
    ...createEmptyUsageRollup(),
    activeRunCount: 0,
    averageDurationMs: getAverage(durations),
    averageTokensPerRun: 0,
    blockedRunCount: 0,
    budgetWarningCount: 0,
    completedRunCount: 0,
    completionRate: 0,
    failedRunCount: 0,
    failureRate: 0,
    linkedOpenCodeRunCount: 0,
    overBudgetRunCount: 0,
    pausedRunCount: 0,
    pausedOrBlockedRate: 0,
    runCount: agentRuns.length,
    runsWithUsageCount: 0,
    unlinkedOpenCodeRunCount: 0,
    usageCoverageRate: 0,
  };

  for (const event of tokenUsageEvents) {
    addEventToRollup(totals, event);
  }

  const allReworkSignals = runInsights
    .map((runInsight) =>
      buildReworkSignalForRun(
        runInsight,
        taskTraceEntriesByRunId.get(runInsight.run.id) ?? [],
      ),
    )
    .filter((signal): signal is AgentReworkSignal => Boolean(signal))
    .sort(sortReworkSignals);
  const reworkSignals = allReworkSignals.slice(0, 8);
  const reworkRunIds = new Set(allReworkSignals.map((signal) => signal.runId));

  for (const runInsight of runInsights) {
    statusCounts[runInsight.run.status] += 1;
    if (runInsight.eventCount > 0) {
      totals.runsWithUsageCount += 1;
    }
    if (runInsight.run.opencodeSessionId) {
      totals.linkedOpenCodeRunCount += 1;
    }
    if (!runInsight.run.opencodeSessionId) {
      totals.unlinkedOpenCodeRunCount += 1;
    }
    if (runInsight.budgetPercent !== null && runInsight.budgetPercent >= 80) {
      totals.budgetWarningCount += 1;
    }
    if (runInsight.budgetPercent !== null && runInsight.budgetPercent > 100) {
      totals.overBudgetRunCount += 1;
    }
  }

  totals.activeRunCount = statusCounts.active;
  totals.blockedRunCount = statusCounts.blocked;
  totals.completedRunCount = statusCounts.completed;
  totals.failedRunCount = statusCounts.failed;
  totals.pausedRunCount = statusCounts.paused;
  totals.completionRate = getRate(totals.completedRunCount, totals.runCount);
  totals.failureRate = getRate(totals.failedRunCount, totals.runCount);
  totals.pausedOrBlockedRate = getRate(
    totals.pausedRunCount + totals.blockedRunCount,
    totals.runCount,
  );
  totals.usageCoverageRate = getRate(totals.runsWithUsageCount, totals.runCount);
  totals.averageTokensPerRun =
    totals.runCount > 0 ? Math.round(totals.totalTokens / totals.runCount) : 0;

  const trendDays = buildTrendDays({
    agentRuns,
    nowMs,
    taskTraceEntries,
    tokenUsageEvents,
  });
  const productivityTrendPointsByDay = new Map(
    trendDays.map((day) => [day, createProductivityTrendPoint(day)]),
  );
  const durationSamplesByDay = new Map<string, number[]>();

  for (const runInsight of runInsights) {
    const day = getDayKey(runInsight.run.startedAt);
    if (!day) {
      continue;
    }

    const point = productivityTrendPointsByDay.get(day);
    if (!point) {
      continue;
    }

    point.runCount += 1;
    if (runInsight.run.status === "completed") {
      point.completedRunCount += 1;
    }
    if (runInsight.run.status === "failed") {
      point.failedRunCount += 1;
    }
    if (reworkRunIds.has(runInsight.run.id)) {
      point.reworkRunCount += 1;
    }
    point.totalTokens += runInsight.totalTokens;
    point.estimatedCost += runInsight.estimatedCost;
    if (runInsight.durationMs !== null) {
      const samples = durationSamplesByDay.get(day) ?? [];
      samples.push(runInsight.durationMs);
      durationSamplesByDay.set(day, samples);
    }
  }

  for (const trace of taskTraceEntries) {
    const day = getDayKey(trace.createdAt);
    if (!day) {
      continue;
    }

    const point = productivityTrendPointsByDay.get(day);
    if (!point) {
      continue;
    }

    point.traceCount += 1;
    if (trace.errors.length > 0) {
      point.failedTraceCount += 1;
    }
  }

  const productivityTrendPoints = trendDays.map((day) => {
    const point = productivityTrendPointsByDay.get(day) ?? createProductivityTrendPoint(day);
    point.averageDurationMs = getAverage(durationSamplesByDay.get(day) ?? []);
    point.reworkRate = getRate(point.reworkRunCount, point.runCount);
    return point;
  });

  const agentThroughputTrendsById = new Map<
    string,
    {
      agentId: string | null;
      agentName: string;
      completedRunCount: number;
      pointsByDay: Map<string, AgentThroughputTrendPoint>;
      runCount: number;
    }
  >();
  const getAgentThroughputTrend = (runInsight: AgentProductivityRunInsight) => {
    const agentKey = runInsight.agentId ?? "unassigned";
    const existing = agentThroughputTrendsById.get(agentKey);
    if (existing) {
      return existing;
    }

    const trend = {
      agentId: runInsight.agentId,
      agentName: runInsight.agentName,
      completedRunCount: 0,
      pointsByDay: new Map(
        trendDays.map((day) => [day, createAgentThroughputTrendPoint(day)]),
      ),
      runCount: 0,
    };
    agentThroughputTrendsById.set(agentKey, trend);
    return trend;
  };

  for (const runInsight of runInsights) {
    const day = getDayKey(runInsight.run.startedAt);
    const trend = getAgentThroughputTrend(runInsight);
    trend.runCount += 1;
    if (runInsight.run.status === "completed") {
      trend.completedRunCount += 1;
    }
    if (!day) {
      continue;
    }

    const point = trend.pointsByDay.get(day);
    if (!point) {
      continue;
    }

    point.runCount += 1;
    if (runInsight.run.status === "completed") {
      point.completedRunCount += 1;
    }
    if (runInsight.run.status === "failed") {
      point.failedRunCount += 1;
    }
  }

  const agentThroughputTrends = Array.from(agentThroughputTrendsById.values())
    .map((trend): AgentThroughputTrend => {
      const points = trendDays.map(
        (day) => trend.pointsByDay.get(day) ?? createAgentThroughputTrendPoint(day),
      );
      const activeDayCount = points.filter((point) => point.runCount > 0).length;
      return {
        agentId: trend.agentId,
        agentName: trend.agentName,
        averageRunsPerActiveDay:
          activeDayCount > 0
            ? roundToSingleDecimal(trend.runCount / activeDayCount)
            : 0,
        completedRunCount: trend.completedRunCount,
        completionRate: getRate(trend.completedRunCount, trend.runCount),
        points,
        runCount: trend.runCount,
      };
    })
    .sort(
      (left, right) =>
        right.runCount - left.runCount ||
        right.completedRunCount - left.completedRunCount ||
        left.agentName.localeCompare(right.agentName),
    );

  const workflowCostTrendsById = new Map<
    string,
    {
      estimatedCost: number;
      pointsByDay: Map<string, WorkflowCostTrendPoint>;
      runCount: number;
      totalTokens: number;
      workflowId: string | null;
      workflowName: string;
    }
  >();
  const getWorkflowCostTrend = (runInsight: AgentProductivityRunInsight) => {
    const workflowKey = runInsight.workflowId ?? "unassigned";
    const existing = workflowCostTrendsById.get(workflowKey);
    if (existing) {
      return existing;
    }

    const trend = {
      estimatedCost: 0,
      pointsByDay: new Map(
        trendDays.map((day) => [day, createWorkflowCostTrendPoint(day)]),
      ),
      runCount: 0,
      totalTokens: 0,
      workflowId: runInsight.workflowId,
      workflowName: runInsight.workflowName,
    };
    workflowCostTrendsById.set(workflowKey, trend);
    return trend;
  };

  for (const runInsight of runInsights) {
    const day = getDayKey(runInsight.run.startedAt);
    const trend = getWorkflowCostTrend(runInsight);
    trend.runCount += 1;
    trend.totalTokens += runInsight.totalTokens;
    trend.estimatedCost += runInsight.estimatedCost;
    if (!day) {
      continue;
    }

    const point = trend.pointsByDay.get(day);
    if (!point) {
      continue;
    }

    point.runCount += 1;
    point.totalTokens += runInsight.totalTokens;
    point.estimatedCost += runInsight.estimatedCost;
  }

  const workflowCostTrends = Array.from(workflowCostTrendsById.values())
    .map((trend): WorkflowCostTrend => ({
      averageTokensPerRun:
        trend.runCount > 0 ? Math.round(trend.totalTokens / trend.runCount) : 0,
      estimatedCost: trend.estimatedCost,
      points: trendDays.map(
        (day) => trend.pointsByDay.get(day) ?? createWorkflowCostTrendPoint(day),
      ),
      runCount: trend.runCount,
      totalTokens: trend.totalTokens,
      workflowId: trend.workflowId,
      workflowName: trend.workflowName,
    }))
    .sort(
      (left, right) =>
        right.totalTokens - left.totalTokens ||
        right.estimatedCost - left.estimatedCost ||
        right.runCount - left.runCount ||
        left.workflowName.localeCompare(right.workflowName),
    );

  const runInsightsByStartTime = [...runInsights].sort(
    (left, right) => getTime(left.run.startedAt) - getTime(right.run.startedAt),
  );
  const handoffLatencySamples: AgentHandoffLatencySample[] = [];
  for (const trace of taskTraceEntries) {
    if (!trace.handoffTargetAgentId) {
      continue;
    }

    const sourceRun = runsById.get(trace.agentRunId);
    const handoffAtMs = getTime(trace.createdAt);
    if (!sourceRun || !handoffAtMs) {
      continue;
    }

    const targetRunInsight = runInsightsByStartTime.find(
      (candidate) =>
        matchesHandoffTargetRun(
          sourceRun,
          candidate.run,
          trace.handoffTargetAgentId!,
        ) && getTime(candidate.run.startedAt) >= handoffAtMs,
    );
    if (!targetRunInsight) {
      continue;
    }

    const startedAtMs = getTime(targetRunInsight.run.startedAt);
    const latencyMs = startedAtMs - handoffAtMs;
    if (latencyMs < 0) {
      continue;
    }

    const fromAgent = sourceRun.agentId ? agentsById.get(sourceRun.agentId) : undefined;
    const toAgent = agentsById.get(trace.handoffTargetAgentId);
    const workflow = sourceRun.workflowRunId
      ? workflowsById.get(sourceRun.workflowRunId)
      : undefined;
    handoffLatencySamples.push({
      fromAgentId: sourceRun.agentId,
      fromAgentName: getAgentName(fromAgent, sourceRun.agentId),
      handoffAt: trace.createdAt,
      latencyMs,
      sourceRunId: sourceRun.id,
      startedAt: targetRunInsight.run.startedAt,
      targetRunId: targetRunInsight.run.id,
      taskTitle: targetRunInsight.run.taskTitle,
      toAgentId: trace.handoffTargetAgentId,
      toAgentName: getAgentName(toAgent, trace.handoffTargetAgentId),
      workflowId: sourceRun.workflowRunId,
      workflowName: getWorkflowName(workflow, sourceRun.workflowRunId),
    });
  }
  const handoffLatencyValues = handoffLatencySamples.map((sample) => sample.latencyMs);
  const handoffLatency: AgentHandoffLatencySummary = {
    averageLatencyMs: getAverage(handoffLatencyValues),
    maxLatencyMs: handoffLatencyValues.length ? Math.max(...handoffLatencyValues) : null,
    sampleCount: handoffLatencyValues.length,
    slowestSamples: [...handoffLatencySamples]
      .sort(
        (left, right) =>
          right.latencyMs - left.latencyMs ||
          getTime(right.handoffAt) - getTime(left.handoffAt),
      )
      .slice(0, 5),
  };

  const agentSummariesById = new Map<string, AgentProductivityAgentSummary>();
  for (const agent of agents) {
    agentSummariesById.set(agent.id, createAgentSummary(agent, agent.id));
  }

  const workflowMetadataIssues = new Map(
    workflows.map((workflow) => [
      workflow.id,
      getWorkflowMetadataIssues(workflow, agentsById),
    ]),
  );
  const workflowSummariesById = new Map<string, AgentProductivityWorkflowSummary>();
  for (const workflow of workflows) {
    workflowSummariesById.set(
      workflow.id,
      createWorkflowSummary(
        workflow,
        workflow.id,
        workflowMetadataIssues.get(workflow.id) ?? [],
      ),
    );
  }

  const projectSummariesById = new Map<string, AgentProductivityProjectSummary>();
  const durationSamplesByAgentId = new Map<string, number[]>();
  const durationSamplesByWorkflowId = new Map<string, number[]>();

  for (const runInsight of runInsights) {
    const agentKey = runInsight.agentId ?? "unassigned";
    const agentSummary =
      agentSummariesById.get(agentKey) ??
      createAgentSummary(
        runInsight.agentId ? agentsById.get(runInsight.agentId) : undefined,
        runInsight.agentId,
      );
    agentSummary.runCount += 1;
    agentSummary[`${runInsight.run.status}RunCount`] += 1;
    agentSummary.lastRunAt =
      !agentSummary.lastRunAt ||
      getTime(runInsight.run.startedAt) > getTime(agentSummary.lastRunAt)
        ? runInsight.run.startedAt
        : agentSummary.lastRunAt;
    if (runInsight.budgetPercent !== null && runInsight.budgetPercent >= 80) {
      agentSummary.budgetWarningCount += 1;
    }
    if (runInsight.budgetPercent !== null && runInsight.budgetPercent > 100) {
      agentSummary.overBudgetRunCount += 1;
    }
    if (runInsight.durationMs !== null) {
      const samples = durationSamplesByAgentId.get(agentKey) ?? [];
      samples.push(runInsight.durationMs);
      durationSamplesByAgentId.set(agentKey, samples);
    }
    agentSummariesById.set(agentKey, agentSummary);

    const workflowKey = runInsight.workflowId ?? "unassigned";
    const workflowSummary =
      workflowSummariesById.get(workflowKey) ??
      createWorkflowSummary(
        runInsight.workflowId ? workflowsById.get(runInsight.workflowId) : undefined,
        runInsight.workflowId,
        [],
      );
    workflowSummary.runCount += 1;
    if (runInsight.eventCount > 0) {
      workflowSummary.runsWithUsageCount += 1;
    }
    if (runInsight.durationMs !== null) {
      const samples = durationSamplesByWorkflowId.get(workflowKey) ?? [];
      samples.push(runInsight.durationMs);
      durationSamplesByWorkflowId.set(workflowKey, samples);
    }
    workflowSummariesById.set(workflowKey, workflowSummary);

    const projectKey = runInsight.projectId ?? "workspace";
    const projectSummary =
      projectSummariesById.get(projectKey) ??
      createProjectSummary(runInsight.projectId, runInsight.projectName);
    projectSummary.runCount += 1;
    projectSummariesById.set(projectKey, projectSummary);
  }

  const modelSummariesByKey = new Map<string, AgentProductivityModelSummary>();

  for (const event of tokenUsageEvents) {
    const matchingRun = resolveEventRun(event, runsById, runsByOpenCodeUsageId);
    const resolvedAgentId = event.agentId ?? matchingRun?.agentId ?? null;
    const agentKey = resolvedAgentId ?? "unassigned";
    const agent =
      resolvedAgentId === null ? undefined : agentsById.get(resolvedAgentId);
    const agentSummary =
      agentSummariesById.get(agentKey) ?? createAgentSummary(agent, resolvedAgentId);
    addEventToRollup(agentSummary, event);
    agentSummariesById.set(agentKey, agentSummary);

    const resolvedWorkflowId = event.workflowRunId ?? matchingRun?.workflowRunId ?? null;
    const workflowKey = resolvedWorkflowId ?? "unassigned";
    const workflow =
      resolvedWorkflowId === null ? undefined : workflowsById.get(resolvedWorkflowId);
    const workflowSummary =
      workflowSummariesById.get(workflowKey) ??
      createWorkflowSummary(workflow, resolvedWorkflowId, []);
    addEventToRollup(workflowSummary, event);
    workflowSummary.averageTokensPerRun =
      workflowSummary.runCount > 0
        ? Math.round(workflowSummary.totalTokens / workflowSummary.runCount)
        : workflowSummary.totalTokens;
    workflowSummariesById.set(workflowKey, workflowSummary);

    const resolvedProjectId =
      event.projectId ?? matchingRun?.projectId ?? agent?.projectId ?? workflow?.projectId ?? null;
    const projectKey = resolvedProjectId ?? "workspace";
    const projectSummary =
      projectSummariesById.get(projectKey) ??
      createProjectSummary(
        resolvedProjectId,
        getProjectName(
          resolvedProjectId
            ? projectNamesById.get(resolvedProjectId) ??
                agent?.projectName ??
                workflow?.projectName
            : null,
        ),
      );
    addEventToRollup(projectSummary, event);
    projectSummariesById.set(projectKey, projectSummary);

    const modelKey = `${event.provider ?? "unknown"}:${event.model ?? "unknown"}`;
    const modelSummary =
      modelSummariesByKey.get(modelKey) ??
      createModelSummary(event.provider, event.model);
    addEventToRollup(modelSummary, event);
    modelSummariesByKey.set(modelKey, modelSummary);
  }

  for (const [agentKey, agentSummary] of Array.from(agentSummariesById.entries())) {
    agentSummary.averageDurationMs =
      getAverage(durationSamplesByAgentId.get(agentKey) ?? []) ?? null;
    agentSummary.completionRate = getRate(
      agentSummary.completedRunCount,
      agentSummary.runCount,
    );
  }

  for (const [workflowKey, workflowSummary] of Array.from(
    workflowSummariesById.entries(),
  )) {
    workflowSummary.averageDurationMs =
      getAverage(durationSamplesByWorkflowId.get(workflowKey) ?? []) ?? null;
    workflowSummary.averageTokensPerRun =
      workflowSummary.runCount > 0
        ? Math.round(workflowSummary.totalTokens / workflowSummary.runCount)
        : workflowSummary.totalTokens;
  }

  const workflowRunCounts = new Map(
    Array.from(workflowSummariesById.values())
      .filter((summary) => summary.workflowId)
      .map((summary) => [summary.workflowId!, summary.runCount]),
  );
  const handoffRolesByAgentId = new Map<string, AgentHandoffRoleSummary>();
  for (const workflow of workflows) {
    const firstAgentId = workflow.steps.find((step) => step.agentId)?.agentId ?? null;
    const lastAgentId =
      [...workflow.steps].reverse().find((step) => step.agentId)?.agentId ?? null;
    const workflowRunCount = workflowRunCounts.get(workflow.id) ?? 0;

    for (const [position, agentId] of [
      ["first", firstAgentId],
      ["last", lastAgentId],
    ] as const) {
      if (!agentId) {
        continue;
      }
      const agent = agentsById.get(agentId);
      const summary =
        handoffRolesByAgentId.get(agentId) ?? {
          agentId,
          agentName: getAgentName(agent, agentId),
          firstRunCount: 0,
          firstWorkflowCount: 0,
          lastRunCount: 0,
          lastWorkflowCount: 0,
        };
      if (position === "first") {
        summary.firstRunCount += workflowRunCount;
        summary.firstWorkflowCount += 1;
      } else {
        summary.lastRunCount += workflowRunCount;
        summary.lastWorkflowCount += 1;
      }
      handoffRolesByAgentId.set(agentId, summary);
    }
  }

  const budgetWarnings = runInsights
    .filter((runInsight) => runInsight.budgetPercent !== null && runInsight.budgetPercent >= 80)
    .sort(
      (left, right) =>
        (right.budgetPercent ?? 0) - (left.budgetPercent ?? 0) ||
        getTime(right.run.startedAt) - getTime(left.run.startedAt),
    )
    .slice(0, 8);

  const expensiveRuns = [...runInsights]
    .sort((left, right) => getTime(right.run.startedAt) - getTime(left.run.startedAt))
    .slice(0, 50)
    .filter((runInsight) => runInsight.totalTokens > 0 || runInsight.estimatedCost > 0)
    .sort(
      (left, right) =>
        right.estimatedCost - left.estimatedCost ||
        right.totalTokens - left.totalTokens ||
        getTime(right.run.startedAt) - getTime(left.run.startedAt),
    )
    .slice(0, 8);

  const telemetryGaps: AgentTelemetryGap[] = [];
  for (const runInsight of [...runInsights].sort(
    (left, right) => getTime(right.run.startedAt) - getTime(left.run.startedAt),
  )) {
    const issueLabels: string[] = [];
    if (!runInsight.run.opencodeSessionId) {
      issueLabels.push("No OpenCode session");
    }
    if (runInsight.eventCount === 0) {
      issueLabels.push("No usage events");
    }
    if (issueLabels.length > 0) {
      telemetryGaps.push({
        agentId: runInsight.agentId,
        agentName: runInsight.agentName,
        createdAt: runInsight.run.startedAt,
        issueLabels,
        projectName: runInsight.projectName,
        runId: runInsight.run.id,
        taskTitle: runInsight.run.taskTitle,
        workflowName: runInsight.workflowName,
      });
    }
  }
  for (const event of tokenUsageEvents) {
    const matchingRun = resolveEventRun(event, runsById, runsByOpenCodeUsageId);
    if (!event.agentId && !matchingRun?.agentId) {
      telemetryGaps.push({
        agentId: null,
        agentName: "Unassigned",
        createdAt: event.createdAt,
        issueLabels: ["Unassigned token event"],
        projectName: getProjectName(null),
        runId: event.agentRunId,
        taskTitle: event.id,
        workflowName: event.workflowRunId ?? "No workflow",
      });
    }
  }

  return {
    agentThroughputTrends,
    agentSummaries: Array.from(agentSummariesById.values()).sort(
      (left, right) =>
        right.runCount - left.runCount ||
        right.totalTokens - left.totalTokens ||
        left.agentName.localeCompare(right.agentName),
    ),
    budgetWarnings,
    expensiveRuns,
    handoffLatency,
    handoffRoles: Array.from(handoffRolesByAgentId.values()).sort(
      (left, right) =>
        right.firstRunCount +
          right.lastRunCount -
          (left.firstRunCount + left.lastRunCount) ||
        right.firstWorkflowCount +
          right.lastWorkflowCount -
          (left.firstWorkflowCount + left.lastWorkflowCount) ||
        left.agentName.localeCompare(right.agentName),
    ),
    modelSummaries: Array.from(modelSummariesByKey.values()).sort(sortByUsage),
    productivityTrendPoints,
    projectSummaries: Array.from(projectSummariesById.values()).sort(
      (left, right) =>
        right.runCount - left.runCount ||
        right.totalTokens - left.totalTokens ||
        left.projectName.localeCompare(right.projectName),
    ),
    reworkSignals,
    runInsights,
    telemetryGaps: telemetryGaps
      .sort((left, right) => getTime(right.createdAt) - getTime(left.createdAt))
      .slice(0, 12),
    totals,
    workflowCostTrends,
    workflowSummaries: Array.from(workflowSummariesById.values()).sort(
      (left, right) =>
        right.runCount - left.runCount ||
        right.totalTokens - left.totalTokens ||
        right.metadataIssues.length - left.metadataIssues.length ||
        left.workflowName.localeCompare(right.workflowName),
    ),
  };
}

function csvCell(value: unknown) {
  const text = value === null || typeof value === "undefined" ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function serializeAgentTelemetryCsv(input: AgentProductivityInput) {
  const insights = buildAgentProductivityInsights(input);
  const headers = [
    "run_id",
    "task_title",
    "status",
    "agent_id",
    "agent_name",
    "workflow_id",
    "workflow_name",
    "project_id",
    "project_name",
    "started_at",
    "ended_at",
    "duration_minutes",
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cache_tokens",
    "tool_call_tokens",
    "total_tokens",
    "estimated_cost",
    "token_budget",
    "budget_percent",
    "opencode_session_id",
    "branch_name",
    "worktree_path",
  ];

  const rows = insights.runInsights.map((runInsight) => [
    runInsight.run.id,
    runInsight.run.taskTitle,
    runInsight.run.status,
    runInsight.agentId,
    runInsight.agentName,
    runInsight.workflowId,
    runInsight.workflowName,
    runInsight.projectId,
    runInsight.projectName,
    runInsight.run.startedAt,
    runInsight.run.endedAt,
    runInsight.durationMs === null
      ? ""
      : (runInsight.durationMs / 60_000).toFixed(1),
    runInsight.inputTokens,
    runInsight.outputTokens,
    runInsight.reasoningTokens,
    runInsight.cacheTokens,
    runInsight.toolCallTokens,
    runInsight.totalTokens,
    runInsight.estimatedCost.toFixed(4),
    runInsight.run.tokenBudget,
    runInsight.budgetPercent,
    runInsight.run.opencodeSessionId,
    runInsight.run.branchName,
    runInsight.run.worktreePath,
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildAgentTelemetryExport(
  input: AgentProductivityInput,
): AgentTelemetryExportPayload {
  const exportedAt = new Date(input.now ?? Date.now()).toISOString();

  return {
    exportedAt,
    harness: {
      agents: input.agents,
      sources: input.sources ?? [],
      workflows: input.workflows,
    },
    insights: buildAgentProductivityInsights(input),
    schemaVersion: 1,
    telemetry: {
      agentRuns: normalizeAgentRuns(input.agentRuns),
      storeUpdatedAt: input.storeUpdatedAt ?? null,
      taskTraceEntries: normalizeTaskTraceEntries(input.taskTraceEntries ?? []),
      tokenUsageEvents: normalizeTokenUsageEvents(input.tokenUsageEvents),
    },
  };
}
