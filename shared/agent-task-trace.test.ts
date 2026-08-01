import test from "node:test";
import assert from "node:assert/strict";
import {
  DEVDECK_TRACE_DIRECTORY,
  buildAgentRunTracePath,
  buildAgentRunHandoffSteps,
  buildTaskTraceAppendCommandText,
  buildTaskTraceContractText,
  getTaskTraceEntriesForRun,
  parseTaskTraceImportPayload,
  serializeTaskTraceEntriesCsv,
  summarizeWorkflowHandoffHealth,
} from "./agent-task-trace";
import type {
  AgentDefinition,
  AgentRun,
  TaskTraceEntry,
  WorkflowDefinition,
} from "./agents";

const builder = {
  boundaries: ["Scope changes"],
  defaultModel: "gpt-5-codex",
  defaultProvider: "openai",
  defaultSkills: ["typescript"],
  defaultTools: ["shell"],
  description: "Builds",
  handoffTargets: ["reviewer"],
  id: "builder",
  name: "Builder Agent",
  projectId: "alpha",
  projectName: "alpha",
  responsibilities: ["Implement"],
  sourceFormat: "json",
  sourcePath: "/repo/agents.json",
  tokenBudget: 1000,
} satisfies AgentDefinition;

const reviewer = {
  ...builder,
  defaultSkills: [],
  defaultTools: [],
  handoffTargets: [],
  id: "reviewer",
  name: "Reviewer Agent",
  responsibilities: ["Review"],
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

const run = {
  agentId: "builder",
  branchName: "feature/trace",
  endedAt: null,
  id: "run-1",
  opencodeSessionId: "ses_1",
  projectId: "alpha",
  startedAt: "2026-08-01T10:00:00.000Z",
  status: "active",
  taskTitle: "Build trace view",
  terminalPaneId: "pane-1",
  tokenBudget: 1000,
  workflowRunId: "feature",
  worktreePath: "/tmp/alpha",
} satisfies AgentRun;

const firstTrace = {
  agentRunId: "run-1",
  commandsRun: ["npm test"],
  createdAt: "2026-08-01T10:10:00.000Z",
  errors: [],
  filesTouched: ["client/src/pages/Agents.tsx"],
  handoffTargetAgentId: null,
  id: "trace-1",
  nextAction: "Continue implementation",
  summary: "Added timeline shell",
  testsRun: ["npm test"],
} satisfies TaskTraceEntry;

const handoffTrace = {
  ...firstTrace,
  createdAt: "2026-08-01T10:20:00.000Z",
  errors: ["Type check failed"],
  handoffTargetAgentId: "reviewer",
  id: "trace-2",
  nextAction: null,
  summary: "Hand off to reviewer",
  testsRun: ["npm run check"],
} satisfies TaskTraceEntry;

test("parseTaskTraceImportPayload accepts common payload shapes and rejects missing run ids", () => {
  const result = parseTaskTraceImportPayload({
    traceEntries: [
      firstTrace,
      {
        summary: "Missing run id",
      },
    ],
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.entries[0]?.id, "trace-1");
});

test("parseTaskTraceImportPayload accepts a single JSONL trace object", () => {
  const result = parseTaskTraceImportPayload({
    agentRunId: "run-1",
    summary: "Single trace line",
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.agentRunId, "run-1");
  assert.equal(result.entries[0]?.summary, "Single trace line");
});

test("getTaskTraceEntriesForRun sorts trace entries chronologically", () => {
  const entries = getTaskTraceEntriesForRun([handoffTrace, firstTrace], "run-1");

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["trace-1", "trace-2"],
  );
});

test("buildAgentRunHandoffSteps highlights current and target agents", () => {
  const steps = buildAgentRunHandoffSteps({
    agents: [builder, reviewer],
    run,
    taskTraceEntries: [firstTrace, handoffTrace],
    workflow,
  });

  assert.equal(steps[0]?.agentName, "Builder Agent");
  assert.equal(steps[0]?.status, "current");
  assert.equal(steps[0]?.errorCount, 1);
  assert.equal(steps[0]?.lastTraceAt, "2026-08-01T10:20:00.000Z");
  assert.equal(steps[1]?.agentName, "Reviewer Agent");
  assert.equal(steps[1]?.status, "handoff-target");
  assert.equal(steps[1]?.errorCount, 1);
});

test("summarizeWorkflowHandoffHealth detects stuck handoffs and repeated failures", () => {
  const failedRun = {
    ...run,
    id: "run-2",
    status: "blocked",
  } satisfies AgentRun;
  const repeatedTrace = {
    ...handoffTrace,
    agentRunId: "run-2",
    id: "trace-3",
  } satisfies TaskTraceEntry;
  const health = summarizeWorkflowHandoffHealth({
    agentRuns: [run, failedRun],
    taskTraceEntries: [firstTrace, handoffTrace, repeatedTrace],
    workflows: [workflow],
  });

  assert.equal(health[0]?.workflowName, "Feature Build");
  assert.equal(health[0]?.runCount, 2);
  assert.equal(health[0]?.traceCount, 3);
  assert.equal(health[0]?.missingNextActionCount, 2);
  assert.equal(health[0]?.stuckHandoffCount, 2);
  assert.deepEqual(health[0]?.repeatedFailurePoints, [
    { count: 2, label: "Type check failed" },
  ]);
});

test("buildTaskTraceContractText includes env var instructions and import JSON", () => {
  const contract = buildTaskTraceContractText({
    agent: builder,
    run,
    tracePath: "/tmp/alpha/.devdeck/traces/run-1.jsonl",
    workflow,
  });

  assert.match(contract, /DEVDECK_AGENT_RUN_ID=run-1/);
  assert.match(contract, /DEVDECK_TRACE_PATH/);
  assert.match(contract, new RegExp(DEVDECK_TRACE_DIRECTORY));
  assert.match(contract, /"taskTraceEntries"/);
});

test("buildTaskTraceAppendCommandText creates a JSONL append command for a trace path", () => {
  const command = buildTaskTraceAppendCommandText({
    runId: "run-1",
    tracePath: "/tmp/alpha's/.devdeck/traces/run-1.jsonl",
  });
  const jsonLine = command
    .split("\n")
    .find((line) => line.startsWith("{"));

  assert.match(command, /TRACE_PATH='\/tmp\/alpha'\\''s\/\.devdeck\/traces\/run-1\.jsonl'/);
  assert.match(command, /cat <<'DEVDECK_TRACE_JSONL' >> "\$TRACE_PATH"/);
  assert.ok(jsonLine);
  assert.deepEqual(JSON.parse(jsonLine), {
    agentRunId: "run-1",
    commandsRun: ["npm test"],
    errors: [],
    filesTouched: ["client/src/pages/Agents.tsx"],
    handoffTargetAgentId: null,
    nextAction: "Continue implementation or hand off to the next agent.",
    summary: "Describe what changed and why.",
    testsRun: ["npm test"],
  });
});

test("buildTaskTraceAppendCommandText can rely on DEVDECK_TRACE_PATH", () => {
  const command = buildTaskTraceAppendCommandText({ runId: "run-1" });

  assert.match(
    command,
    /TRACE_PATH="\$\{DEVDECK_TRACE_PATH:\?DEVDECK_TRACE_PATH is not set\}"/,
  );
});

test("buildAgentRunTracePath creates a stable trace file path", () => {
  assert.equal(
    buildAgentRunTracePath("/tmp/alpha-worktree/", "run:1"),
    "/tmp/alpha-worktree/.devdeck/traces/run-1.jsonl",
  );
});

test("serializeTaskTraceEntriesCsv escapes trace rows", () => {
  const csv = serializeTaskTraceEntriesCsv({
    agentRuns: [run],
    agents: [builder],
    taskTraceEntries: [
      {
        ...firstTrace,
        summary: "Added timeline, tests, and exports",
      },
    ],
  });

  assert.match(csv, /^trace_id,agent_run_id,task_title/m);
  assert.match(csv, /trace-1,run-1,Build trace view,builder,Builder Agent/);
  assert.match(csv, /"Added timeline, tests, and exports"/);
});
