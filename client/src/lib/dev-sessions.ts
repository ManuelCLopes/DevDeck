export type DevSessionKind = "existing_clone" | "worktree";
export type DevSessionStatus = "active" | "archived";

export interface DevSession {
  createdAt: string;
  id: string;
  kind: DevSessionKind;
  label: string;
  linkedPullRequestId: string | null;
  linkedPullRequestNumber: number | null;
  linkedPullRequestTitle: string | null;
  localPath: string;
  projectId: string;
  projectName: string;
  repositoryPath: string;
  repositorySlug: string | null;
  sessionBranchName: string;
  sourceRef: string | null;
  status: DevSessionStatus;
  updatedAt: string;
}

export const DEV_SESSIONS_STORAGE_KEY = "devdeck:dev-sessions";

export function slugifySessionValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "session";
}

export function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildCreateSessionPath(
  projectId?: string | null,
  pullRequestId?: string | null,
) {
  const params = new URLSearchParams();
  params.set("create", "1");
  if (projectId) {
    params.set("project", projectId);
  }
  if (pullRequestId) {
    params.set("pr", pullRequestId);
  }

  return `/sessions?${params.toString()}`;
}

export function buildDefaultSessionLabel(options: {
  kind: DevSessionKind;
  projectName: string;
  pullRequestNumber?: number | null;
  sessionBranchName?: string | null;
}) {
  if (options.pullRequestNumber) {
    return options.kind === "worktree"
      ? `Review #${options.pullRequestNumber}`
      : `Review #${options.pullRequestNumber} · Existing Clone`;
  }

  if (options.kind === "worktree" && options.sessionBranchName) {
    return `${options.projectName} · ${options.sessionBranchName}`;
  }

  return `${options.projectName} Session`;
}

export function buildDefaultSessionBranchName(options: {
  headBranch?: string | null;
  pullRequestNumber?: number | null;
  repositoryName: string;
}) {
  if (options.pullRequestNumber) {
    const headBranch = options.headBranch
      ? slugifySessionValue(options.headBranch)
      : "review";
    return `review-pr-${options.pullRequestNumber}-${headBranch}`;
  }

  return `worktree-${slugifySessionValue(options.repositoryName)}`;
}

export function normalizeDevSessions(rawValue: unknown): DevSession[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((value) => ({
      createdAt:
        typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
      id: typeof value.id === "string" ? value.id : createSessionId(),
      kind: (value.kind === "worktree" ? "worktree" : "existing_clone") as DevSessionKind,
      label: typeof value.label === "string" ? value.label : "Session",
      linkedPullRequestId:
        typeof value.linkedPullRequestId === "string" ? value.linkedPullRequestId : null,
      linkedPullRequestNumber:
        typeof value.linkedPullRequestNumber === "number"
          ? value.linkedPullRequestNumber
          : null,
      linkedPullRequestTitle:
        typeof value.linkedPullRequestTitle === "string"
          ? value.linkedPullRequestTitle
          : null,
      localPath: typeof value.localPath === "string" ? value.localPath : "",
      projectId: typeof value.projectId === "string" ? value.projectId : "",
      projectName: typeof value.projectName === "string" ? value.projectName : "Repository",
      repositoryPath:
        typeof value.repositoryPath === "string"
          ? value.repositoryPath
          : typeof value.localPath === "string"
            ? value.localPath
            : "",
      repositorySlug:
        typeof value.repositorySlug === "string" ? value.repositorySlug : null,
      sessionBranchName:
        typeof value.sessionBranchName === "string"
          ? value.sessionBranchName
          : "session",
      sourceRef: typeof value.sourceRef === "string" ? value.sourceRef : null,
      status: (value.status === "archived" ? "archived" : "active") as DevSessionStatus,
      updatedAt:
        typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    }))
    .filter((session) => session.localPath && session.projectId);
}

export function sortDevSessions(sessions: DevSession[]) {
  return [...sessions].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }

    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });
}

export function getActiveDevSessions(sessions: DevSession[]) {
  return sortDevSessions(sessions).filter((session) => session.status === "active");
}

export function findPullRequestDevSession(
  sessions: DevSession[],
  pullRequestId: string | null | undefined,
) {
  if (!pullRequestId) {
    return null;
  }

  return (
    getActiveDevSessions(sessions).find(
      (session) => session.linkedPullRequestId === pullRequestId,
    ) ?? null
  );
}

export function findProjectDevSession(
  sessions: DevSession[],
  projectId: string | null | undefined,
) {
  if (!projectId) {
    return null;
  }

  const matchingSessions = getActiveDevSessions(sessions).filter(
    (session) => session.projectId === projectId,
  );
  if (matchingSessions.length === 0) {
    return null;
  }

  return (
    matchingSessions.find((session) => session.linkedPullRequestId === null) ??
    matchingSessions[0] ??
    null
  );
}

export function findDuplicateDevSession(
  sessions: DevSession[],
  candidate: {
    kind: DevSessionKind;
    linkedPullRequestId?: string | null;
    projectId: string;
    sessionBranchName?: string | null;
  },
) {
  const activeSessions = getActiveDevSessions(sessions).filter(
    (session) =>
      session.kind === candidate.kind && session.projectId === candidate.projectId,
  );

  if (candidate.kind === "existing_clone") {
    return (
      activeSessions.find(
        (session) =>
          (session.linkedPullRequestId ?? null) ===
          (candidate.linkedPullRequestId ?? null),
      ) ?? null
    );
  }

  return (
    activeSessions.find(
      (session) =>
        (session.linkedPullRequestId ?? null) ===
          (candidate.linkedPullRequestId ?? null) &&
        session.sessionBranchName === (candidate.sessionBranchName ?? ""),
    ) ?? null
  );
}
