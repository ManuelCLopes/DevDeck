import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentProductivityInsights,
  buildAgentTelemetryExport,
  serializeAgentTelemetryCsv,
} from "./agent-productivity-insights";
import type {
  AgentDefinition,
  AgentRun,
  TaskTraceEntry,
  TokenUsageEvent,
  WorkflowDefinition,
} from "./agents";

const builder = {
  boundaries: ["Keep changes scoped"],
  defaultModel: "gpt-5-codex",
  defaultProvider: "openai",
  defaultSkills: ["typescript"],
  defaultTools: ["shell"],
  description: "Builds features",
  handoffTargets: ["reviewer"],
  id: "builder",
  name: "Builder Agent",
  projectId: "alpha",
  projectName: "alpha",
  responsibilities: ["Implement scoped changes"],
  sourceFormat: "json",
  sourcePath: "/repo/agents.json",
} satisfies AgentDefinition;

const reviewer = {
  boundaries: [],
  defaultModel: null,
  defaultProvider: "openai",
  defaultSkills: [],
  defaultTools: [],
  description: null,
  handoffTargets: [],
  id: "reviewer",
  name: "Reviewer Agent",
  projectId: "alpha",
  projectName: "alpha",
  responsibilities: [],
  sourceFormat: "json",
  sourcePath: "/repo/agents.json",
} satisfies AgentDefinition;

const workflow = {
  description: "Build then review",
  id: "feature",
  name: "Feature Build",
  projectId: "alpha",
  projectName: "alpha",
  sourceFormat: "json",
  sourcePath: "/repo/agents.json",
  steps: [
    {
      agentId: "builder",
      expectedOutput: null,
      id: "implement",
      name: "Implement",
      nextStepIds: ["review"],
      verificationCommandIds: ["npm test"],
    },
    {
      agentId: "reviewer",
      expectedOutput: null,
      id: "review",
      name: "Review",
      nextStepIds: [],
      verificationCommandIds: [],
    },
  ],
} satisfies WorkflowDefinition;

const completedRun = {
  agentId: "builder",
  branchName: "feature/one",
  endedAt: "2026-08-01T11:00:00.000Z",
  id: "run-1",
  opencodeSessionId: "ses_1",
  projectId: "alpha",
  startedAt: "2026-08-01T10:00:00.000Z",
  status: "completed",
  taskTitle: "Build, one",
  terminalPaneId: "pane-1",
  workflowRunId: "feature",
  worktreePath: "/tmp/alpha",
} satisfies AgentRun;

const failedRun = {
  ...completedRun,
  agentId: "reviewer",
  endedAt: "2026-08-01T10:45:00.000Z",
  id: "run-2",
  opencodeSessionId: null,
  startedAt: "2026-08-01T10:15:00.000Z",
  status: "failed",
  taskTitle: "Review failing work",
} satisfies AgentRun;

const builderUsage = {
  agentId: "builder",
  agentRunId: "run-1",
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  createdAt: "2026-08-01T10:30:00.000Z",
  estimatedCost: 0.5,
  id: "usage-1",
  inputTokens: 600,
  model: "gpt-5-codex",
  outputTokens: 150,
  projectId: "alpha",
  provider: "openai",
  reasoningTokens: 50,
  toolCallTokens: 20,
  workflowRunId: "feature",
} satisfies TokenUsageEvent;

const reviewerUsage = {
  ...builderUsage,
  agentId: "reviewer",
  agentRunId: "run-2",
  createdAt: "2026-08-01T10:35:00.000Z",
  estimatedCost: 0.75,
  id: "usage-2",
  inputTokens: 500,
  outputTokens: 125,
  reasoningTokens: 75,
  toolCallTokens: 0,
} satisfies TokenUsageEvent;

const failedTrace = {
  agentRunId: "run-2",
  commandsRun: ["npm test"],
  createdAt: "2026-08-01T10:40:00.000Z",
  errors: ["Tests failed"],
  filesTouched: ["client/src/pages/Agents.tsx"],
  handoffTargetAgentId: null,
  id: "trace-1",
  nextAction: "Fix tests",
  summary: "Tests failed",
  testsRun: ["npm test"],
} satisfies TaskTraceEntry;

const retryTrace = {
  ...failedTrace,
  createdAt: "2026-08-01T10:45:00.000Z",
  errors: [],
  id: "trace-2",
  summary: "Retried tests",
} satisfies TaskTraceEntry;

