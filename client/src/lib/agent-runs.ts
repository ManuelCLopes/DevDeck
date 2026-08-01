import { buildCreateSessionPath } from "./dev-sessions";

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
  return buildCreateSessionPath(options.projectId, null, {
    agentId: options.agentId,
    baseRef: options.baseRef,
    branchName: options.branchName,
    sourceRunId: options.sourceRunId,
    taskTitle: options.taskTitle,
    workflowId: options.workflowId,
  });
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
