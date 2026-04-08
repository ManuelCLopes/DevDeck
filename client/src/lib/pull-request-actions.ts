import { getDesktopApi } from "@/lib/desktop";
import type { WorkspacePullRequestItem } from "@shared/workspace";

export function parseReviewerLogins(input: string) {
  const seenLogins = new Set<string>();

  for (const rawSegment of input.split(/[,\s]+/)) {
    const normalizedLogin = rawSegment.trim().replace(/^@+/, "");
    if (!normalizedLogin) {
      continue;
    }

    seenLogins.add(normalizedLogin);
  }

  return Array.from(seenLogins);
}

export async function setPullRequestClaimed(
  pullRequest: Pick<WorkspacePullRequestItem, "number" | "repo" | "repositorySlug">,
  claimed: boolean,
) {
  const desktopApi = getDesktopApi();
  if (!desktopApi || !pullRequest.repositorySlug) {
    throw new Error("Shared review claims are only available in the desktop app.");
  }

  if (claimed) {
    await desktopApi.claimPullRequestReview({
      pullRequestNumber: pullRequest.number,
      repositorySlug: pullRequest.repositorySlug,
    });
    return;
  }

  await desktopApi.unclaimPullRequestReview({
    pullRequestNumber: pullRequest.number,
    repositorySlug: pullRequest.repositorySlug,
  });
}
