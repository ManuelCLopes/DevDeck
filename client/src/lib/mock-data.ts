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
}

export const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "core-api",
    team: "Backend",
    description: "Main GraphQL API for the platform",
    status: "warning",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
    openPRs: 12,
    closedPRs7d: 45,
    stalePRs: 3,
    openIssues: 24,
    staleIssues: 5,
    latestRelease: "v2.4.1",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    buildStatus: "success",
    unreviewedPRs: 4,
    contributors7d: 8,
    repositoryUrl: "github.com/org/core-api"
  },
  {
    id: "proj-2",
    name: "web-dashboard",
    team: "Frontend",
    description: "Customer facing web application",
    status: "healthy",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    openPRs: 4,
    closedPRs7d: 32,
    stalePRs: 0,
    openIssues: 12,
    staleIssues: 1,
    latestRelease: "v1.12.0",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago
    buildStatus: "success",
    unreviewedPRs: 1,
    contributors7d: 5,
    repositoryUrl: "github.com/org/web-dashboard"
  },
  {
    id: "proj-3",
    name: "payment-service",
    team: "FinTech",
    description: "Handles Stripe and PayPal integrations",
    status: "critical",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    openPRs: 8,
    closedPRs7d: 2,
    stalePRs: 5,
    openIssues: 45,
    staleIssues: 18,
    latestRelease: "v0.9.4",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(), // 45 days ago
    buildStatus: "failed",
    unreviewedPRs: 6,
    contributors7d: 1,
    repositoryUrl: "github.com/org/payment-service"
  },
  {
    id: "proj-4",
    name: "data-pipeline",
    team: "Data",
    description: "ETL jobs and data processing",
    status: "healthy",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
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
    repositoryUrl: "github.com/org/data-pipeline"
  },
  {
    id: "proj-5",
    name: "auth-gateway",
    team: "Security",
    description: "Centralized authentication and authorization",
    status: "warning",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    openPRs: 5,
    closedPRs7d: 10,
    stalePRs: 2,
    openIssues: 15,
    staleIssues: 2,
    latestRelease: "v3.0.1",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 7 days ago
    buildStatus: "success",
    unreviewedPRs: 3,
    contributors7d: 4,
    repositoryUrl: "github.com/org/auth-gateway"
  },
  {
    id: "proj-6",
    name: "ios-app",
    team: "Mobile",
    description: "Native iOS application",
    status: "healthy",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
    openPRs: 6,
    closedPRs7d: 28,
    stalePRs: 0,
    openIssues: 32,
    staleIssues: 4,
    latestRelease: "v4.2.0",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(), // 14 days ago
    buildStatus: "success",
    unreviewedPRs: 2,
    contributors7d: 6,
    repositoryUrl: "github.com/org/ios-app"
  }
];

export const mockInsights = {
  needsAttention: [
    { title: "Payment Service Build Failing", description: "Main branch has been failing for 2 days. 5 stale PRs blocking release." },
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
