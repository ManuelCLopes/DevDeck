import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentHandoffLaunchPath,
  buildAgentLaunchSummary,
  buildAgentRunEnvironment,
  buildDefaultHandoffBranchName,
  haveAgentRunLinksChanged,
  linkAgentRunsToOpenCodeUsageRecords,
  normalizeAgentRuns,
  sortAgentRuns,
  summarizeAgentRunsByStatus,
  updateAgentRunStatus,
} from "./agent-runs";
import type { AgentDefinition, AgentRun, WorkflowDefinition } from "@shared/agents";

const agent = {
  boundaries: ["Do not merge without review"],
  defaultModel: "gpt-5-codex",
  defaultProvider: null,
  defaultSkills: ["typescript"],
  defaultTools: ["shell"],
  description: "Builds scoped changes",
  handoffTargets: ["reviewer"],
  id: "builder",
  name: "Builder",
  projectId: "repo",
  projectName: "Repo",
  responsibilities: ["Implement changes", "Run tests"],
  sourceFormat: "json",
  sourcePath: "/tmp/repo/agents.json",
  tokenBudget: 120000,
} satisfies AgentDefinition;

const workflow = {
  description: "Feature implementation",
  id: "feature",
  name: "Feature Build",
  projectId: "repo",
  projectName: "Repo",
  sourceFormat: "json",
  sourcePath: "/tmp/repo/agents.json",
  steps: [],
} satisfies WorkflowDefinition;

const run = {
  agentId: "builder",
  branchName: "feature/agent-launch",
  endedAt: null,
  id: "run-1",
  opencodeSessionId: null,
  projectId: "repo",
  startedAt: "2026-08-01T10:00:00.000Z",
  status: "active",
  taskTitle: "Improve launch",
  terminalPaneId: "pane-1",
  tokenBudget: 120000,
  workflowRunId: "feature",
  worktreePath: "/tmp/repo-feature",
} satisfies AgentRun;

test("normalizeAgentRuns keeps valid persisted run details", () => {
  const runs = normalizeAgentRuns([
    {
      ...run,
      tokenBudget: 90000,
    },
    {
      id: "",
      taskTitle: "",
    },
  ]);

  assert.equal(runs.length, 2);
  assert.equal(runs[0]?.agentId, "builder");
  assert.equal(runs[0]?.tokenBudget, 90000);
  assert.equal(runs[1]?.taskTitle, "Agent run");
});

test("sortAgentRuns orders newest first", () => {
  const runs = sortAgentRuns([
    { ...run, id: "old", startedAt: "2026-08-01T09:00:00.000Z" },
    { ...run, id: "new", startedAt: "2026-08-01T11:00:00.000Z" },
  ]);

  assert.deepEqual(
    runs.map((candidate) => candidate.id),
    ["new", "old"],
  );
});

test("updateAgentRunStatus marks terminal states with an end time", () => {
  const runs = updateAgentRunStatus(
    [run],
    "run-1",
    "completed",
    "2026-08-01T12:00:00.000Z",
  );

  assert.equal(runs[0]?.status, "completed");
  assert.equal(runs[0]?.endedAt, "2026-08-01T12:00:00.000Z");
});