test("buildAgentProductivityInsights rolls up runs, usage, budgets, gaps, and handoff roles", () => {
  const insights = buildAgentProductivityInsights({
    agents: [builder, reviewer],
    agentRuns: [completedRun, failedRun],
    now: "2026-08-01T12:00:00.000Z",
    taskTraceEntries: [failedTrace, retryTrace],
    tokenUsageEvents: [
      builderUsage,
      reviewerUsage,
      {
        ...builderUsage,
        agentId: null,
        agentRunId: null,
        id: "usage-unassigned",
        projectId: null,
        workflowRunId: null,
      },
    ],
    workflows: [workflow],
  });

  assert.equal(insights.totals.runCount, 2);
  assert.equal(insights.totals.completedRunCount, 1);
  assert.equal(insights.totals.failedRunCount, 1);
  assert.equal(insights.totals.completionRate, 50);
  assert.equal(insights.totals.failureRate, 50);
  assert.equal(insights.totals.averageDurationMs, 2_700_000);
  assert.equal(insights.totals.runsWithUsageCount, 2);
  assert.equal(insights.totals.usageCoverageRate, 100);

  assert.equal(insights.agentSummaries[0]?.agentName, "Builder Agent");
  assert.equal(insights.agentSummaries[0]?.totalTokens, 835);
  assert.equal(insights.workflowSummaries[0]?.workflowName, "Feature Build");
  assert.equal(insights.workflowSummaries[0]?.runCount, 2);
  assert.equal(insights.workflowSummaries[0]?.totalTokens, 1550);
  assert.deepEqual(insights.workflowSummaries[0]?.metadataIssues, [
    "Missing boundaries: Reviewer Agent",
    "Missing responsibilities: Reviewer Agent",
  ]);
  assert.equal(insights.modelSummaries[0]?.label, "openai / gpt-5-codex");
  assert.equal(insights.projectSummaries[0]?.projectName, "alpha");
  assert.equal(insights.expensiveRuns[0]?.run.id, "run-2");
  assert.equal(insights.handoffRoles[0]?.agentName, "Builder Agent");
  assert.equal(insights.handoffRoles[0]?.firstRunCount, 2);
  assert.equal(insights.reworkSignals[0]?.runId, "run-2");
  assert.equal(insights.reworkSignals[0]?.failedTraceCount, 1);
  assert.equal(insights.reworkSignals[0]?.repeatedFileCount, 1);
  assert.equal(insights.reworkSignals[0]?.repeatedTestCount, 1);
  assert.equal(insights.productivityTrendPoints.length, 14);
  assert.equal(insights.productivityTrendPoints.at(-1)?.day, "2026-08-01");
  assert.equal(insights.productivityTrendPoints.at(-1)?.runCount, 2);
  assert.equal(insights.productivityTrendPoints.at(-1)?.reworkRunCount, 1);
  assert.equal(insights.productivityTrendPoints.at(-1)?.reworkRate, 50);
  assert.equal(insights.productivityTrendPoints.at(-1)?.failedTraceCount, 1);
  assert.equal(insights.agentThroughputTrends[0]?.agentName, "Builder Agent");
  assert.equal(insights.agentThroughputTrends[0]?.runCount, 1);
  assert.equal(insights.agentThroughputTrends[0]?.averageRunsPerActiveDay, 1);
  assert.equal(insights.workflowCostTrends[0]?.workflowName, "Feature Build");
  assert.equal(insights.workflowCostTrends[0]?.totalTokens, 1550);
  assert.equal(insights.workflowCostTrends[0]?.points.at(-1)?.totalTokens, 1550);
  assert.ok(
    insights.telemetryGaps.some((gap) =>
      gap.issueLabels.includes("Unassigned token event"),
    ),
  );
  assert.ok(
    insights.telemetryGaps.some(
      (gap) =>
        gap.runId === "run-2" &&
        gap.issueLabels.includes("No OpenCode session"),
    ),
  );
});

test("buildAgentProductivityInsights infers handoff latency from trace handoffs", () => {
  const targetRun = {
    ...completedRun,
    agentId: "reviewer",
    endedAt: "2026-08-01T11:15:00.000Z",
    id: "run-3",
    opencodeSessionId: null,
    startedAt: "2026-08-01T10:55:00.000Z",
    taskTitle: "Review handoff",
  } satisfies AgentRun;
  const handoffTrace = {
    ...failedTrace,
    agentRunId: "run-1",
    createdAt: "2026-08-01T10:45:00.000Z",
    handoffTargetAgentId: "reviewer",
    id: "trace-handoff",
    nextAction: "Start reviewer",
  } satisfies TaskTraceEntry;

  const insights = buildAgentProductivityInsights({
    agents: [builder, reviewer],
    agentRuns: [completedRun, targetRun],
    now: "2026-08-01T12:00:00.000Z",
    taskTraceEntries: [handoffTrace],
    tokenUsageEvents: [],
    workflows: [workflow],
  });

  assert.equal(insights.handoffLatency.sampleCount, 1);
  assert.equal(insights.handoffLatency.averageLatencyMs, 600_000);
  assert.equal(insights.handoffLatency.maxLatencyMs, 600_000);
  assert.equal(insights.handoffLatency.slowestSamples[0]?.sourceRunId, "run-1");
  assert.equal(insights.handoffLatency.slowestSamples[0]?.targetRunId, "run-3");
  assert.equal(insights.handoffLatency.slowestSamples[0]?.toAgentName, "Reviewer Agent");
});

test("serializeAgentTelemetryCsv writes escaped run rows with token rollups", () => {
  const csv = serializeAgentTelemetryCsv({
    agents: [builder],
    agentRuns: [completedRun],
    now: "2026-08-01T12:00:00.000Z",
    tokenUsageEvents: [builderUsage],
    workflows: [workflow],
  });

  assert.match(csv, /^run_id,task_title,status/m);
  assert.match(csv, /run-1,"Build, one",completed/);
  assert.match(csv, /835,0\.5000,ses_1/);
});

test("buildAgentTelemetryExport normalizes telemetry and includes insights", () => {
  const payload = buildAgentTelemetryExport({
    agents: [builder],
    agentRuns: [completedRun],
    now: "2026-08-01T12:00:00.000Z",
    sources: [
      {
        agentCount: 1,
        errors: [],
        format: "json",
        projectId: "alpha",
        projectName: "alpha",
        sourcePath: "/repo/agents.json",
        workflowCount: 1,
      },
    ],
    storeUpdatedAt: "2026-08-01T11:59:00.000Z",
    taskTraceEntries: [{ agentRunId: "run-1", id: "trace-1" }],
    tokenUsageEvents: [builderUsage],
    workflows: [workflow],
  });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.exportedAt, "2026-08-01T12:00:00.000Z");
  assert.equal(payload.telemetry.storeUpdatedAt, "2026-08-01T11:59:00.000Z");
  assert.equal(payload.telemetry.taskTraceEntries[0]?.summary, "Trace entry");
  assert.equal(payload.insights.totals.totalTokens, 835);
});
