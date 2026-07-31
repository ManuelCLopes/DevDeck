import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentLaunchSummary,
  buildAgentRunEnvironment,
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

test("buildAgentRunEnvironment exports agent and workflow identifiers", () => {
  const environment = buildAgentRunEnvironment({ agent, run, workflow });

  assert.equal(environment.DEVDECK_AGENT_RUN_ID, "run-1");
  assert.equal(environment.DEVDECK_AGENT_ID, "builder");
  assert.equal(environment.DEVDECK_AGENT_TOKEN_BUDGET, "120000");
  assert.equal(environment.DEVDECK_WORKFLOW_ID, "feature");
});

test("buildAgentLaunchSummary includes responsibilities and boundaries", () => {
  const summary = buildAgentLaunchSummary({
    agent,
    branchName: "feature/agent-launch",
    projectName: "Repo",
    taskTitle: "Improve launch",
    workflow,
  });

  assert.match(summary, /Task: Improve launch/);
  assert.match(summary, /Responsibilities: Implement changes; Run tests/);
  assert.match(summary, /Boundaries: Do not merge without review/);
});
