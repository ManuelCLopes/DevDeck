import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRun, TokenUsageEvent } from "../shared/agents";
import {
  readAgentTelemetryStore,
  saveAgentRuns,
  saveTaskTraceEntries,
  saveTokenUsageEvents,
} from "./agent-telemetry-store";

function createStoreFixture() {
  const previousPath = process.env.DEVDECK_AGENT_TELEMETRY_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-agent-telemetry-"));
  const storePath = join(tempDirectory, "agent-telemetry.json");
  process.env.DEVDECK_AGENT_TELEMETRY_PATH = storePath;

  return {
    cleanup() {
      if (previousPath === undefined) {
        delete process.env.DEVDECK_AGENT_TELEMETRY_PATH;
      } else {
        process.env.DEVDECK_AGENT_TELEMETRY_PATH = previousPath;
      }
      rmSync(tempDirectory, { force: true, recursive: true });
    },
    storePath,
  };
}

const agentRun = {
  agentId: "builder",
  branchName: "feature/durable-runs",
  endedAt: null,
  id: "run-1",
  opencodeSessionId: null,
  projectId: "repo",
  startedAt: "2026-08-01T10:00:00.000Z",
  status: "active",
  taskTitle: "Persist agent runs",
  terminalPaneId: "pane-1",
  tokenBudget: 120000,
  workflowRunId: "workflow-1",
  worktreePath: "/tmp/devdeck-agent-run",
} satisfies AgentRun;

const tokenUsageEvent = {
  agentId: "builder",
  agentRunId: "run-1",
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  createdAt: "2026-08-01T10:01:00.000Z",
  estimatedCost: 0.25,
  id: "usage-1",
  inputTokens: 100,
  model: "gpt-5-codex",
  outputTokens: 50,
  projectId: "repo",
  provider: "opencode",
  reasoningTokens: 20,
  toolCallTokens: 0,
  workflowRunId: "workflow-1",
} satisfies TokenUsageEvent;

test("readAgentTelemetryStore returns an empty snapshot when missing", async () => {
  const fixture = createStoreFixture();
  try {
    const snapshot = await readAgentTelemetryStore();

    assert.deepEqual(snapshot.agentRuns, []);
    assert.deepEqual(snapshot.tokenUsageEvents, []);
    assert.deepEqual(snapshot.taskTraceEntries, []);
    assert.equal(snapshot.updatedAt, null);
  } finally {
    fixture.cleanup();
  }
});

test("saveAgentRuns normalizes and persists durable run history", async () => {
  const fixture = createStoreFixture();
  try {
    const saved = await saveAgentRuns([
      agentRun,
      {
        id: "",
        status: "unknown",
        tokenBudget: "90,000",
      },
    ]);
    const reloaded = await readAgentTelemetryStore();

    assert.equal(saved.agentRuns.length, 2);
    assert.equal(saved.agentRuns[0]?.id, "run-1");
    assert.equal(saved.agentRuns[1]?.status, "active");
    assert.equal(saved.agentRuns[1]?.taskTitle, "Agent run");
    assert.equal(saved.agentRuns[1]?.tokenBudget, 90000);
    assert.deepEqual(reloaded.agentRuns, saved.agentRuns);
  } finally {
    fixture.cleanup();
  }
});

test("telemetry mutations preserve other slices when writes overlap", async () => {
  const fixture = createStoreFixture();
  try {
    await Promise.all([
      saveAgentRuns([agentRun]),
      saveTokenUsageEvents([tokenUsageEvent]),
      saveTaskTraceEntries([
        {
          agentRunId: "run-1",
          commandsRun: ["npm test"],
          createdAt: "2026-08-01T10:02:00.000Z",
          errors: [],
          filesTouched: ["client/src/pages/Agents.tsx"],
          handoffTargetAgentId: null,
          id: "trace-1",
          nextAction: "Commit phase 2",
          summary: "Verified persistence",
          testsRun: ["npm test"],
        },
      ]),
    ]);

    const snapshot = await readAgentTelemetryStore();

    assert.equal(snapshot.agentRuns.length, 1);
    assert.equal(snapshot.agentRuns[0]?.id, "run-1");
    assert.equal(snapshot.tokenUsageEvents.length, 1);
    assert.equal(snapshot.tokenUsageEvents[0]?.id, "usage-1");
    assert.equal(snapshot.taskTraceEntries.length, 1);
    assert.equal(snapshot.taskTraceEntries[0]?.id, "trace-1");
  } finally {
    fixture.cleanup();
  }
});

test("readAgentTelemetryStore recovers from malformed persisted JSON", async () => {
  const fixture = createStoreFixture();
  try {
    writeFileSync(fixture.storePath, "{bad json", "utf8");

    const snapshot = await readAgentTelemetryStore();

    assert.deepEqual(snapshot.agentRuns, []);
    assert.deepEqual(snapshot.tokenUsageEvents, []);
    assert.deepEqual(snapshot.taskTraceEntries, []);
  } finally {
    fixture.cleanup();
  }
});
