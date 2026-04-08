const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";

export interface GitHubApiViewer {
  login: string;
}

export interface GitHubApiRepository {
  default_branch: string | null;
  description: string | null;
  full_name: string;
  html_url: string;
  name: string;
  private: boolean;
  pushed_at: string | null;
  updated_at: string;
  viewer_permission?: {
    permission: string | null;
  } | null;
}

export interface GitHubApiOrganizationMembership {
  organization: {
    login: string;
  };
  role: string | null;
  state: string;
}

export interface GitHubApiTeam {
  id: number;
  members_count?: number;
  name: string;
  organization?: {
    login: string;
  } | null;
  slug: string;
}

export interface GitHubApiTeamMember {
  avatar_url: string | null;
  login: string;
}

export interface GitHubApiPullRequestReview {
  id: number;
  state: string;
  submitted_at: string | null;
  user: { login: string } | null;
}

export interface GitHubApiIssueComment {
  body: string;
  created_at: string;
  id: number;
  updated_at: string;
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

export interface GitHubApiPullRequestCommit {
  author: { login: string } | null;
  commit: {
    author: {
      email: string | null;
    } | null;
    committer: {
      email: string | null;
    } | null;
  };
  committer: { login: string } | null;
  sha: string;
}

export interface GitHubApiPullRequestSearchItem {
  closed_at: string | null;
  html_url: string;
  number: number;
  repository_url: string;
  title: string;
  updated_at: string;
  user: { login: string } | null;
}

export interface GitHubApiRepositoryCommitHistoryItem {
  additions: number;
  author: {
    email: string | null;
    user: {
      login: string;
    } | null;
  } | null;
  committedDate: string;
  deletions: number;
  oid: string;
}

export interface GitHubTeamContributionMember {
  avatarUrl: string | null;
  averageFirstReviewHours: number | null;
  averageMergeHours: number | null;
  commits: number;
  login: string;
  mergedPullRequests: number;
  name: string | null;
  openedPullRequests: number;
  reviewsSubmitted: number;
}

interface GitHubApiRepositoryCommitHistoryResponse {
  items: GitHubApiRepositoryCommitHistoryItem[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
  viewerPossibleCommitEmails: string[];
}

interface GitHubApiSearchResponse<TItem> {
  incomplete_results: boolean;
  items: TItem[];
  total_count: number;
}

interface GitHubGraphQLError {
  message: string;
}

interface GitHubGraphQLResponse<TData> {
  data?: TData;
  errors?: GitHubGraphQLError[];
}

interface GitHubApiTeamContributionSearchPullRequestNode {
  createdAt: string;
  mergedAt: string | null;
  reviews: {
    nodes: Array<{
      submittedAt: string | null;
    } | null>;
  };
}

interface GitHubApiRequestOptions {
  allowPublicFallback?: boolean;
  body?: string;
  method?: string;
  overrideAccept?: string;
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
      Accept: options?.overrideAccept ?? "application/vnd.github+json",
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

async function githubGraphqlRequest<TData>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  options?: Pick<GitHubApiRequestOptions, "timeoutMs">,
) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    options?.timeoutMs ?? 8000,
  );

