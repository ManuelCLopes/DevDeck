import type {
  AgentDefinition,
  AgentRun,
  AgentRunStatus,
  WorkflowDefinition,
} from "@shared/agents";
import type { OpenCodeUsageRecord } from "@shared/opencode-usage";

export const AGENT_RUNS_STORAGE_KEY = "devdeck:agent-runs";

export function createAgentRunId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function normalizeStatus(value: unknown): AgentRunStatus {
  return value === "blocked" ||
    value === "completed" ||
    value === "failed" ||
    value === "paused"
    ? value
    : "active";
}

export function normalizeAgentRuns(rawValue: unknown): AgentRun[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object",
    )
    .map((value) => ({
      agentId: normalizeString(value.agentId),
      branchName: normalizeString(value.branchName),
      endedAt: normalizeString(value.endedAt),
      id: normalizeString(value.id) ?? createAgentRunId(),
      opencodeSessionId: normalizeString(value.opencodeSessionId),
      projectId: normalizeString(value.projectId),
      startedAt: normalizeString(value.startedAt) ?? new Date().toISOString(),
      status: normalizeStatus(value.status),
      taskTitle: normalizeString(value.taskTitle) ?? "Agent run",
      terminalPaneId: normalizeString(value.terminalPaneId),
      tokenBudget: normalizeNumber(value.tokenBudget),
      workflowRunId: normalizeString(value.workflowRunId),
      worktreePath: normalizeString(value.worktreePath),
    }));
}

export function sortAgentRuns(runs: AgentRun[]) {
  return [...runs].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

export function updateAgentRunStatus(
  runs: AgentRun[],
  runId: string,
  status: AgentRunStatus,
  endedAt = new Date().toISOString(),
) {
  return sortAgentRuns(
    runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            endedAt:
              status === "completed" || status === "failed"
                ? endedAt
                : status === "active"
                  ? null
                  : run.endedAt,
            status,
          }
        : run,
    ),
  );
}

export function summarizeAgentRunsByStatus(runs: AgentRun[]) {
  return runs.reduce(
    (summary, run) => ({
      ...summary,
      [run.status]: summary[run.status] + 1,
    }),
    {
      active: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    } satisfies Record<AgentRunStatus, number>,
  );
}

function normalizePath(value: string | null | undefined) {
  return value?.replace(/\/+$/, "") ?? null;
}

export function findAgentRunForOpenCodeUsage(
  record: OpenCodeUsageRecord,
  agentRuns: AgentRun[],
) {
  const directMatch = agentRuns.find(
    (run) => run.opencodeSessionId === record.sessionId,
  );
  if (directMatch) {
    return directMatch;
  }

  const recordDirectory = normalizePath(record.directory);
  if (!recordDirectory) {
    return null;
  }

  const candidateRuns = agentRuns.filter(
    (run) => normalizePath(run.worktreePath) === recordDirectory,
  );
  if (candidateRuns.length === 0) {
    return null;
  }

  const recordTime = record.updatedAt
    ? new Date(record.updatedAt).getTime()
    : Date.now();
  return (
    candidateRuns
      .filter((run) => new Date(run.startedAt).getTime() <= recordTime)
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      )[0] ??
    candidateRuns.sort(
      (left, right) =>
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
    )[0] ??
    null
  );
}

export function linkAgentRunsToOpenCodeUsageRecords(
  runs: AgentRun[],
  records: OpenCodeUsageRecord[],
) {
  const runsById = new Map(runs.map((run) => [run.id, run]));

  for (const record of records) {
    const matchedRun = findAgentRunForOpenCodeUsage(record, Array.from(runsById.values()));
    if (!matchedRun || matchedRun.opencodeSessionId) {
      continue;
    }

    runsById.set(matchedRun.id, {
      ...matchedRun,
      opencodeSessionId: record.sessionId,
    });
  }

  return sortAgentRuns(Array.from(runsById.values()));
}

export function haveAgentRunLinksChanged(left: AgentRun[], right: AgentRun[]) {
  const rightById = new Map(right.map((run) => [run.id, run]));
  return left.some(
    (run) => run.opencodeSessionId !== rightById.get(run.id)?.opencodeSessionId,
  );
}

export function buildAgentRunEnvironment(options: {
  agent: AgentDefinition | null;
  run: AgentRun;
  workflow: WorkflowDefinition | null;
}) {
  const environment: Record<string, string> = {
    DEVDECK_AGENT_RUN_ID: options.run.id,
    DEVDECK_AGENT_RUN_TITLE: options.run.taskTitle,
  };

  if (options.agent) {
    environment.DEVDECK_AGENT_ID = options.agent.id;
    environment.DEVDECK_AGENT_NAME = options.agent.name;
    environment.DEVDECK_AGENT_SOURCE = options.agent.sourcePath;
    if (options.agent.tokenBudget) {
      environment.DEVDECK_AGENT_TOKEN_BUDGET = String(options.agent.tokenBudget);
    }
  }

  if (options.workflow) {
    environment.DEVDECK_WORKFLOW_ID = options.workflow.id;
    environment.DEVDECK_WORKFLOW_NAME = options.workflow.name;
  }

  return environment;
}

export function buildAgentLaunchSummary(options: {
  agent: AgentDefinition | null;
  branchName: string;
  projectName: string;
  taskTitle: string;
  workflow: WorkflowDefinition | null;
}) {
  return [
    `Task: ${options.taskTitle}`,
    `Project: ${options.projectName}`,
    `Branch: ${options.branchName}`,
    `Agent: ${options.agent?.name ?? "Unassigned"}`,
    `Workflow: ${options.workflow?.name ?? "None"}`,
    options.agent?.responsibilities.length
      ? `Responsibilities: ${options.agent.responsibilities.slice(0, 4).join("; ")}`
      : null,
    options.agent?.boundaries.length
      ? `Boundaries: ${options.agent.boundaries.slice(0, 3).join("; ")}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
