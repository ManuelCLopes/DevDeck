/**
 * Evidence file paths are relative to the repository they were found in
 * (e.g. `"cache.ts"` — electron/repository-index/code-search.ts's real-
 * ripgrep and Node-fallback implementations both return paths in that
 * form, with any leading `"./"` stripped for consistency across
 * ripgrep versions/builds). They only resolve to a real file combined
 * with that repository's absolute path, which the renderer gets from
 * `EvidenceForIssueResult.repositoryPathsBySnapshotId` (shared/evidence.ts)
 * keyed by the evidence item's `repositorySnapshotId`.
 *
 * Still tolerates a leading `"./"` on the way in (older persisted
 * evidence rows may have one) rather than assuming the normalisation
 * above always ran.
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