  try {
    const response = await fetch(`${GITHUB_API_BASE_URL}/graphql`, {
      body: JSON.stringify({ query, variables }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      method: "POST",
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new GitHubApiError(
        errorText || `GitHub API request failed with status ${response.status}.`,
        response.status,
      );
    }

    const payload = (await response.json()) as GitHubGraphQLResponse<TData>;
    if (payload.errors?.length) {
      throw new GitHubApiError(
        payload.errors.map((error) => error.message).join(" "),
        400,
      );
    }

    if (!payload.data) {
      throw new GitHubApiError("GitHub GraphQL response did not include data.", 500);
    }

    return payload.data;
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

export async function fetchGitHubViewerRepositories(
  token: string,
  options?: {
    page?: number;
    perPage?: number;
  },
) {
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 100;
  return githubApiRequest<GitHubApiRepository[]>(
    `/user/repos?sort=updated&affiliation=owner,collaborator,organization_member&per_page=${perPage}&page=${page}`,
    token,
    { timeoutMs: 8000 },
  );
}

export async function fetchGitHubViewerOrganizationMemberships(token: string) {
  return githubApiRequest<GitHubApiOrganizationMembership[]>(
    "/user/memberships/orgs?state=active&per_page=100",
    token,
    { timeoutMs: 8000 },
  );
}

export async function fetchGitHubOrganizationTeams(
  organizationLogin: string,
  token: string,
) {
  return githubApiRequest<GitHubApiTeam[]>(
    `/orgs/${organizationLogin}/teams?per_page=100`,
    token,
    { timeoutMs: 8000 },
  );
}

export async function fetchGitHubTeamMembers(
  organizationLogin: string,
  teamSlug: string,
  token: string,
) {
  return githubApiRequest<GitHubApiTeamMember[]>(
    `/orgs/${organizationLogin}/teams/${teamSlug}/members?per_page=100`,
    token,
    { timeoutMs: 8000 },
  );
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

function chunkArray<TItem>(items: TItem[], chunkSize: number) {
  const result: TItem[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    result.push(items.slice(index, index + chunkSize));
  }

  return result;
}

function getAverageHours(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

export async function fetchGitHubTeamContributionMembers(
  memberLogins: string[],
  token: string,
  options: {
    from: string;
    to?: string;
  },
) {
  const uniqueMemberLogins = Array.from(
    new Set(
      memberLogins
        .map((login) => login.trim())
        .filter(Boolean),
    ),
  );

  if (uniqueMemberLogins.length === 0) {
    return [] satisfies GitHubTeamContributionMember[];
  }

  const to = options.to ?? new Date().toISOString();
  const mergedFromDate = options.from.slice(0, 10);
  const mergedToDate = to.slice(0, 10);
  const metrics = new Map<string, GitHubTeamContributionMember>();

  for (const login of uniqueMemberLogins) {
    metrics.set(login, {
      avatarUrl: null,
      averageFirstReviewHours: null,
      averageMergeHours: null,
      commits: 0,
      login,
      mergedPullRequests: 0,
      name: null,
      openedPullRequests: 0,
      reviewsSubmitted: 0,
    });
  }

  for (const loginChunk of chunkArray(uniqueMemberLogins, 10)) {
    const querySections: string[] = [];

    loginChunk.forEach((login, index) => {
      const memberAlias = `member${index}`;
      const mergedAlias = `merged${index}`;
      const authoredPullRequestsAlias = `authoredPullRequests${index}`;
      const mergedSearchQuery = `is:pr is:merged author:${login} merged:${mergedFromDate}..${mergedToDate}`;
      const authoredSearchQuery = `is:pr author:${login} created:${mergedFromDate}..${mergedToDate}`;

      querySections.push(`
        ${memberAlias}: user(login: ${JSON.stringify(login)}) {
          login
          name
          avatarUrl(size: 64)
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
          }
        }
        ${mergedAlias}: search(query: ${JSON.stringify(mergedSearchQuery)}, type: ISSUE) {
          issueCount
        }
        ${authoredPullRequestsAlias}: search(query: ${JSON.stringify(authoredSearchQuery)}, type: ISSUE, first: 50) {
          nodes {
            ... on PullRequest {
              createdAt
              mergedAt
              reviews(first: 100) {
                nodes {
                  submittedAt
                }
              }
            }
          }
        }
      `);
    });

    const data = await githubGraphqlRequest<Record<string, any>>(
      `
        query TeamContributionMembers($from: DateTime!, $to: DateTime!) {
          ${querySections.join("\n")}
        }
      `,
      {
        from: options.from,
        to,
      },
      token,
    );

    loginChunk.forEach((login, index) => {
      const memberAlias = `member${index}`;
      const mergedAlias = `merged${index}`;
      const authoredPullRequestsAlias = `authoredPullRequests${index}`;
      const memberData = data[memberAlias] as
        | {
            avatarUrl?: string | null;
            contributionsCollection?: {
              totalCommitContributions?: number | null;
              totalPullRequestContributions?: number | null;
              totalPullRequestReviewContributions?: number | null;
            } | null;
            login?: string | null;
            name?: string | null;
          }
        | null
        | undefined;
      const mergedData = data[mergedAlias] as { issueCount?: number | null } | null | undefined;
      const authoredPullRequestsData = data[authoredPullRequestsAlias] as
        | {
            nodes?: Array<GitHubApiTeamContributionSearchPullRequestNode | null> | null;
          }
        | null
        | undefined;
      const existingMetric = metrics.get(login);

      if (!existingMetric || !memberData?.login) {
        return;
      }

      const authoredPullRequests =
        authoredPullRequestsData?.nodes?.filter(
          (
            node,
          ): node is GitHubApiTeamContributionSearchPullRequestNode => Boolean(node),
        ) ?? [];
      const firstReviewHours = authoredPullRequests
        .map((pullRequest) => {
          const firstReviewTimestamp = pullRequest.reviews.nodes
            .filter((review): review is { submittedAt: string | null } => Boolean(review))
            .map((review) => review.submittedAt)
            .filter((submittedAt): submittedAt is string => Boolean(submittedAt))
            .sort()[0];

          if (!firstReviewTimestamp) {
            return null;
          }

          return (
            (new Date(firstReviewTimestamp).getTime() -
              new Date(pullRequest.createdAt).getTime()) /
            (1000 * 60 * 60)
          );
        })
        .filter((value): value is number => value !== null && value >= 0);
      const mergeHours = authoredPullRequests
        .map((pullRequest) => {
          if (!pullRequest.mergedAt) {
            return null;
          }

          return (
            (new Date(pullRequest.mergedAt).getTime() -
              new Date(pullRequest.createdAt).getTime()) /
            (1000 * 60 * 60)
          );
        })
        .filter((value): value is number => value !== null && value >= 0);

      metrics.set(login, {
        avatarUrl: memberData.avatarUrl ?? existingMetric.avatarUrl,
        averageFirstReviewHours:
          getAverageHours(firstReviewHours) ?? existingMetric.averageFirstReviewHours,
        averageMergeHours:
          getAverageHours(mergeHours) ?? existingMetric.averageMergeHours,
        commits:
          memberData.contributionsCollection?.totalCommitContributions ??
          existingMetric.commits,
        login: memberData.login,
        mergedPullRequests: mergedData?.issueCount ?? existingMetric.mergedPullRequests,
        name: memberData.name ?? existingMetric.name,
        openedPullRequests:
          memberData.contributionsCollection?.totalPullRequestContributions ??
          existingMetric.openedPullRequests,
        reviewsSubmitted:
          memberData.contributionsCollection?.totalPullRequestReviewContributions ??
          existingMetric.reviewsSubmitted,
      });
    });
  }

  return uniqueMemberLogins
    .map((login) => metrics.get(login))
    .filter((metric): metric is GitHubTeamContributionMember => Boolean(metric));
}

export function fetchGitHubPullRequestSearchResults(
  query: string,
  token: string,
  options?: {
    page?: number;
    perPage?: number;
  },
) {
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 100;
  return githubApiRequest<GitHubApiSearchResponse<GitHubApiPullRequestSearchItem>>(
    `/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`,
    token,
    { allowPublicFallback: true },
  );
}

export async function fetchGitHubViewerCommitRepositories(
  token: string,
  options: {
    from: string;
    maxRepositories?: number;
    to?: string;
  },
) {
  const data = await githubGraphqlRequest<{
    viewer: {
      contributionsCollection: {
        commitContributionsByRepository: Array<{
          repository: {
            nameWithOwner: string;
          } | null;
        }>;
      };
      id: string;
    };
  }>(
    `
      query ViewerCommitRepositories($from: DateTime!, $to: DateTime!, $maxRepositories: Int!) {
        viewer {
          id
          contributionsCollection(from: $from, to: $to) {
            commitContributionsByRepository(maxRepositories: $maxRepositories) {
              repository {
                nameWithOwner
              }
            }
          }
        }
      }
    `,
    {
      from: options.from,
      maxRepositories: options.maxRepositories ?? 100,
      to: options.to ?? new Date().toISOString(),
    },
    token,
  );

  return {
    repositorySlugs: Array.from(
      new Set(
        data.viewer.contributionsCollection.commitContributionsByRepository
          .map((item) => item.repository?.nameWithOwner ?? null)
          .filter((repositorySlug): repositorySlug is string =>
            Boolean(repositorySlug),
          ),
      ),
    ),
  };
}

function parseRepositorySlug(repositorySlug: string) {
  const [owner, ...repoParts] = repositorySlug.split("/");
  const repo = repoParts.join("/");
  if (!owner || !repo) {
    throw new GitHubApiError(`Invalid repository slug: ${repositorySlug}`, 400);
  }

  return { owner, repo };
}

export async function fetchGitHubRepositoryCommitHistory(
  repositorySlug: string,
  token: string,
  options: {
    after?: string | null;
    first?: number;
    since: string;
  },
) {
  const { owner, repo } = parseRepositorySlug(repositorySlug);
  const data = await githubGraphqlRequest<{
    repository: {
      viewerPossibleCommitEmails: string[];
      defaultBranchRef: {
        target: {
          history: {
            nodes: Array<{
              additions: number;
              author: {
                email: string | null;
                user: {
                  login: string;
                } | null;
              } | null;
              committedDate: string;
              deletions: number;
              oid: string;
            } | null>;
            pageInfo: {
              endCursor: string | null;
              hasNextPage: boolean;
            };
          };
        } | null;
      } | null;
    } | null;
  }>(
    `
      query RepositoryCommitHistory(
        $after: String
        $first: Int!
        $name: String!
        $owner: String!
        $since: GitTimestamp!
      ) {
        repository(owner: $owner, name: $name) {
          viewerPossibleCommitEmails
          defaultBranchRef {
            target {
              ... on Commit {
                history(
                  after: $after
                  first: $first
                  since: $since
                ) {
                  pageInfo {
                    endCursor
                    hasNextPage
                  }
                  nodes {
                    additions
                    author {
                      email
                      user {
                        login
                      }
                    }
                    committedDate
                    deletions
                    oid
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      after: options.after ?? null,
      first: options.first ?? 100,
      name: repo,
      owner,
      since: options.since,
    },
    token,
  );

  return {
    items:
      data.repository?.defaultBranchRef?.target?.history.nodes.filter(
        (node): node is GitHubApiRepositoryCommitHistoryItem => Boolean(node),
      ) ?? [],
    pageInfo: data.repository?.defaultBranchRef?.target?.history.pageInfo ?? {
      endCursor: null,
      hasNextPage: false,
    },
    viewerPossibleCommitEmails: data.repository?.viewerPossibleCommitEmails ?? [],
  } satisfies GitHubApiRepositoryCommitHistoryResponse;
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

export function fetchGitHubIssueComments(
  repositorySlug: string,
  issueNumber: number,
  token: string,
) {
  return githubApiRequest<GitHubApiIssueComment[]>(
    `/repos/${repositorySlug}/issues/${issueNumber}/comments?per_page=100`,
    token,
    { allowPublicFallback: true },
  );
}

export function fetchGitHubPullRequestCommits(
  repositorySlug: string,
  pullRequestNumber: number,
  token: string,
) {
  return githubApiRequest<GitHubApiPullRequestCommit[]>(
    `/repos/${repositorySlug}/pulls/${pullRequestNumber}/commits?per_page=100`,
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

export async function deleteGitHubIssueComment(
  repositorySlug: string,
  commentId: number,
  token: string,
) {
  await githubApiRequest<void>(
    `/repos/${repositorySlug}/issues/comments/${commentId}`,
    token,
    {
      method: "DELETE",
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
