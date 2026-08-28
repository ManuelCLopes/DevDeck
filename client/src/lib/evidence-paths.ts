/**
 * Evidence file paths are relative to the repository they were found in
 * (e.g. `"./cache.ts"` — both electron/repository-index/code-search.ts
 * search implementations return paths in that form). They only resolve
 * to a real file combined with that repository's absolute path, which
 * the renderer gets from `EvidenceForIssueResult.repositoryPathsBySnapshotId`
 * (shared/evidence.ts) keyed by the evidence item's `repositorySnapshotId`.
 *
 * Returns null when either half is missing — the caller (BacklogIssueDetail)
 * uses that to disable opening the file rather than handing Electron a bare
 * relative path, which would resolve against whatever directory the main
 * process happens to be running in instead of the intended repository.
 */
export function resolveEvidenceFilePath(
  repositoryPath: string | undefined,
  relativeFilePath: string | null,
): string | null {
  if (!repositoryPath || !relativeFilePath) {
    return null;
  }

  const normalizedRelative = relativeFilePath.replace(/^\.\//, "").replace(/^\/+/, "");
  const normalizedBase = repositoryPath.replace(/\/+$/, "");
  return `${normalizedBase}/${normalizedRelative}`;
}
