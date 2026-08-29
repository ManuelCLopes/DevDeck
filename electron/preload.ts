import { contextBridge, ipcRenderer } from "electron";
import type {
  GitHubRepositoryCandidate,
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "../shared/workspace";
import type {
  AgentHarnessDiscoveryRequest,
  AgentHarnessDiscoveryResult,
  AgentRun,
  TaskTraceEntry,
  TokenUsageEvent,
} from "../shared/agents";
import type { AgentTelemetrySnapshot } from "../shared/agent-telemetry";
import type {
  AgentTaskTraceIngestionRequest,
  AgentTaskTraceIngestionResult,
} from "../shared/agent-task-trace";
import type {
  CreateGitWorktreeSessionResult,
  DevSessionOperationalSnapshot,
  InspectDevSessionRequest,
} from "../shared/sessions";
import type { OpenCodeSessionRecord } from "../shared/opencode-sessions";
import type { OpenCodeUsageRecord } from "../shared/opencode-usage";
import type {
  PtyAvailability,
  SpawnPtyRequest,
  SpawnPtyResult,
} from "../shared/terminals";
import type { WorkspaceMonitorPreferences } from "../shared/workspace-monitor";
import type {
  EngineeringBrainEvent,
  EngineeringBrainOperation,
  StartEngineeringBrainOperationRequest,
} from "../shared/engineering-brain";
import type { BacklogFeatureFlags } from "../shared/feature-flags";
import type { BacklogDiagnosticsSummary } from "../shared/backlog";
import type {
  JiraAuthCapabilities,
  JiraConnection,
  JiraConnectionCredentials,
  JiraConnectionHealth,
  JiraIssueDetail,
  JiraIssueRecord,
  JiraIssueType,
  JiraProjectConfig,
  JiraRemoteProject,
  JiraSyncMode,
} from "../shared/jira";
import type { RepositoryMappingMatch, RepositoryMappingRule } from "../shared/backlog";
import type {
  EvidenceForIssueResult,
  GatherEvidenceRequest,
} from "../shared/evidence";

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

const e2eBootstrapSelection = process.env.DEVDECK_E2E_BOOTSTRAP_SELECTION;
if (e2eBootstrapSelection) {
  try {
    window.localStorage.setItem(
      "devdeck_workspace_selection",
      e2eBootstrapSelection,
    );
    window.localStorage.setItem("devdeck_onboarding_completed", "true");
  } catch {
    // Ignore test bootstrap failures and let the app continue normally.
  }
}

const devdeck = {
  addPullRequestComment(payload: {
    body: string;
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:add-pull-request-comment", payload);
  },
  claimPullRequestReview(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:claim-pull-request-review", payload);
  },
  clearGitHubToken(): Promise<void> {
    return ipcRenderer.invoke("devdeck:clear-github-token");
  },
  createGitWorktreeSession(payload: {
    baseRef: string;
    branchName: string;
    repositoryPath: string;
    sessionPath?: string | null;
  }): Promise<CreateGitWorktreeSessionResult> {
    return ipcRenderer.invoke("devdeck:create-git-worktree-session", payload);
  },
  listGitWorktrees(
    repositoryPath: string,
  ): Promise<Array<{
    path: string;
    sha: string;
    branch: string | null;
    isMain: boolean;
  }>> {
    return ipcRenderer.invoke("devdeck:list-git-worktrees", repositoryPath);
  },
  inspectDevSessions(
    payload: InspectDevSessionRequest[],
  ): Promise<DevSessionOperationalSnapshot[]> {
    return ipcRenderer.invoke("devdeck:inspect-dev-sessions", payload);
  },
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot> {
    return ipcRenderer.invoke("devdeck:load-workspace-snapshot", selection);
  },
  onNavigate(listener: (targetPath: string) => void) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      targetPath: string,
    ) => listener(targetPath);
    ipcRenderer.on("devdeck:navigate", wrappedListener);
    return () => {
      ipcRenderer.removeListener("devdeck:navigate", wrappedListener);
    };
  },
  onWorkspaceSnapshotUpdated(
    listener: (snapshot: WorkspaceSnapshot) => void,
  ) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      snapshot: WorkspaceSnapshot,
    ) => listener(snapshot);
    ipcRenderer.on("devdeck:workspace-snapshot-updated", wrappedListener);
    return () => {
      ipcRenderer.removeListener("devdeck:workspace-snapshot-updated", wrappedListener);
    };
  },
  copyToClipboard(value: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:copy-to-clipboard", value);
  },
  openExternal(targetUrl: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-external", targetUrl);
  },
  openInCode(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-in-code", targetPath);
  },
  openInOpencode(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-in-opencode", targetPath);
  },
  getDesktopCodingToolAvailability(): Promise<{
    opencode: { available: boolean; reason: string | null };
    vscode: { available: boolean; reason: string | null };
  }> {
    return ipcRenderer.invoke("devdeck:get-desktop-coding-tool-availability");
  },
  discoverAgentHarness(
    payload: AgentHarnessDiscoveryRequest,
  ): Promise<AgentHarnessDiscoveryResult> {
    return ipcRenderer.invoke("devdeck:discover-agent-harness", payload);
  },
  getAgentTelemetry(): Promise<AgentTelemetrySnapshot> {
    return ipcRenderer.invoke("devdeck:get-agent-telemetry");
  },
  ingestAgentTaskTraces(
    payload?: AgentTaskTraceIngestionRequest,
  ): Promise<AgentTaskTraceIngestionResult> {
    return ipcRenderer.invoke("devdeck:ingest-agent-task-traces", payload);
  },
  saveAgentRuns(agentRuns: AgentRun[]): Promise<AgentTelemetrySnapshot> {
    return ipcRenderer.invoke("devdeck:save-agent-runs", agentRuns);
  },
  saveTaskTraceEntries(
    taskTraceEntries: TaskTraceEntry[],
  ): Promise<AgentTelemetrySnapshot> {
    return ipcRenderer.invoke("devdeck:save-task-trace-entries", taskTraceEntries);
  },
  saveTokenUsageEvents(
    tokenUsageEvents: TokenUsageEvent[],
  ): Promise<AgentTelemetrySnapshot> {
    return ipcRenderer.invoke("devdeck:save-token-usage-events", tokenUsageEvents);
  },
  openInTerminal(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:open-in-terminal", targetPath);
  },
  pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null> {
    return ipcRenderer.invoke("devdeck:pick-workspace");
  },
  requestPullRequestReviewers(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
    reviewers: string[];
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:request-pull-request-reviewers", payload);
  },
  removeGitWorktreeSession(payload: {
    repositoryPath: string;
    worktreePath: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:remove-git-worktree-session", payload);
  },
  unclaimPullRequestReview(payload: {
    pullRequestNumber: number;
    repositorySlug: string;
  }): Promise<void> {
    return ipcRenderer.invoke("devdeck:unclaim-pull-request-review", payload);
  },
  getGitHubAuthCapabilities() {
    return ipcRenderer.invoke("devdeck:get-github-auth-capabilities");
  },
  listGitHubRepositories(): Promise<GitHubRepositoryCandidate[]> {
    return ipcRenderer.invoke("devdeck:list-github-repositories");
  },
  listOpenCodeSessions(): Promise<OpenCodeSessionRecord[]> {
    return ipcRenderer.invoke("devdeck:list-opencode-sessions");
  },
  listOpenCodeUsageRecords(): Promise<OpenCodeUsageRecord[]> {
    return ipcRenderer.invoke("devdeck:list-opencode-usage-records");
  },
  pollGitHubDeviceAuth(deviceCode: string) {
    return ipcRenderer.invoke("devdeck:poll-github-device-auth", deviceCode);
  },
  renameOpenCodeSession(
    sessionId: string,
    title: string,
  ): Promise<OpenCodeSessionRecord> {
    return ipcRenderer.invoke("devdeck:rename-opencode-session", {
      sessionId,
      title,
    });
  },
  saveGitHubToken(token: string) {
    return ipcRenderer.invoke("devdeck:save-github-token", token);
  },
  showItemInFinder(targetPath: string): Promise<void> {
    return ipcRenderer.invoke("devdeck:show-item-in-finder", targetPath);
  },
  showNotification(payload: { body?: string; title: string }): Promise<void> {
    return ipcRenderer.invoke("devdeck:show-notification", payload);
  },
  startGitHubDeviceAuth() {
    return ipcRenderer.invoke("devdeck:start-github-device-auth");
  },
  syncWorkspaceMonitorState(state: WorkspaceMonitorState) {
    return ipcRenderer.invoke("devdeck:sync-workspace-monitor-state", state);
  },
  setLaunchAtLogin(enabled: boolean): Promise<void> {
    return ipcRenderer.invoke("devdeck:set-launch-at-login", enabled);
  },
  getPullRequestDiff(payload: {
    repositorySlug: string;
    pullRequestNumber: number;
  }): Promise<string> {
    return ipcRenderer.invoke("devdeck:get-pull-request-diff", payload);
  },
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
  }): Promise<string> {
    return ipcRenderer.invoke("devdeck:generate-ai-completion", payload);
  },
  getGitGraph(payload: {
    repositoryPath: string;
    limit?: number;
  }) {
    return ipcRenderer.invoke("devdeck:get-git-graph", payload);
  },
  getMergeConflicts(payload: {
    repositoryPath: string;
  }) {
    return ipcRenderer.invoke("devdeck:get-merge-conflicts", payload);
  },
  resolveMergeConflict(payload: {
    repositoryPath: string;
    filePath: string;
    selections: Record<string, "our" | "their" | "both" | "none">;
  }) {
    return ipcRenderer.invoke("devdeck:resolve-merge-conflict", payload);
  },
  getBacklogFeatureFlags(): Promise<BacklogFeatureFlags> {
    return ipcRenderer.invoke("devdeck:get-backlog-feature-flags");
  },
  getBacklogDiagnostics(): Promise<BacklogDiagnosticsSummary> {
    return ipcRenderer.invoke("devdeck:get-backlog-diagnostics");
  },
  backlogMapping: {
    save(payload: {
      id?: string;
      enabled: boolean;
      jiraProjectKey: string;
      localProjectIds: string[];
      match: RepositoryMappingMatch;
      priority: number;
    }): Promise<RepositoryMappingRule> {
      return ipcRenderer.invoke("devdeck:backlog-mapping:save", payload);
    },
    list(jiraProjectKey: string): Promise<RepositoryMappingRule[]> {
      return ipcRenderer.invoke("devdeck:backlog-mapping:list", jiraProjectKey);
    },
    delete(id: string): Promise<void> {
      return ipcRenderer.invoke("devdeck:backlog-mapping:delete", id);
    },
    resolve(payload: {
      components: string[];
      issueKey: string;
      jiraProjectKey: string;
      labels: string[];
    }): Promise<RepositoryMappingRule | null> {
      return ipcRenderer.invoke("devdeck:backlog-mapping:resolve", payload);
    },
  },
  evidence: {
    getForIssue(payload: {
      issueKey: string;
      jiraProjectId: string;
    }): Promise<EvidenceForIssueResult> {
      return ipcRenderer.invoke("devdeck:evidence:get-for-issue", payload);
    },
    startGather(payload: {
      jiraProjectId: string;
      request: GatherEvidenceRequest;
    }): Promise<EngineeringBrainOperation> {
      return ipcRenderer.invoke("devdeck:evidence:start-gather", payload);
    },
  },
  jira: {
    getAuthCapabilities(): Promise<JiraAuthCapabilities> {
      return ipcRenderer.invoke("devdeck:jira:get-auth-capabilities");
    },
    getConnection(): Promise<JiraConnection | null> {
      return ipcRenderer.invoke("devdeck:jira:get-connection");
    },
    testAndSaveConnection(
      credentials: JiraConnectionCredentials,
    ): Promise<{ connection: JiraConnection; health: JiraConnectionHealth }> {
      return ipcRenderer.invoke("devdeck:jira:test-and-save-connection", credentials);
    },
    clearConnection(): Promise<void> {
      return ipcRenderer.invoke("devdeck:jira:clear-connection");
    },
    listRemoteProjects(): Promise<JiraRemoteProject[]> {
      return ipcRenderer.invoke("devdeck:jira:list-remote-projects");
    },
    listIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
      return ipcRenderer.invoke("devdeck:jira:list-issue-types", projectKey);
    },
    previewJql(payload: {
      connectionId: string;
      jql: string;
    }): Promise<{ total: number; valid: true } | { reason: string; valid: false }> {
      return ipcRenderer.invoke("devdeck:jira:preview-jql", payload);
    },
    saveProjectConfig(payload: {
      connectionId: string;
      jql: string | null;
      name: string;
      projectKey: string;
    }): Promise<JiraProjectConfig> {
      return ipcRenderer.invoke("devdeck:jira:save-project-config", payload);
    },
    listProjectConfigs(connectionId: string): Promise<JiraProjectConfig[]> {
      return ipcRenderer.invoke("devdeck:jira:list-project-configs", connectionId);
    },
    listIssues(payload: {
      limit: number;
      offset: number;
      projectConfigId: string;
    }): Promise<{ issues: JiraIssueRecord[]; total: number }> {
      return ipcRenderer.invoke("devdeck:jira:list-issues", payload);
    },
    getIssueDetail(issueKey: string): Promise<JiraIssueDetail | null> {
      return ipcRenderer.invoke("devdeck:jira:get-issue-detail", issueKey);
    },
    startSync(payload: {
      mode: JiraSyncMode;
      projectConfigId: string;
    }): Promise<EngineeringBrainOperation> {
      return ipcRenderer.invoke("devdeck:jira:start-sync", payload);
    },
  },
  engineeringBrain: {
    startOperation(
      request: StartEngineeringBrainOperationRequest,
    ): Promise<EngineeringBrainOperation> {
      return ipcRenderer.invoke(
        "devdeck:engineering-brain:start-operation",
        request,
      );
    },
    getOperation(
      operationId: string,
    ): Promise<EngineeringBrainOperation | null> {
      return ipcRenderer.invoke(
        "devdeck:engineering-brain:get-operation",
        operationId,
      );
    },
    listOperations(): Promise<EngineeringBrainOperation[]> {
      return ipcRenderer.invoke("devdeck:engineering-brain:list-operations");
    },
    cancelOperation(operationId: string): Promise<void> {
      return ipcRenderer.invoke(
        "devdeck:engineering-brain:cancel-operation",
        operationId,
      );
    },
    subscribe(listener: (event: EngineeringBrainEvent) => void) {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        engineeringBrainEvent: EngineeringBrainEvent,
      ) => listener(engineeringBrainEvent);
      ipcRenderer.on("devdeck:engineering-brain:event", wrapped);
      return () => {
        ipcRenderer.removeListener("devdeck:engineering-brain:event", wrapped);
      };
    },
  },
  terminal: {
    available(): Promise<PtyAvailability> {
      return ipcRenderer.invoke("devdeck:pty:available");
    },
    spawn(request: SpawnPtyRequest): Promise<SpawnPtyResult> {
      return ipcRenderer.invoke("devdeck:pty:spawn", request);
    },
    write(payload: { id: string; data: string }): Promise<void> {
      return ipcRenderer.invoke("devdeck:pty:write", payload);
    },
    resize(payload: { id: string; cols: number; rows: number }): Promise<void> {
      return ipcRenderer.invoke("devdeck:pty:resize", payload);
    },
    kill(payload: { id: string }): Promise<void> {
      return ipcRenderer.invoke("devdeck:pty:kill", payload);
    },
    onData(listener: (payload: { id: string; chunk: string }) => void) {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; chunk: string },
      ) => listener(payload);
      ipcRenderer.on("devdeck:pty:data", wrapped);
      return () => {
        ipcRenderer.removeListener("devdeck:pty:data", wrapped);
      };
    },
    onExit(
      listener: (payload: {
        id: string;
        exitCode: number;
        signal: number | null;
      }) => void,
    ) {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; exitCode: number; signal: number | null },
      ) => listener(payload);
      ipcRenderer.on("devdeck:pty:exit", wrapped);
      return () => {
        ipcRenderer.removeListener("devdeck:pty:exit", wrapped);
      };
    },
  },
  windowControls: {
    close(): Promise<void> {
      return ipcRenderer.invoke("devdeck:window-control", "close");
    },
    minimize(): Promise<void> {
      return ipcRenderer.invoke("devdeck:window-control", "minimize");
    },
    toggleMaximize(): Promise<void> {
      return ipcRenderer.invoke("devdeck:window-control", "toggle-maximize");
    },
  },
};

contextBridge.exposeInMainWorld("devdeck", devdeck);
