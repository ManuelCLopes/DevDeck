export const TASK_TRACE_ENTRIES_STORAGE_KEY = "devdeck:task-trace-entries";

export {
  buildAgentRunHandoffSteps,
  buildTaskTraceContractText,
  buildTaskTraceImportTemplate,
  getTaskTraceEntriesForRun,
  mergeTaskTraceEntries,
  normalizeTaskTraceEntries,
  parseTaskTraceImportPayload,
  serializeTaskTraceEntriesCsv,
  summarizeWorkflowHandoffHealth,
  type AgentRunHandoffStep,
  type TaskTraceImportResult,
  type WorkflowHandoffHealthSummary,
} from "@shared/agent-task-trace";
