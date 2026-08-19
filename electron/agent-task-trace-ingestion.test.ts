import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEVDECK_TRACE_DIRECTORY } from "../shared/agent-task-trace";
import type { AgentRun } from "../shared/agents";
import { saveAgentRuns } from "./agent-telemetry-store";
import { ingestAgentTaskTraces } from "./agent-task-trace-ingestion";

function createIngestionFixture() {
  const previousPath = process.env.DEVDECK_AGENT_TELEMETRY_PATH;
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-trace-ingestion-"));
  process.env.DEVDECK_AGENT_TELEMETRY_PATH = join(
    tempDirectory,
    "agent-telemetry.json",
  );

  return {
    cleanup() {
      if (previousPath === undefined) {
        delete process.env.DEVDECK_AGENT_TELEMETRY_PATH;
      } else {
        process.env.DEVDECK_AGENT_TELEMETRY_PATH = previousPath;
      }
      rmSync(tempDirectory, { force: true, recursive: true });
    },
    tempDirectory,
  };
}

const agentRun = {
  agentId: "builder",
  branchName: "feature/trace-ingest",
  endedAt: null,
  id: "run-ingest",
  opencodeSessionId: null,
  projectId: "repo",
  startedAt: "2026-08-01T10:00:00.000Z",
  status: "active",
  taskTitle: "Ingest task traces",
  terminalPaneId: "pane-1",
  workflowRunId: "workflow-1",
  worktreePath: "",
} satisfies AgentRun;

test("ingestAgentTaskTraces imports JSONL traces from active run worktrees", async () => {
  const fixture = createIngestionFixture();
  try {
    const worktreePath = join(fixture.tempDirectory, "worktree");
    const traceDirectory = join(
      worktreePath,
      ...DEVDECK_TRACE_DIRECTORY.split("/"),
    );
    mkdirSync(traceDirectory, { recursive: true });
    writeFileSync(
      join(traceDirectory, "run-ingest.jsonl"),
      [
        JSON.stringify({
          agentRunId: "run-ingest",
          commandsRun: ["npm test"],
          createdAt: "2026-08-01T10:05:00.000Z",
          filesTouched: ["client/src/pages/Agents.tsx"],
          nextAction: "Continue implementation",
          summary: "Imported from JSONL",
          testsRun: ["npm test"],
        }),
        JSON.stringify({ summary: "Missing run id" }),
        "{bad json",
      ].join("\n"),
      "utf8",
    );

    await saveAgentRuns([{ ...agentRun, worktreePath }]);

    const firstResult = await ingestAgentTaskTraces();
    assert.equal(firstResult.filesScanned, 1);
    assert.equal(firstResult.importedCount, 1);
    assert.equal(firstResult.newEntryCount, 1);
    assert.equal(firstResult.rejectedCount, 2);
    assert.equal(firstResult.errorCount, 1);
    assert.equal(firstResult.taskTraceEntries[0]?.agentRunId, "run-ingest");
    assert.equal(firstResult.taskTraceEntries[0]?.summary, "Imported from JSONL");
    assert.match(firstResult.taskTraceEntries[0]?.id ?? "", /^trace-/);

    const secondResult = await ingestAgentTaskTraces();
    assert.equal(secondResult.importedCount, 1);
    assert.equal(secondResult.newEntryCount, 0);
    assert.equal(secondResult.taskTraceEntries.length, 1);
    assert.equal(
      secondResult.taskTraceEntries[0]?.id,
      firstResult.taskTraceEntries[0]?.id,
    );
  } finally {
    fixture.cleanup();
  }
});
