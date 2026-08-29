import { fetchGitHubPullRequestSearchResults } from "../github-api";
import { readStoredGitHubToken } from "../github-auth";

export interface GitHubPrEvidenceMatch {
  htmlUrl: string;
  number: number;
  repositorySlug: string;
  title: string;
  updatedAt: string;
}

/**
 * GitHub PR search evidence (BI-042), reusing the existing GitHub client
 * and stored token (electron/github-api.ts, electron/github-auth.ts) —
 * no second GitHub integration. Returns an empty list, never throws, on
 * a missing token or a GitHub failure: "GitHub failure continues with
 * local Git" (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 25)
 * — evidence gathering as a whole must not fail because GitHub is
 * unreachable or unconfigured.
 */
export async function searchGitHubPullRequestsForIssueKey(
  githubRepositorySlug: string,
  issueKey: string,
): Promise<GitHubPrEvidenceMatch[]> {
  const token = await readStoredGitHubToken();
  if (!token) {
    return [];
  }

  const query = `repo:${githubRepositorySlug} is:pr "${issueKey}" in:title,body`;

  try {
    const response = await fetchGitHubPullRequestSearchResults(query, token, { perPage: 20 });
    return response.items.map((item) => ({
      htmlUrl: item.html_url,
      number: item.number,
      repositorySlug: githubRepositorySlug,
      title: item.title,
      updatedAt: item.updated_at,
    }));
  } catch {
    return [];
  }
}
