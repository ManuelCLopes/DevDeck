import type {
  GitHubRepositoryCandidate,
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "@shared/workspace";
import type {
  AgentHarnessDiscoveryRequest,
  AgentHarnessDiscoveryResult,
  AgentRun,
  TaskTraceEntry,
  TokenUsageEvent,
} from "@shared/agents";
import type { AgentTelemetrySnapshot } from "@shared/agent-telemetry";
import type {
  AgentTaskTraceIngestionRequest,
  AgentTaskTraceIngestionResult,
} from "@shared/agent-task-trace";
import type {
  CreateGitWorktreeSessionResult,
  DevSessionOperationalSnapshot,
  InspectDevSessionRequest,
} from "@shared/sessions";
import type { OpenCodeSessionRecord } from "@shared/opencode-sessions";
import type { OpenCodeUsageRecord } from "@shared/opencode-usage";
import type {
  PtyAvailability,
  PtyDataPayload,
  PtyExitPayload,
  SpawnPtyRequest,
  SpawnPtyResult,
} from "@shared/terminals";
import type { WorkspaceMonitorPreferences } from "@shared/workspace-monitor";
import type {
  EngineeringBrainEvent,
  EngineeringBrainOperation,
  StartEngineeringBrainOperationRequest,
} from "@shared/engineering-brain";
import type { BacklogFeatureFlags } from "@shared/feature-flags";
import type { BacklogDiagnosticsSummary } from "@shared/backlog";

interface WorkspaceMonitorState {
  preferences: WorkspaceMonitorPreferences & {
    autoRefreshEnabled: boolean;
    autoRefreshIntervalSeconds: number;
    keepRunningInBackground: boolean;
    refreshOnWindowFocus: boolean;
    showMenuBarIcon: boolean;
  };
  selection: WorkspaceSelection | null;
}

interface DevDeckDesktopApi {
  addPullRequestComment(payload: {
    body: string;
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void>;
  claimPullRequestReview(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void>;
  clearGitHubToken(): Promise<void>;
  copyToClipboard(value: string): Promise<void>;
  getDesktopCodingToolAvailability(): Promise<{
    opencode: { available: boolean; reason: string | null };
    vscode: { available: boolean; reason: string | null };
  }>;
  discoverAgentHarness(
    payload: AgentHarnessDiscoveryRequest,
  ): Promise<AgentHarnessDiscoveryResult>;
  getAgentTelemetry(): Promise<AgentTelemetrySnapshot>;
  ingestAgentTaskTraces(
    payload?: AgentTaskTraceIngestionRequest,
  ): Promise<AgentTaskTraceIngestionResult>;
  saveAgentRuns(agentRuns: AgentRun[]): Promise<AgentTelemetrySnapshot>;
  saveTaskTraceEntries(
    taskTraceEntries: TaskTraceEntry[],
  ): Promise<AgentTelemetrySnapshot>;
  saveTokenUsageEvents(
    tokenUsageEvents: TokenUsageEvent[],
  ): Promise<AgentTelemetrySnapshot>;
  createGitWorktreeSession(payload: {
    baseRef: string;
    branchName: string;
    repositoryPath: string;
    sessionPath?: string | null;
  }): Promise<CreateGitWorktreeSessionResult>;
  listGitWorktrees(repositoryPath: string): Promise<Array<{
    path: string;
    sha: string;
    branch: string | null;
    isMain: boolean;
  }>>;
  inspectDevSessions(
    payload: InspectDevSessionRequest[],
  ): Promise<DevSessionOperationalSnapshot[]>;
  getGitHubAuthCapabilities(): Promise<{
    deviceFlowAvailable: boolean;
    deviceFlowReason: string | null;
    storageBackend: "file" | "keychain";
  }>;
  listGitHubRepositories(): Promise<GitHubRepositoryCandidate[]>;
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot>;
  onNavigate(listener: (targetPath: string) => void): () => void;
  onWorkspaceSnapshotUpdated(
    listener: (snapshot: WorkspaceSnapshot) => void,
  ): () => void;
  openExternal(targetUrl: string): Promise<void>;
  openInCode(targetPath: string): Promise<void>;
  openInOpencode(targetPath: string): Promise<void>;
  openInTerminal(targetPath: string): Promise<void>;
  listOpenCodeSessions(): Promise<OpenCodeSessionRecord[]>;
  listOpenCodeUsageRecords(): Promise<OpenCodeUsageRecord[]>;
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null>;
  requestPullRequestReviewers(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
    reviewers: string[];
  }): Promise<void>;
  removeGitWorktreeSession(payload: {
    repositoryPath: string;
    worktreePath: string;
  }): Promise<void>;
  unclaimPullRequestReview(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void>;
  pollGitHubDeviceAuth(deviceCode: string): Promise<{
    intervalSeconds?: number;
    message: string;
    status: "complete" | "error" | "pending";
    viewerLogin?: string;
  }>;
  saveGitHubToken(token: string): Promise<{ viewerLogin: string }>;
  renameOpenCodeSession(
    sessionId: string,
    title: string,
  ): Promise<OpenCodeSessionRecord>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  getPullRequestDiff(payload: {
    repositorySlug: string;
    pullRequestNumber: number;
  }): Promise<string>;
  generateAICompletion(payload: {
    diff: string;
    action: "changelog" | "security" | "draft-response";
    config: {
      provider: "ollama" | "gemini" | "anthropic";
      ollamaHost?: string;
      ollamaModel?: string;
      geminiKey?: string;
      anthropicKey?: string;
    };
  }): Promise<string>;
  getGitGraph(payload: {
    repositoryPath: string;
    limit?: number;
  }): Promise<Array<{
    hash: string;
    parents: string[];
    refs: string[];
    authorName: string;
    authorEmail: string;
    timestamp: number;
    subject: string;
  }>>;
  getMergeConflicts(payload: {
    repositoryPath: string;
  }): Promise<Array<{
    filePath: string;
    fileName: string;
    conflicts: Array<{
      id: string;
      ourContent: string;
      theirContent: string;
      ourBranch: string;
      theirBranch: string;
    }>;
    rawContent: string;
  }>>;
  resolveMergeConflict(payload: {
    repositoryPath: string;
    filePath: string;
    selections: Record<string, "our" | "their" | "both" | "none">;
  }): Promise<void>;
  showItemInFinder(targetPath: string): Promise<void>;
  showNotification(payload: { body?: string; title: string }): Promise<void>;
  startGitHubDeviceAuth(): Promise<{
    deviceCode: string;
    expiresAt: string;
    intervalSeconds: number;
    userCode: string;
    verificationUri: string;
  }>;
  syncWorkspaceMonitorState(state: WorkspaceMonitorState): Promise<void>;
  getBacklogFeatureFlags(): Promise<BacklogFeatureFlags>;
  getBacklogDiagnostics(): Promise<BacklogDiagnosticsSummary>;
  engineeringBrain: {
    startOperation(
      request: StartEngineeringBrainOperationRequest,
    ): Promise<EngineeringBrainOperation>;
    getOperation(operationId: string): Promise<EngineeringBrainOperation | null>;
    listOperations(): Promise<EngineeringBrainOperation[]>;
    cancelOperation(operationId: string): Promise<void>;
    subscribe(listener: (event: EngineeringBrainEvent) => void): () => void;
  };
  terminal: {
    available(): Promise<PtyAvailability>;
    spawn(request: SpawnPtyRequest): Promise<SpawnPtyResult>;
    write(payload: { id: string; data: string }): Promise<void>;
    resize(payload: { id: string; cols: number; rows: number }): Promise<void>;
    kill(payload: { id: string }): Promise<void>;
    onData(listener: (payload: PtyDataPayload) => void): () => void;
    onExit(listener: (payload: PtyExitPayload) => void): () => void;
  };
  windowControls: {
    close(): Promise<void>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
  };
}

declare global {
  interface Window {
    devdeck?: DevDeckDesktopApi;
  }
}

export {};
