import type {
  AgentDefinition,
  AgentRun,
  TaskTraceEntry,
  WorkflowDefinition,
} from "./agents";
import type { WorkspaceSelection } from "./workspace";
import {
  mergeTaskTraceEntries,
  normalizeAgentRuns,
  normalizeTaskTraceEntries,
} from "./agent-telemetry";

export interface TaskTraceImportResult {
  entries: TaskTraceEntry[];
  rejectedCount: number;
}

export const DEVDECK_TRACE_DIRECTORY = ".devdeck/traces";
export const DEVDECK_TRACE_FORMAT_ENV = "DEVDECK_TRACE_FORMAT";
export const DEVDECK_TRACE_PATH_ENV = "DEVDECK_TRACE_PATH";

export interface AgentTaskTraceFileIngestionResult {
  error: string | null;
  importedCount: number;
  path: string;
  rejectedCount: number;
}

export interface AgentTaskTraceIngestionRequest {
  selection?: WorkspaceSelection | null;
  tracePaths?: string[];
}

export interface AgentTaskTraceIngestionResult {
  errorCount: number;
  fileResults: AgentTaskTraceFileIngestionResult[];
  filesScanned: number;
  importedCount: number;
  newEntryCount: number;
  rejectedCount: number;
  taskTraceEntries: TaskTraceEntry[];
}

export interface AgentRunHandoffStep {
  agentId: string | null;
  agentName: string;
  errorCount: number;
  id: string;
  lastTraceAt: string | null;
  name: string;
  status: "current" | "handoff-target" | "pending" | "traced";
}

export interface WorkflowHandoffHealthSummary {
  errorTraceCount: number;
  lastTraceAt: string | null;
  missingNextActionCount: number;
  missingTraceRunCount: number;
  repeatedFailurePoints: Array<{ count: number; label: string }>;
  runCount: number;
  stuckHandoffCount: number;
  traceCount: number;
  workflowId: string | null;
  workflowName: string;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getAgentName(
  agentsById: Map<string, AgentDefinition>,
  agentId: string | null,
) {
  return agentId ? agentsById.get(agentId)?.name ?? agentId : "Unassigned";
}

function getImportEntries(rawValue: unknown) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  const record = getRecord(rawValue);
  if (!record) {
    return [];
  }

  if (getString(record.agentRunId)) {
    return [record];
  }

  for (const key of ["taskTraceEntries", "traceEntries", "entries"]) {
    const entries = record[key];
    if (Array.isArray(entries)) {
      return entries;
    }
  }

  return [];
}

export function parseTaskTraceImportPayload(rawValue: unknown): TaskTraceImportResult {
  const rawEntries = getImportEntries(rawValue);
  const record = getRecord(rawValue);
  const hasEntryCollection = Boolean(
    record &&
      ["taskTraceEntries", "traceEntries", "entries"].some((key) =>
        Array.isArray(record[key]),
      ),
  );
  const importableEntries = rawEntries.filter((entry) => {
    const entryRecord = getRecord(entry);
    return Boolean(entryRecord && getString(entryRecord.agentRunId));
  });

  return {
    entries: normalizeTaskTraceEntries(importableEntries),
    rejectedCount:
      rawEntries.length === 0 && record && !hasEntryCollection
        ? 1
        : rawEntries.length - importableEntries.length,
  };
}

export function getTaskTraceEntriesForRun(
  taskTraceEntries: TaskTraceEntry[],
  runId: string,
) {
  return normalizeTaskTraceEntries(taskTraceEntries)
    .filter((entry) => entry.agentRunId === runId)
    .sort((left, right) => getTime(left.createdAt) - getTime(right.createdAt));
}

export function buildTaskTraceImportTemplate(runId: string) {
  return {
    taskTraceEntries: [
      {
        agentRunId: runId,
        commandsRun: ["npm test"],
        errors: [],
        filesTouched: ["client/src/pages/Agents.tsx"],
        handoffTargetAgentId: null,
        id: `${runId}-trace-1`,
        nextAction: "Continue implementation or hand off to the next agent.",
        summary: "Describe what changed and why.",
        testsRun: ["npm test"],
      },
    ],
  };
}

