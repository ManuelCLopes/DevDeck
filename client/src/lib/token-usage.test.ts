import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTokenUsageEventsFromOpenCodeRecords,
  getTokenUsageSummaryTotal,
  getTokenUsageTotal,
  mergeTokenUsageEvents,
  normalizeTokenUsageEvents,
  summarizeTokenUsageByAgent,
} from "./token-usage";
import type { AgentRun, TokenUsageEvent } from "@shared/agents";

const baseEvent = {
  agentId: "builder",
  agentRunId: "run-1",
  cacheReadTokens: 50,
  cacheWriteTokens: 25,
  createdAt: "2026-08-01T10:00:00.000Z",
  estimatedCost: 0.42,
  id: "usage-1",
  inputTokens: 100,
  model: "gpt-5-codex",
  outputTokens: 200,
  projectId: "repo",
  provider: "openai",
  reasoningTokens: 15,
  toolCallTokens: 30,
  workflowRunId: "workflow-1",
} satisfies TokenUsageEvent;

const agentRun = {
  agentId: "builder",
  branchName: "feature/usage",
  endedAt: null,
  id: "run-1",
  opencodeSessionId: null,
  projectId: "repo",
  startedAt: "2026-08-01T09:00:00.000Z",
  status: "active",
  taskTitle: "Track usage",
  terminalPaneId: "pane-1",
  tokenBudget: 100000,
  workflowRunId: "workflow-1",
  worktreePath: "/tmp/repo-worktree",
} satisfies AgentRun;

test("normalizeTokenUsageEvents clamps invalid token values", () => {
  const events = normalizeTokenUsageEvents([
    {
      ...baseEvent,
      cacheReadTokens: "-1",
      estimatedCost: "1.25",
      inputTokens: "1,000",
      outputTokens: "bad",
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.inputTokens, 1000);
  assert.equal(events[0]?.outputTokens, 0);
  assert.equal(events[0]?.cacheReadTokens, 0);
  assert.equal(events[0]?.estimatedCost, 1.25);
});

test("getTokenUsageTotal sums all token buckets", () => {
  assert.equal(getTokenUsageTotal(baseEvent), 420);
});

test("summarizeTokenUsageByAgent groups usage and preserves unassigned events", () => {
  const summaries = summarizeTokenUsageByAgent([
    baseEvent,
    {
      ...baseEvent,
      agentId: "builder",
      createdAt: "2026-08-01T11:00:00.000Z",
      id: "usage-2",
      inputTokens: 10,
      outputTokens: 20,
    },
    {
      ...baseEvent,
      agentId: null,
      id: "usage-3",
      inputTokens: 5,
      outputTokens: 5,
    },
  ]);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.agentId, "builder");
  assert.equal(summaries[0]?.eventCount, 2);
  assert.equal(summaries[0]?.lastUsedAt, "2026-08-01T11:00:00.000Z");
  assert.equal(summaries[0]?.reasoningTokens, 30);
  assert.equal(summaries[1]?.agentId, null);
});

test("getTokenUsageSummaryTotal rolls up summary rows", () => {
  const summaries = summarizeTokenUsageByAgent([
    baseEvent,
    { ...baseEvent, agentId: "reviewer", id: "usage-2" },
  ]);
  const total = getTokenUsageSummaryTotal(summaries);

  assert.equal(total.eventCount, 2);
  assert.equal(total.totalTokens, 840);
  assert.equal(total.estimatedCost, 0.84);
});

test("buildTokenUsageEventsFromOpenCodeRecords maps worktree usage to agent runs", () => {
  const events = buildTokenUsageEventsFromOpenCodeRecords(
    [
      {
        cacheReadTokens: 40,
        cacheWriteTokens: 0,
        cost: 0.12,
        createdAt: "2026-08-01T10:00:00.000Z",
        directory: "/tmp/repo-worktree",
        inputTokens: 100,
        model: "big-pickle",
        opencodeAgent: "build",
        outputTokens: 20,
        projectId: "global",
        provider: "opencode",
        reasoningTokens: 10,
        sessionId: "ses_1",
        title: "Track usage",
        totalTokens: 170,
        updatedAt: "2026-08-01T10:01:00.000Z",
      },
    ],
    [agentRun],
  );

  assert.equal(events[0]?.id, "opencode:ses_1");
  assert.equal(events[0]?.agentId, "builder");
  assert.equal(events[0]?.agentRunId, "run-1");
  assert.equal(events[0]?.reasoningTokens, 10);
});

test("mergeTokenUsageEvents replaces incoming events with the same id", () => {
  const events = mergeTokenUsageEvents(
    [baseEvent],
    [{ ...baseEvent, inputTokens: 999 }],
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.inputTokens, 999);
});
