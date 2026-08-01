import test from "node:test";
import assert from "node:assert/strict";
import {
  getAgentRunBudgetUsagePercent,
  summarizeTokenUsageForAgentRun,
} from "./agent-run-detail";
import type { AgentRun, TokenUsageEvent } from "@shared/agents";

const run = {
  agentId: "builder",
  branchName: "feature/detail",
  endedAt: null,
  id: "run-1",
  opencodeSessionId: "ses_1",
  projectId: "repo",
  startedAt: "2026-08-01T10:00:00.000Z",
  status: "active",
  taskTitle: "Build detail view",
  terminalPaneId: "pane-1",
  tokenBudget: 1000,
  workflowRunId: "workflow-1",
  worktreePath: "/tmp/repo-detail",
} satisfies AgentRun;

const baseEvent = {
  agentId: "builder",
  agentRunId: "run-1",
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  createdAt: "2026-08-01T10:01:00.000Z",
  estimatedCost: 0.2,
  id: "usage-1",
  inputTokens: 100,
  model: "gpt-5-codex",
  outputTokens: 50,
  projectId: "repo",
  provider: "opencode",
  reasoningTokens: 25,
  toolCallTokens: 10,
  workflowRunId: "workflow-1",
} satisfies TokenUsageEvent;

test("summarizeTokenUsageForAgentRun rolls up direct and OpenCode-linked events", () => {
  const summary = summarizeTokenUsageForAgentRun(
    [
      baseEvent,
      {
        ...baseEvent,
        agentRunId: null,
        id: "opencode:ses_1",
        inputTokens: 200,
      },
      {
        ...baseEvent,
        agentRunId: "other-run",
        id: "usage-other",
      },
    ],
    run,
  );

  assert.equal(summary.eventCount, 2);
  assert.equal(summary.inputTokens, 300);
  assert.equal(summary.totalTokens, 500);
  assert.deepEqual(summary.modelLabels, ["opencode / gpt-5-codex"]);
});

test("getAgentRunBudgetUsagePercent returns null without a budget", () => {
  const usage = summarizeTokenUsageForAgentRun([baseEvent], run);

  assert.equal(getAgentRunBudgetUsagePercent(run, usage), 20);
  assert.equal(
    getAgentRunBudgetUsagePercent({ ...run, tokenBudget: null }, usage),
    null,
  );
});