export function buildTaskTraceContractText(options: {
  agent: AgentDefinition | null;
  run: AgentRun;
  tracePath?: string | null;
  workflow: WorkflowDefinition | null;
}) {
  return [
    "DevDeck Task Trace Contract",
    `Agent Run ID: ${options.run.id}`,
    `Environment: DEVDECK_AGENT_RUN_ID=${options.run.id}`,
    options.tracePath ? `Trace Path: ${options.tracePath}` : null,
    `Agent: ${options.agent?.name ?? "Unassigned"}`,
    `Workflow: ${options.workflow?.name ?? "No workflow"}`,
    `Append one JSON object per line to ${DEVDECK_TRACE_PATH_ENV}; DevDeck imports ${DEVDECK_TRACE_DIRECTORY}/*.jsonl automatically.`,
    "You can also import this JSON from the Agents page after the agent finishes a meaningful step:",
    JSON.stringify(buildTaskTraceImportTemplate(options.run.id), null, 2),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function sanitizeTracePathSegment(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  return normalized.length > 0 ? normalized : "agent-run";
}

export function buildAgentRunTraceFileName(runId: string) {
  return `${sanitizeTracePathSegment(runId)}.jsonl`;
}

export function buildAgentRunTracePath(worktreePath: string, runId: string) {
  const trimmedRoot = worktreePath.trim().replace(/[\\/]+$/, "");
  const separator = trimmedRoot.includes("\\") && !trimmedRoot.includes("/")
    ? "\\"
    : "/";

  return [
    trimmedRoot,
    ...DEVDECK_TRACE_DIRECTORY.split("/"),
    buildAgentRunTraceFileName(runId),
  ].join(separator);
}

export function buildAgentRunHandoffSteps(options: {
  agents: AgentDefinition[];
  run: AgentRun;
  taskTraceEntries: TaskTraceEntry[];
  workflow: WorkflowDefinition | null;
}): AgentRunHandoffStep[] {
  const agentsById = new Map(options.agents.map((agent) => [agent.id, agent]));
  const runTraceEntries = getTaskTraceEntriesForRun(
    options.taskTraceEntries,
    options.run.id,
  );
  const latestHandoffTarget =
    [...runTraceEntries].reverse().find((entry) => entry.handoffTargetAgentId)
      ?.handoffTargetAgentId ?? null;
  const traceEntriesByAgentId = new Map<string, TaskTraceEntry[]>();
  const addTraceEntryForAgent = (agentId: string | null, entry: TaskTraceEntry) => {
    if (!agentId) {
      return;
    }

    const entries = traceEntriesByAgentId.get(agentId) ?? [];
    entries.push(entry);
    traceEntriesByAgentId.set(agentId, entries);
  };

  for (const entry of runTraceEntries) {
    addTraceEntryForAgent(options.run.agentId, entry);
    if (entry.handoffTargetAgentId !== options.run.agentId) {
      addTraceEntryForAgent(entry.handoffTargetAgentId, entry);
    }
  }

  const workflowSteps =
    options.workflow?.steps.map((step) => ({
      agentId: step.agentId,
      id: step.id,
      name: step.name,
    })) ?? [];
  const derivedSteps =
    workflowSteps.length > 0
      ? workflowSteps
      : [
          {
            agentId: options.run.agentId,
            id: options.run.agentId ?? options.run.id,
            name: "Run agent",
          },
        ];

  const stepsById = new Map<string, AgentRunHandoffStep>(
    derivedSteps.map((step) => [
      step.id,
      {
        agentId: step.agentId,
        agentName: getAgentName(agentsById, step.agentId),
        errorCount: 0,
        id: step.id,
        lastTraceAt: null,
        name: step.name,
        status:
          step.agentId === options.run.agentId
            ? "current"
            : step.agentId === latestHandoffTarget
              ? "handoff-target"
              : "pending",
      } satisfies AgentRunHandoffStep,
    ]),
  );

  for (const step of Array.from(stepsById.values())) {
    const entries = step.agentId
      ? traceEntriesByAgentId.get(step.agentId) ?? []
      : [];
    step.errorCount = entries.reduce(
      (count, entry) => count + entry.errors.length,
      0,
    );
    step.lastTraceAt =
      entries
        .map((entry) => entry.createdAt)
        .sort((left, right) => getTime(right) - getTime(left))[0] ?? null;
    if (entries.length > 0 && step.status === "pending") {
      step.status = "traced";
    }
  }

  if (
    latestHandoffTarget &&
    !Array.from(stepsById.values()).some(
      (step) => step.agentId === latestHandoffTarget,
    )
  ) {
    const entries = traceEntriesByAgentId.get(latestHandoffTarget) ?? [];
    stepsById.set(`handoff:${latestHandoffTarget}`, {
      agentId: latestHandoffTarget,
      agentName: getAgentName(agentsById, latestHandoffTarget),
      errorCount: entries.reduce((count, entry) => count + entry.errors.length, 0),
      id: `handoff:${latestHandoffTarget}`,
      lastTraceAt:
        entries
          .map((entry) => entry.createdAt)
          .sort((left, right) => getTime(right) - getTime(left))[0] ?? null,
      name: "Trace handoff",
      status: "handoff-target",
    });
  }

  return Array.from(stepsById.values());
}

export function summarizeWorkflowHandoffHealth(options: {
  agentRuns: AgentRun[];
  taskTraceEntries: TaskTraceEntry[];
  workflows: WorkflowDefinition[];
}): WorkflowHandoffHealthSummary[] {
  const agentRuns = normalizeAgentRuns(options.agentRuns);
  const taskTraceEntries = normalizeTaskTraceEntries(options.taskTraceEntries);
  const workflowsById = new Map(
    options.workflows.map((workflow) => [workflow.id, workflow]),
  );
  const runsByWorkflowId = new Map<string, AgentRun[]>();

  for (const run of agentRuns) {
    const key = run.workflowRunId ?? "unassigned";
    const runs = runsByWorkflowId.get(key) ?? [];
    runs.push(run);
    runsByWorkflowId.set(key, runs);
  }

  for (const workflow of options.workflows) {
    if (!runsByWorkflowId.has(workflow.id)) {
      runsByWorkflowId.set(workflow.id, []);
    }
  }

  const summaries: WorkflowHandoffHealthSummary[] = [];
  for (const [workflowKey, runs] of Array.from(runsByWorkflowId.entries())) {
    const workflow = workflowsById.get(workflowKey);
    const runIds = new Set(runs.map((run) => run.id));
    const traces = taskTraceEntries.filter((entry) => runIds.has(entry.agentRunId));
    const tracesByRunId = new Map<string, TaskTraceEntry[]>();
    const repeatedFailures = new Map<string, number>();

    for (const trace of traces) {
      const runTraces = tracesByRunId.get(trace.agentRunId) ?? [];
      runTraces.push(trace);
      tracesByRunId.set(trace.agentRunId, runTraces);
      for (const error of trace.errors) {
        repeatedFailures.set(error, (repeatedFailures.get(error) ?? 0) + 1);
      }
    }

    let missingNextActionCount = 0;
    let stuckHandoffCount = 0;
    for (const run of runs) {
      const runTraces = [...(tracesByRunId.get(run.id) ?? [])].sort(
        (left, right) => getTime(right.createdAt) - getTime(left.createdAt),
      );
      const latestTrace = runTraces[0] ?? null;
      if (!latestTrace) {
        continue;
      }

      if (!latestTrace.nextAction) {
        missingNextActionCount += 1;
      }
      if (
        latestTrace.handoffTargetAgentId &&
        (!latestTrace.nextAction ||
          run.status === "blocked" ||
          run.status === "failed" ||
          run.status === "paused")
      ) {
        stuckHandoffCount += 1;
      }
    }

    summaries.push({
      errorTraceCount: traces.filter((trace) => trace.errors.length > 0).length,
      lastTraceAt:
        traces
          .map((trace) => trace.createdAt)
          .sort((left, right) => getTime(right) - getTime(left))[0] ?? null,
      missingNextActionCount,
      missingTraceRunCount: runs.filter((run) => !tracesByRunId.has(run.id)).length,
      repeatedFailurePoints: Array.from(repeatedFailures.entries())
        .filter(([, count]) => count > 1)
        .map(([label, count]) => ({ count, label }))
        .sort(
          (left, right) =>
            right.count - left.count || left.label.localeCompare(right.label),
        )
        .slice(0, 5),
      runCount: runs.length,
      stuckHandoffCount,
      traceCount: traces.length,
      workflowId: workflow?.id ?? null,
      workflowName: workflow?.name ?? (workflowKey === "unassigned" ? "No workflow" : workflowKey),
    });
  }

  return summaries.sort(
    (left, right) =>
      right.stuckHandoffCount - left.stuckHandoffCount ||
      right.errorTraceCount - left.errorTraceCount ||
      right.missingNextActionCount - left.missingNextActionCount ||
      right.runCount - left.runCount ||
      left.workflowName.localeCompare(right.workflowName),
  );
}

function csvCell(value: unknown) {
  const text = value === null || typeof value === "undefined" ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function serializeTaskTraceEntriesCsv(options: {
  agentRuns: AgentRun[];
  agents: AgentDefinition[];
  taskTraceEntries: TaskTraceEntry[];
}) {
  const runsById = new Map(normalizeAgentRuns(options.agentRuns).map((run) => [run.id, run]));
  const agentsById = new Map(options.agents.map((agent) => [agent.id, agent]));
  const headers = [
    "trace_id",
    "agent_run_id",
    "task_title",
    "agent_id",
    "agent_name",
    "created_at",
    "summary",
    "next_action",
    "handoff_target_agent_id",
    "commands_run",
    "tests_run",
    "files_touched",
    "errors",
  ];
  const rows = normalizeTaskTraceEntries(options.taskTraceEntries).map((entry) => {
    const run = runsById.get(entry.agentRunId);
    const agentId = run?.agentId ?? null;
    return [
      entry.id,
      entry.agentRunId,
      run?.taskTitle ?? "",
      agentId,
      getAgentName(agentsById, agentId),
      entry.createdAt,
      entry.summary,
      entry.nextAction,
      entry.handoffTargetAgentId,
      entry.commandsRun.join(" | "),
      entry.testsRun.join(" | "),
      entry.filesTouched.join(" | "),
      entry.errors.join(" | "),
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export { mergeTaskTraceEntries, normalizeTaskTraceEntries };
