export type AgentHarnessSourceFormat =
  | "json"
  | "markdown"
  | "yaml"
  | "unknown";

export interface AgentDefinition {
  boundaries: string[];
  defaultModel: string | null;
  defaultProvider: string | null;
  defaultSkills: string[];
  defaultTools: string[];
  description: string | null;
  handoffTargets: string[];
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  responsibilities: string[];
  sourceFormat: AgentHarnessSourceFormat;
  sourcePath: string;
  tokenBudget: number | null;
}

export interface WorkflowStepDefinition {
  agentId: string | null;
  expectedOutput: string | null;
  id: string;
  name: string;
  nextStepIds: string[];
  verificationCommandIds: string[];
}

export interface WorkflowDefinition {
  description: string | null;
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  sourceFormat: AgentHarnessSourceFormat;
  sourcePath: string;
  steps: WorkflowStepDefinition[];
}

export type AgentRunStatus =
  | "active"
  | "blocked"
  | "completed"
  | "failed"
  | "paused";

export interface AgentRun {
  agentId: string | null;
  branchName: string | null;
  endedAt: string | null;
  id: string;
  opencodeSessionId: string | null;
  projectId: string | null;
  startedAt: string;
  status: AgentRunStatus;
  taskTitle: string;
  terminalPaneId: string | null;
  tokenBudget: number | null;
  workflowRunId: string | null;
  worktreePath: string | null;
}

export interface TokenUsageEvent {
  agentId: string | null;
  agentRunId: string | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  createdAt: string;
  estimatedCost: number | null;
  id: string;
  inputTokens: number;
  model: string | null;
  outputTokens: number;
  projectId: string | null;
  provider: string | null;
  toolCallTokens: number;
  workflowRunId: string | null;
}

export interface TaskTraceEntry {
  agentRunId: string;
  commandsRun: string[];
  createdAt: string;
  errors: string[];
  filesTouched: string[];
  handoffTargetAgentId: string | null;
  id: string;
  nextAction: string | null;
  summary: string;
  testsRun: string[];
}

export interface AgentHarnessSource {
  agentCount: number;
  errors: string[];
  format: AgentHarnessSourceFormat;
  projectId: string | null;
  projectName: string | null;
  sourcePath: string;
  workflowCount: number;
}

export interface AgentHarnessDiscoveryRequest {
  projectIds?: string[];
  selectionRootPath?: string | null;
  projects: Array<{
    id: string;
    localPath?: string | null;
    name: string;
  }>;
}

export interface AgentHarnessDiscoveryResult {
  agents: AgentDefinition[];
  scannedAt: string;
  sources: AgentHarnessSource[];
  workflows: WorkflowDefinition[];
}
