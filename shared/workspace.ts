export type WorkspaceProjectStatus = "healthy" | "warning" | "critical";
export type WorkspaceReviewStatus = "active" | "stale";
export type WorkspaceActivityType = "commit" | "checkout" | "repo";
export type WorkspaceCiStatus = "passing" | "failing" | "pending" | "unknown";
export type WorkspacePullRequestStatus =
  | "open"
  | "draft"
  | "approved"
  | "changes_requested"
  | "review_required";
export type WorkspacePullRequestReviewState =
  | "unreviewed"
  | "reviewed"
  | "reviewed_by_you";
export type WorkspaceGitHubState =
  | "connected"
  | "unauthenticated"
  | "error"
  | "unsupported";

export interface MonitoredProject {
  collectionId?: string;
  collectionName?: string;
  id: string;
  isRoot?: boolean;
  localPath?: string;
  name: string;
  order?: number;
  relativePath?: string;
  repositoryCount: number | null;
  workspaceName?: string;
  workspacePath?: string;
}

export interface WorkspaceSelection {
  projects: MonitoredProject[];
  rootName: string;
  rootPath?: string;
}

export interface WorkspaceDiscoveryResult {
  candidates: MonitoredProject[];
  discoveredRepositoryCount: number;
  rootName: string;
  rootPath?: string;
}

export interface WorkspaceProject {
  aheadBy: number;
  awaitingReviewCount: number;
  behindBy: number;
  branchCount: number;
  ciStatus: WorkspaceCiStatus;
  contributorCount7d: number;
  currentBranch: string;
  defaultBranch: string;
  description: string;
  hasUpstream: boolean;
  id: string;
  language: string;
  lastActivityMessage: string | null;
  lastUpdated: string;
  localPath: string;
  name: string;
  openPullRequestCount: number;
  remoteUrl: string | null;
  relativePath?: string;
  reviewedByViewerCount: number;
  staleBranchCount: number;
  status: WorkspaceProjectStatus;
  team: string;
  unpushedCommitCount: number;
}

export interface WorkspaceReviewItem {
  author: string | null;
  branch: string;
  id: string;
  repo: string;
  status: WorkspaceReviewStatus;
  summary: string;
  updatedAt: string;
}

export interface WorkspaceActivityItem {
  author: string | null;
  description: string;
  id: string;
  repo: string;
  timestamp: string;
  title: string;
  type: WorkspaceActivityType;
}

export interface WorkspacePullRequestItem {
  author: string | null;
  authoredByViewer: boolean;
  baseBranch: string;
  ciStatus: WorkspaceCiStatus;
  headBranch: string;
  id: string;
  isViewerRequestedReviewer: boolean;
  number: number;
  projectId: string;
  repo: string;
  repositorySlug: string;
  reviewCount: number;
  reviewState: WorkspacePullRequestReviewState;
  reviewTimeline: WorkspacePullRequestReviewEvent[];
  requestedReviewerLogins: string[];
  reviewedByOthersCount: number;
  reviewedByViewer: boolean;
  reviewerLogins: string[];
  status: WorkspacePullRequestStatus;
  title: string;
  updatedAt: string;
  url: string;
}

export interface WorkspacePullRequestReviewEvent {
  id: string;
  reviewerLogin: string | null;
  state: string;
  submittedAt: string | null;
}

export interface WorkspaceGitHubStatus {
  authenticated: boolean;
  connectedRepositoryCount: number;
  message: string | null;
  state: WorkspaceGitHubState;
  viewerLogin: string | null;
}

export interface WorkspaceInsight {
  description: string;
  title: string;
}

export interface WorkspaceSnapshot {
  activities: WorkspaceActivityItem[];
  generatedAt: string;
  githubStatus: WorkspaceGitHubStatus;
  insights: {
    needsAttention: WorkspaceInsight[];
    recentHighlights: WorkspaceInsight[];
  };
  pullRequests: WorkspacePullRequestItem[];
  projects: WorkspaceProject[];
  reviews: WorkspaceReviewItem[];
  summary: {
    healthyRepositories: number;
    localBranches: number;
    openPullRequests: number;
    repositories: number;
    staleBranches: number;
  };
}
