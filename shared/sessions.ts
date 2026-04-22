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
