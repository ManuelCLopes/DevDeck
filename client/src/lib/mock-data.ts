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
  },
  {
    id: "proj-5",
    name: "auth-gateway",
    team: "backend",
    description: "Centralized authentication and authorization",
    status: "warning",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    openPRs: 5,
    closedPRs7d: 10,
    stalePRs: 2,
    openIssues: 15,
    staleIssues: 2,
    latestRelease: "v3.0.1",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    buildStatus: "success",
    unreviewedPRs: 3,
    contributors7d: 4,
    repositoryUrl: "github.com/org/auth-gateway",
    localPath: "~/Developer/backend/auth-gateway"
  },
  {
    id: "proj-6",
    name: "ios-app",
    team: "mobile",
    description: "Native iOS application",
    status: "healthy",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    openPRs: 6,
    closedPRs7d: 28,
    stalePRs: 0,
    openIssues: 32,
    staleIssues: 4,
    latestRelease: "v4.2.0",
    releaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    buildStatus: "success",
    unreviewedPRs: 2,
    contributors7d: 6,
    repositoryUrl: "github.com/org/ios-app",
    localPath: "~/Developer/mobile/ios-app"
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