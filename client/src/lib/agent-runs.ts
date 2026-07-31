import type {
  AgentDefinition,
  AgentRun,
  AgentRunStatus,
  WorkflowDefinition,
} from "@shared/agents";

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
