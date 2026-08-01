export const AGENT_RUNS_STORAGE_KEY = "devdeck:agent-runs";

export function buildAgentHandoffLaunchPath(options: {
  agentId: string;
  baseRef?: string | null;
  branchName?: string | null;
  projectId: string;
  sourceRunId?: string | null;
  taskTitle?: string | null;
  workflowId?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("launch", "opencode");
  params.set("project", options.projectId);
  params.set("agent", options.agentId);

  if (options.workflowId) {
    params.set("workflow", options.workflowId);
  }
  if (options.taskTitle) {
    params.set("task", options.taskTitle);
  }
  if (options.baseRef) {
    params.set("base", options.baseRef);
  }
  if (options.branchName) {
    params.set("branch", options.branchName);
  }
  if (options.sourceRunId) {
    params.set("sourceRun", options.sourceRunId);
  }

  return `/terminals?${params.toString()}`;
}

function slugifyHandoffSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "agent";
}

export function buildDefaultHandoffBranchName(options: {
  agentId: string;
  sourceBranchName?: string | null;
  sourceRunId: string;
}) {
  const sourceSegment = slugifyHandoffSegment(
    options.sourceBranchName ?? options.sourceRunId,
  );
  const agentSegment = slugifyHandoffSegment(options.agentId);

  return `handoff/${sourceSegment}-${agentSegment}`.slice(0, 64);
}

export {
  buildAgentLaunchSummary,
  buildAgentRunEnvironment,
  createAgentRunId,
  DEFAULT_AGENT_RUN_HISTORY_LIMIT,
  findAgentRunForOpenCodeUsage,
  haveAgentRunLinksChanged,
  linkAgentRunsToOpenCodeUsageRecords,
  mergeAgentRuns,
  normalizeAgentRuns,
  sortAgentRuns,
  summarizeAgentRunsByStatus,
  updateAgentRunStatus,
} from "@shared/agent-telemetry";