test("summarizeAgentRunsByStatus counts each run state", () => {
  const summary = summarizeAgentRunsByStatus([
    run,
    { ...run, id: "run-2", status: "blocked" },
    { ...run, id: "run-3", status: "completed" },
  ]);

  assert.equal(summary.active, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
});

test("linkAgentRunsToOpenCodeUsageRecords persists matched OpenCode session ids", () => {
  const linkedRuns = linkAgentRunsToOpenCodeUsageRecords(
    [run],
    [
      {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0,
        createdAt: "2026-08-01T10:00:00.000Z",
        directory: "/tmp/repo-feature",
        inputTokens: 100,
        model: "big-pickle",
        opencodeAgent: "build",
        outputTokens: 10,
        projectId: "global",
        provider: "opencode",
        reasoningTokens: 0,
        sessionId: "ses_real",
        title: "Track usage",
        totalTokens: 110,
        updatedAt: "2026-08-01T10:01:00.000Z",
      },
    ],
  );

  assert.equal(linkedRuns[0]?.opencodeSessionId, "ses_real");
  assert.equal(haveAgentRunLinksChanged([run], linkedRuns), true);
  assert.equal(haveAgentRunLinksChanged(linkedRuns, linkedRuns), false);
});

test("buildAgentRunEnvironment exports agent and workflow identifiers", () => {
  const environment = buildAgentRunEnvironment({
    agent,
    run: { ...run, tokenBudget: 90000 },
    tracePath: "/tmp/repo-feature/.devdeck/traces/run-1.jsonl",
    workflow,
  });

  assert.equal(environment.DEVDECK_AGENT_RUN_ID, "run-1");
  assert.equal(
    environment.DEVDECK_TRACE_PATH,
    "/tmp/repo-feature/.devdeck/traces/run-1.jsonl",
  );
  assert.equal(environment.DEVDECK_TRACE_FORMAT, "jsonl");
  assert.equal(environment.DEVDECK_AGENT_ID, "builder");
  assert.equal(environment.DEVDECK_AGENT_RUN_TOKEN_BUDGET, "90000");
  assert.equal(environment.DEVDECK_AGENT_TOKEN_BUDGET, "90000");
  assert.equal(environment.DEVDECK_WORKFLOW_ID, "feature");
});

test("buildAgentLaunchSummary includes responsibilities and boundaries", () => {
  const summary = buildAgentLaunchSummary({
    agent,
    agentRunId: "run-1",
    branchName: "feature/agent-launch",
    projectName: "Repo",
    taskTitle: "Improve launch",
    traceAppendCommand: [
      "TRACE_PATH='/tmp/repo-feature/.devdeck/traces/run-1.jsonl'",
      "cat <<'DEVDECK_TRACE_JSONL' >> \"$TRACE_PATH\"",
    ].join("\n"),
    tracePath: "/tmp/repo-feature/.devdeck/traces/run-1.jsonl",
    tokenBudget: 90000,
    workflow,
  });

  assert.match(summary, /Task: Improve launch/);
  assert.match(summary, /Agent Run ID: run-1/);
  assert.match(summary, /DEVDECK_AGENT_RUN_ID=run-1/);
  assert.match(summary, /Trace File: append JSONL task trace entries/);
  assert.match(summary, /Trace Append Command:/);
  assert.match(summary, /DEVDECK_TRACE_JSONL/);
  assert.match(summary, /Token Budget: 90,000 tokens/);
  assert.match(summary, /Responsibilities: Implement changes; Run tests/);
  assert.match(summary, /Boundaries: Do not merge without review/);
});

test("buildAgentHandoffLaunchPath carries next-agent launch context", () => {
  const launchPath = buildAgentHandoffLaunchPath({
    agentId: "reviewer",
    baseRef: "feature/agent-launch",
    branchName: "handoff/agent-launch-reviewer",
    projectId: "repo",
    sourceRunId: "run-1",
    taskTitle: "Review the implementation",
    workflowId: "feature",
  });

  assert.equal(
    launchPath,
    "/terminals?launch=opencode&project=repo&agent=reviewer&workflow=feature&task=Review+the+implementation&base=feature%2Fagent-launch&branch=handoff%2Fagent-launch-reviewer&sourceRun=run-1",
  );
});

test("buildDefaultHandoffBranchName creates bounded branch names", () => {
  assert.equal(
    buildDefaultHandoffBranchName({
      agentId: "Reviewer Agent",
      sourceBranchName: "feature/Agent Launch!!",
      sourceRunId: "run-1",
    }),
    "handoff/feature-agent-launch-reviewer-agent",
  );
});
