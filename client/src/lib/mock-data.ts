export type ProjectStatus = 'healthy' | 'warning' | 'critical';

export interface Project {
  id: string;
  name: string;
  team: string;
  description: string;
  status: ProjectStatus;
  lastUpdated: string;
  openPRs: number;
  closedPRs7d: number;
  stalePRs: number;
  openIssues: number;
  staleIssues: number;
  latestRelease: string | null;
  releaseDate: string | null;
  buildStatus: 'success' | 'failed' | 'building' | 'unknown';
  unreviewedPRs: number;
  contributors7d: number;
  repositoryUrl: string;
  localPath: string;
}

export type PRStatus = 'needs_review' | 'changes_requested' | 'approved' | 'draft' | 'updated';
export type PRRole = 'reviewer' | 'author';

export interface PullRequest {
  id: string;
  title: string;
  repo: string;
  author: string;
  status: PRStatus;
  role: PRRole;
  createdAt: string;
  updatedAt: string;
  comments: number;
  unresolvedThreads: number;
  linesAdded: number;
  linesRemoved: number;
  actionableInsight?: string;
}

export const mockReviewMetrics = {
  pendingLoad: 4,
  completedThisWeek: 12,
  averageTurnaround: "3.2h",
  waitingOnAuthor: 2,
};

export const mockPullRequests: PullRequest[] = [
  {
    id: "pr-1042",
    title: "feat: implement local sync engine for repository discovery",
    repo: "core-api",
    author: "sarahj",
    status: "needs_review",
    role: "reviewer",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    comments: 0,
    unresolvedThreads: 0,
    linesAdded: 342,
    linesRemoved: 12,
    actionableInsight: "Waiting on you"
  },
  {
    id: "pr-1038",
    title: "fix: resolve memory leak in background worker",
    repo: "data-pipeline",
    author: "mike_chen",
    status: "updated",
    role: "reviewer",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    comments: 8,
    unresolvedThreads: 2,
    linesAdded: 45,
    linesRemoved: 89,
    actionableInsight: "Updated since your review"
  },
  {
    id: "pr-1045",
    title: "chore: update tailwind configuration for mac desktop native feel",
    repo: "web-dashboard",
    author: "alex_dev",
    status: "changes_requested",
    role: "reviewer",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    comments: 12,
    unresolvedThreads: 3,
    linesAdded: 120,
    linesRemoved: 40,
    actionableInsight: "Waiting on author"
  },
  {
    id: "pr-1048",
    title: "refactor: isolate macOS window controls component",
    repo: "web-dashboard",
    author: "you",
    status: "approved",
    role: "author",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    comments: 2,
    unresolvedThreads: 0,
    linesAdded: 85,
    linesRemoved: 20,
    actionableInsight: "Merge-ready after approval"
  },
  {
    id: "pr-1049",
    title: "feat: add desktop notification support",
    repo: "core-api",
    author: "you",
    status: "needs_review",
    role: "author",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    comments: 0,
    unresolvedThreads: 0,
    linesAdded: 210,
    linesRemoved: 5,
    actionableInsight: "Waiting for review"
  },
  {
    id: "pr-1051",
    title: "fix: correct sidebar spacing on smaller screens",
    repo: "web-dashboard",
    author: "jamie_t",
    status: "needs_review",
    role: "reviewer",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days old
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    comments: 1,
    unresolvedThreads: 0,
    linesAdded: 12,
    linesRemoved: 12,
    actionableInsight: "Stale review"
  }
];

export const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "core-api",
    team: "backend",
    description: "Main GraphQL API for the platform",
    status: "warning",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    openPRs: 12,
    closedPRs7d: 45,
    stalePRs: 3,
    openIssues: 24,
    staleIssues: 5,
    latestRelease: "v2.4.1",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    buildStatus: "success",
    unreviewedPRs: 4,
    contributors7d: 8,
    repositoryUrl: "github.com/org/core-api",
    localPath: "~/Developer/backend/core-api"
  },
  {
    id: "proj-2",
    name: "web-dashboard",
    team: "frontend",
    description: "Customer facing web application",
    status: "healthy",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    openPRs: 4,
    closedPRs7d: 32,
    stalePRs: 0,
    openIssues: 12,
    staleIssues: 1,
    latestRelease: "v1.12.0",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    buildStatus: "success",
    unreviewedPRs: 1,
    contributors7d: 5,
    repositoryUrl: "github.com/org/web-dashboard",
    localPath: "~/Developer/frontend/web-dashboard"
  },
  {
    id: "proj-3",
    name: "payment-service",
    team: "backend",
    description: "Handles Stripe and PayPal integrations",
    status: "critical",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    openPRs: 8,
    closedPRs7d: 2,
    stalePRs: 5,
    openIssues: 45,
    staleIssues: 18,
    latestRelease: "v0.9.4",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    buildStatus: "failed",
    unreviewedPRs: 6,
    contributors7d: 1,
    repositoryUrl: "github.com/org/payment-service",
    localPath: "~/Developer/backend/payment-service"
  },
  {
    id: "proj-4",
    name: "data-pipeline",
    team: "data",
    description: "ETL jobs and data processing",
    status: "healthy",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    openPRs: 2,
    closedPRs7d: 15,
    stalePRs: 0,
    openIssues: 8,
    staleIssues: 0,
    latestRelease: null,
    releaseDate: null,
    buildStatus: "building",
    unreviewedPRs: 0,
    contributors7d: 3,
    repositoryUrl: "github.com/org/data-pipeline",
    localPath: "~/Developer/data/data-pipeline"
  }
];

export const mockInsights = {
  needsAttention: [
    { title: "Payment Service Build Failing", description: "Local build failing for 2 days. 5 stale PRs blocking release." },
    { title: "Core API Review Bottleneck", description: "4 unreviewed PRs pending for over 48 hours." }
  ],
  inactiveRepos: [
    { name: "legacy-admin-panel", daysSinceActivity: 120 }
  ],
  recentHighlights: [
    { title: "Web Dashboard Release", description: "v1.12.0 deployed successfully 12 hours ago." },
    { title: "High Activity: iOS App", description: "28 PRs closed in the last 7 days by 6 contributors." }
  ]
};