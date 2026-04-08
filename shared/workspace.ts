export type WorkspaceProjectStatus = "healthy" | "warning" | "critical";
export type WorkspaceReviewStatus = "active" | "stale";
export type WorkspaceActivityType = "commit" | "checkout" | "repo";
export type WorkspaceCommitIntegrationStatus =
  | "in_default_branch"
  | "not_in_default_branch"
  | "unknown";
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
export interface WorkspacePullRequestClaim {
  claimedAt: string;
  reviewerLogin: string;
}
export type WorkspaceAuthoredPullRequestStatus =
  | "draft"
  | "waiting_for_review"
  | "reviewed"
  | "changes_requested"
  | "approved"
  | "merged"
  | "closed";
export type WorkspaceAuthoredPullRequestOwnership = "viewer" | "automation";
export type WorkspaceGitHubState =
  | "connected"
  | "unauthenticated"
  | "error"
  | "unsupported";
export type WorkspaceSyncState = "fresh" | "stale" | "offline" | "error";

export interface MonitoredProject {
  collectionId?: string;
  collectionName?: string;
  githubRepositorySlug?: string;
  hidden?: boolean;
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
  githubLinkedRepositoryCount?: number;
  rootName: string;
  rootPath?: string;
}

export interface GitHubRepositoryCandidate {
  defaultBranch: string | null;
  description: string | null;
  id: string;
  isPrivate: boolean;
  name: string;
  slug: string;
  updatedAt: string;
  viewerPermission: string | null;
}

export interface GitHubTeamCandidate {
  id: string;
  memberCount: number | null;
  name: string;
  organizationLogin: string;
  slug: string;
}

export interface TeamInsightsMemberStats {
  activeClaimCount: number;
  averageFirstReviewHours: number | null;
  averageMergeHours: number | null;
  avatarUrl: string | null;
  commits: number;
  login: string;
  mergedPullRequests: number;
  name: string | null;
  openedPullRequests: number;
  reviewsSubmitted: number;
}

export interface TeamInsightsSnapshot {
  generatedAt: string;
  members: TeamInsightsMemberStats[];
  periodDays: number;
  summary: {
    activeClaims: number;
    averageFirstReviewHours: number | null;
    averageMergeHours: number | null;
    commits: number;
    members: number;
    mergedPullRequests: number;
    openedPullRequests: number;
    reviewsSubmitted: number;
  };
  team: GitHubTeamCandidate;
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
  commitIntegrationStatus?: WorkspaceCommitIntegrationStatus | null;
  commitSha?: string | null;
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
  claim: WorkspacePullRequestClaim | null;
  claimedByViewer: boolean;
  ciStatus: WorkspaceCiStatus;
  hasUpdatesSinceViewerReview: boolean;
  headBranch: string;
  id: string;
  isViewerRequestedReviewer: boolean;
  lastReviewedByViewerAt: string | null;
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

export interface WorkspaceAuthoredPullRequestItem {
  author: string | null;
  baseBranch: string;
  headBranch: string;
  id: string;
  number: number;
  ownership: WorkspaceAuthoredPullRequestOwnership;
  projectId: string;
  repo: string;
  repositorySlug: string;
  reviewCount: number;
  status: WorkspaceAuthoredPullRequestStatus;
  title: string;
  updatedAt: string;
  url: string;
}

export interface WorkspaceSyncStatus {
  lastAttemptedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  message: string | null;
  state: WorkspaceSyncState;
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

export interface WorkspaceUserActivityStats {
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  pullRequestsMerged: number;
  pullRequestsReviewed: number;
  reviewEvents: number;
}

export interface WorkspaceUserActivityPoint extends WorkspaceUserActivityStats {
  date: string;
}

export interface WorkspaceUserActivityPeriod extends WorkspaceUserActivityStats {
  points: WorkspaceUserActivityPoint[];
}

export interface WorkspaceUserActivitySummary {
  last7Days: WorkspaceUserActivityPeriod;
  last30Days: WorkspaceUserActivityPeriod;
  last90Days: WorkspaceUserActivityPeriod;
}

export interface WorkspaceSnapshot {
  activities: WorkspaceActivityItem[];
  authoredPullRequests: WorkspaceAuthoredPullRequestItem[];
  generatedAt: string;
  githubStatus: WorkspaceGitHubStatus;
  insights: {
    needsAttention: WorkspaceInsight[];
    recentHighlights: WorkspaceInsight[];
  };
  pullRequests: WorkspacePullRequestItem[];
  projects: WorkspaceProject[];
  reviews: WorkspaceReviewItem[];
  sync: WorkspaceSyncStatus;
  summary: {
    healthyRepositories: number;
    localBranches: number;
    openPullRequests: number;
    repositories: number;
    staleBranches: number;
  };
  userActivity: WorkspaceUserActivitySummary;
}
