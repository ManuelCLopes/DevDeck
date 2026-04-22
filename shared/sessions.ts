export interface CreateGitWorktreeSessionRequest {
  baseRef: string;
  branchName: string;
  repositoryPath: string;
  sessionPath?: string | null;
}

export interface CreateGitWorktreeSessionResult {
  branchName: string;
  localPath: string;
}

export interface RemoveGitWorktreeSessionRequest {
  repositoryPath: string;
  worktreePath: string;
}

export interface InspectDevSessionRequest {
  localPath: string;
  repositoryPath: string;
  sessionId: string;
}

export interface DevSessionOperationalSnapshot {
  aheadBy: number;
  behindBy: number;
  currentBranch: string | null;
  defaultBranch: string | null;
  exists: boolean;
  hasUncommittedChanges: boolean;
  hasUpstream: boolean;
  isDetached: boolean;
  isRepository: boolean;
  lastCommitCommittedAt: string | null;
  lastCommitSha: string | null;
  lastCommitShortSha: string | null;
  lastCommitSubject: string | null;
  sessionId: string;
  uniqueCommitCount: number | null;
}
