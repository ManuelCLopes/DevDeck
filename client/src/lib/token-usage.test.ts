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
  // Unassigned events surface their model so multiple models don't
  // collapse into a single row in the by-agent view.
  assert.equal(summaries[1]?.model, "gpt-5-codex");
});

test("summarizeTokenUsageByAgent keeps agent buckets separate from model fallback buckets", () => {
  // Regression: an agent whose id happens to look like a model fallback
  // key (e.g. "model:gpt-5-codex") must not collide with the fallback
  // bucket for unassigned events on model "gpt-5-codex".
  const summaries = summarizeTokenUsageByAgent([
    {
      ...baseEvent,
      agentId: "model:gpt-5-codex",
      id: "e-agent",
      model: "gpt-5-codex",
    },
    {
      ...baseEvent,
      agentId: null,
      id: "e-fallback",
      model: "gpt-5-codex",
    },
  ]);

  assert.equal(summaries.length, 2, "agent and model buckets must not merge");
  const agentBucket = summaries.find(
    (summary) => summary.agentId === "model:gpt-5-codex",
  );
  const fallbackBucket = summaries.find((summary) => summary.agentId === null);
  assert.equal(agentBucket?.eventCount, 1);
  assert.equal(fallbackBucket?.eventCount, 1);
  assert.equal(fallbackBucket?.model, "gpt-5-codex");
});

test("summarizeTokenUsageByAgent splits unassigned events by model", () => {
  const summaries = summarizeTokenUsageByAgent([
    { ...baseEvent, agentId: null, id: "u-1", model: "model-a" },
    { ...baseEvent, agentId: null, id: "u-2", model: "model-b" },
    { ...baseEvent, agentId: null, id: "u-3", model: "model-b" },
    { ...baseEvent, agentId: null, id: "u-4", model: null },
  ]);

  const modelSummaries = summaries.filter((summary) => summary.agentId === null);
  assert.equal(modelSummaries.length, 3, "expected one row per distinct model plus one for no-model");
  const modelA = modelSummaries.find((summary) => summary.model === "model-a");
  const modelB = modelSummaries.find((summary) => summary.model === "model-b");
  const noModel = modelSummaries.find((summary) => summary.model === null);
  assert.equal(modelA?.eventCount, 1);
  assert.equal(modelB?.eventCount, 2);
  assert.equal(noModel?.eventCount, 1);
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

test("buildTokenUsageEventsFromOpenCodeRecords falls back to agents when no run matches", () => {
  // Session that DevDeck never tracked as a run: worktree path does not
  // match any AgentRun, and no direct opencodeSessionId link exists.
  // Without the agents fallback the event would be Unassigned; with it,
  // matchAgentByOpenCodeName resolves "builder" from the opencodeAgent
  // name.
  const events = buildTokenUsageEventsFromOpenCodeRecords(
    [
      {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0.05,
        createdAt: "2026-08-01T10:00:00.000Z",
        directory: "/somewhere/else",
        inputTokens: 5,
        model: "gpt-5-codex",
        opencodeAgent: "Builder",
        outputTokens: 10,
        projectId: "repo",
        provider: "opencode",
        reasoningTokens: 0,
        sessionId: "ses_new",
        title: null,
        totalTokens: 15,
        updatedAt: "2026-08-01T10:01:00.000Z",
      },
    ],
    [],
    [
      {
        boundaries: [],
        defaultModel: null,
        defaultProvider: null,
        defaultSkills: [],
        defaultTools: [],
        description: null,
        handoffTargets: [],
        id: "builder",
        name: "Builder",
        projectId: "repo",
        projectName: "Repo",
        responsibilities: [],
        sourceFormat: "json",
        sourcePath: "/tmp/repo/agents.json",
        tokenBudget: null,
      },
    ],
  );

  assert.equal(events[0]?.agentId, "builder");
  assert.equal(events[0]?.agentRunId, null);
  assert.equal(events[0]?.projectId, "repo");
});

test("mergeTokenUsageEvents replaces incoming events with the same id", () => {
  const events = mergeTokenUsageEvents(
    [baseEvent],
    [{ ...baseEvent, inputTokens: 999 }],
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.inputTokens, 999);
});
