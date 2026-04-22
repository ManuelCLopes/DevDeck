import type {
  GitHubRepositoryCandidate,
  GitHubTeamCandidate,
  TeamInsightsSnapshot,
  WorkspaceDiscoveryResult,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from "@shared/workspace";
import type {
  CreateGitWorktreeSessionResult,
  DevSessionOperationalSnapshot,
  InspectDevSessionRequest,
} from "@shared/sessions";
import type { WorkspaceMonitorPreferences } from "@shared/workspace-monitor";

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
  createGitWorktreeSession(payload: {
    baseRef: string;
    branchName: string;
    repositoryPath: string;
    sessionPath?: string | null;
  }): Promise<CreateGitWorktreeSessionResult>;
  inspectDevSessions(
    payload: InspectDevSessionRequest[],
  ): Promise<DevSessionOperationalSnapshot[]>;
  getGitHubAuthCapabilities(): Promise<{
    deviceFlowAvailable: boolean;
    deviceFlowReason: string | null;
    storageBackend: "file" | "keychain";
  }>;
  listGitHubRepositories(): Promise<GitHubRepositoryCandidate[]>;
  listGitHubTeams(): Promise<GitHubTeamCandidate[]>;
  loadTeamInsights(payload: {
    organizationLogin: string;
    periodDays: number;
    teamSlug: string;
  }): Promise<TeamInsightsSnapshot>;
  loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot>;
  onNavigate(listener: (targetPath: string) => void): () => void;
  onWorkspaceSnapshotUpdated(
    listener: (snapshot: WorkspaceSnapshot) => void,
  ): () => void;
  openExternal(targetUrl: string): Promise<void>;
  openInCode(targetPath: string): Promise<void>;
  openInOpencode(targetPath: string): Promise<void>;
  openInTerminal(targetPath: string): Promise<void>;
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
  setLaunchAtLogin(enabled: boolean): Promise<void>;
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
