export const AGENT_RUNS_STORAGE_KEY = "devdeck:agent-runs";

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
