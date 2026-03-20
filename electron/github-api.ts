const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";

export interface GitHubApiViewer {
  login: string;
}

export interface GitHubApiPullRequestReview {
  id: number;
  state: string;
  submitted_at: string | null;
  user: { login: string } | null;
}

export interface GitHubApiPullRequest {
  base: { ref: string };
  closed_at: string | null;
  draft: boolean;
  head: {
    ref: string;
    sha: string;
  };
  html_url: string;
  merged_at: string | null;
  number: number;
  requested_reviewers: Array<{ login: string }>;
  state: "open" | "closed";
  title: string;
  updated_at: string;
  user: { login: string } | null;
}

interface GitHubApiRequestOptions {
  allowPublicFallback?: boolean;
  body?: string;
  method?: string;
  timeoutMs?: number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubConnectivityError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GitHubConnectivityError";
  }
}

function isConnectivityFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const causeCode =
    typeof (error as Error & { cause?: { code?: unknown } }).cause?.code === "string"
      ? ((error as Error & { cause?: { code?: string } }).cause?.code ?? "").toUpperCase()
      : "";

  return (
    message.includes("fetch failed") ||
    message.includes("timed out") ||
    causeCode === "ENOTFOUND" ||
    causeCode === "ECONNRESET" ||
    causeCode === "ECONNREFUSED" ||
    causeCode === "ETIMEDOUT"
  );
}

async function githubApiRequest<T>(
  pathname: string,
  token: string | null,
  options?: GitHubApiRequestOptions,
) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    options?.timeoutMs ?? 8000,
  );

  try {
    const requestUrl = `${GITHUB_API_BASE_URL}${pathname}`;
    const method = options?.method ?? "GET";
    const createHeaders = (includeAuthorization: boolean) => ({
      Accept: "application/vnd.github+json",
      ...(includeAuthorization && token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    });
    const request = (includeAuthorization: boolean) =>
      fetch(requestUrl, {
        body: options?.body,
        headers: createHeaders(includeAuthorization),
        method,
        signal: abortController.signal,
      });
    let response = await request(true);

    if (
      !response.ok &&
      options?.allowPublicFallback &&
      token &&
      method === "GET" &&
      (response.status === 403 || response.status === 404)
    ) {
      response = await request(false);
    }

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new GitHubApiError(
        errorText || `GitHub API request failed with status ${response.status}.`,
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof GitHubApiError || error instanceof GitHubConnectivityError) {
      throw error;
    }

    if (abortController.signal.aborted || isConnectivityFailure(error)) {
      throw new GitHubConnectivityError(
        "GitHub could not be reached. Check your connection and retry.",
        { cause: error },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function fetchGitHubViewer(token: string) {
  return githubApiRequest<GitHubApiViewer>("/user", token, {
    timeoutMs: 5000,
  });
}

export function fetchGitHubPullRequests(
  repositorySlug: string,
  token: string,
  options?: {
    perPage?: number;
    state?: "all" | "closed" | "open";
  },
) {
  const state = options?.state ?? "open";
  const perPage = options?.perPage ?? 20;
  return githubApiRequest<GitHubApiPullRequest[]>(
    `/repos/${repositorySlug}/pulls?state=${state}&sort=updated&direction=desc&per_page=${perPage}`,
    token,
    { allowPublicFallback: true },
  );
}

export function fetchGitHubPullRequestReviews(
  repositorySlug: string,
  pullRequestNumber: number,
  token: string,
) {
  return githubApiRequest<GitHubApiPullRequestReview[]>(
    `/repos/${repositorySlug}/pulls/${pullRequestNumber}/reviews?per_page=100`,
    token,
    { allowPublicFallback: true },
  );
}

export async function fetchGitHubCommitStatus(
  repositorySlug: string,
  ref: string,
  token: string,
) {
  const encodedRef = encodeURIComponent(ref);
  const response = await githubApiRequest<{ state: string | null }>(
    `/repos/${repositorySlug}/commits/${encodedRef}/status`,
    token,
    { allowPublicFallback: true },
  );

  return response.state ?? null;
}

export async function createGitHubPullRequestComment(
  repositorySlug: string,
  pullRequestNumber: number,
  body: string,
  token: string,
) {
  await githubApiRequest<{ id: number }>(
    `/repos/${repositorySlug}/issues/${pullRequestNumber}/comments`,
    token,
    {
      body: JSON.stringify({ body }),
      method: "POST",
    },
  );
}

export async function requestGitHubPullRequestReviewers(
  repositorySlug: string,
  pullRequestNumber: number,
  reviewers: string[],
  token: string,
) {
  await githubApiRequest<{ requested_reviewers: Array<{ login: string }> }>(
    `/repos/${repositorySlug}/pulls/${pullRequestNumber}/requested_reviewers`,
    token,
    {
      body: JSON.stringify({ reviewers }),
      method: "POST",
    },
  );
}
