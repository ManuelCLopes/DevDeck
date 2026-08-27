import type {
  JiraChangelogEntry,
  JiraComment,
  JiraConnectionCredentials,
  JiraConnectionHealth,
  JiraIssueDetail,
  JiraIssueType,
  JiraRemoteProject,
  JiraSearchPage,
  JiraSearchRequest,
} from "../../shared/jira";
import { buildJiraApiError, JiraApiError, JiraConnectivityError } from "./jira-errors";
import {
  JIRA_SEARCH_FIELDS,
  normalizeComment,
  normalizeJiraChangelogEntries,
  normalizeJiraIssue,
  type JiraApiChangelogEntry,
  type JiraApiComment,
  type JiraApiIssue,
} from "./jira-normalizer";

/**
 * Jira Cloud REST API v3 client. Read-only by construction: every
 * exported function issues a GET, or a POST to Jira's /search endpoint
 * (which is a query, not a mutation — Jira put search behind POST so
 * long JQL strings don't hit URL length limits). There is no function
 * here that could change Jira state; write-back is a separate module
 * that does not exist yet (M7 / Phase 7).
 *
 * Resilience follows
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 13: retry only
 * transient failures (429 and 5xx, plus connectivity/timeout), honour
 * `Retry-After`, exponential backoff with jitter, bounded attempts,
 * per-request timeout via AbortSignal.
 */

export interface JiraClientRequestOptions {
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  /** Injectable delay for tests — defaults to a real setTimeout-based wait. */
  wait?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_DELAY_MS = 300;
// 501 (Not Implemented) is deliberately excluded — it means the server
// doesn't support this request at all, which retrying can't fix.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectivityFailure(error: unknown): boolean {
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

function buildAuthHeader(credentials: JiraConnectionCredentials): string {
  const raw = `${credentials.accountEmail}:${credentials.apiToken}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

function buildRequestUrl(baseUrl: string, pathname: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}${pathname}`;
}

/**
 * Exported for direct unit testing of the backoff curve without needing
 * to wait in real time. `Retry-After` (seconds) always wins when present
 * — Jira knows better than our guess how long it needs.
 */
export function computeJiraRetryDelayMs(
  attempt: number,
  retryAfterSeconds: number | null,
  baseDelayMs: number = DEFAULT_RETRY_BASE_DELAY_MS,
): number {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, retryAfterSeconds) * 1000;
  }

  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * exponential * 0.25;
  return Math.round(exponential + jitter);
}

interface JiraApiRequestOptions extends JiraClientRequestOptions {
  body?: unknown;
  method?: string;
}

async function jiraApiRequest<T>(
  credentials: JiraConnectionCredentials,
  pathname: string,
  options: JiraApiRequestOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const wait = options.wait ?? defaultWait;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(buildRequestUrl(credentials.baseUrl, pathname), {
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        headers: {
          Accept: "application/json",
          Authorization: buildAuthHeader(credentials),
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        method: options.method ?? "GET",
        signal: abortController.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text();

        if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSeconds =
            retryAfterHeader !== null && Number.isFinite(Number(retryAfterHeader))
              ? Number(retryAfterHeader)
              : null;
          await wait(
            computeJiraRetryDelayMs(attempt, retryAfterSeconds, options.retryBaseDelayMs),
          );
          continue;
        }

        throw buildJiraApiError(response.status, bodyText);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof JiraApiError) {
        throw error;
      }

      const connectivityFailure =
        abortController.signal.aborted || isConnectivityFailure(error);
      if (connectivityFailure && attempt < maxAttempts) {
        await wait(computeJiraRetryDelayMs(attempt, null, options.retryBaseDelayMs));
        continue;
      }
      if (connectivityFailure) {
        throw new JiraConnectivityError(
          "Jira could not be reached. Check your connection and retry.",
          { cause: error },
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Unreachable in practice (every loop iteration either returns or
  // throws), but keeps this an exhaustive function under strict mode.
  throw new JiraConnectivityError("Jira request failed after all retry attempts.");
}

export async function testConnection(
  credentials: JiraConnectionCredentials,
  options?: JiraClientRequestOptions,
): Promise<JiraConnectionHealth> {
  try {
    const me = await jiraApiRequest<{ displayName?: string }>(
      credentials,
      "/rest/api/3/myself",
      options,
    );
    return { displayName: me.displayName ?? null, ok: true, reason: null };
  } catch (error) {
    if (error instanceof JiraApiError || error instanceof JiraConnectivityError) {
      return { displayName: null, ok: false, reason: error.message };
    }
    return { displayName: null, ok: false, reason: "Could not test the Jira connection." };
  }
}

interface JiraApiProjectSearchResponse {
  isLast: boolean;
  values: Array<{ id: string; key: string; name: string }>;
}

/** Bounds pagination so a pathological/misbehaving response can't loop forever. */
const MAX_PROJECT_SEARCH_PAGES = 40;

export async function listProjects(
  credentials: JiraConnectionCredentials,
  options?: JiraClientRequestOptions,
): Promise<JiraRemoteProject[]> {
  const projects: JiraRemoteProject[] = [];
  let startAt = 0;
  const maxResults = 50;

  for (let page = 0; page < MAX_PROJECT_SEARCH_PAGES; page += 1) {
    const response = await jiraApiRequest<JiraApiProjectSearchResponse>(
      credentials,
      `/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`,
      options,
    );

    projects.push(
      ...response.values.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
      })),
    );

    if (response.isLast || response.values.length === 0) {
      break;
    }
    startAt += response.values.length;
  }

  return projects;
}

export async function listIssueTypes(
  credentials: JiraConnectionCredentials,
  projectKeyOrId: string,
  options?: JiraClientRequestOptions,
): Promise<JiraIssueType[]> {
  const project = await jiraApiRequest<{
    issueTypes?: Array<{ id: string; name: string; subtask: boolean }>;
  }>(credentials, `/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}`, options);

  return (project.issueTypes ?? []).map((issueType) => ({
    id: issueType.id,
    name: issueType.name,
    subtask: issueType.subtask,
  }));
}

interface JiraApiSearchResponse {
  issues: JiraApiIssue[];
  maxResults: number;
  startAt: number;
  total: number;
}

/**
 * Adapts the documented `JiraClient.searchIssues(request)` interface
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 13) with one
 * addition: `projectId`, DevDeck's *local* `jira_projects.id` — the
 * client has no way to know it from Jira's response alone, and every
 * caller (jira-sync.ts) already has it, so normalisation stays here
 * instead of leaking raw Jira wire types further out.
 */
export async function searchIssues(
  credentials: JiraConnectionCredentials,
  request: JiraSearchRequest,
  projectId: string,
  options?: JiraClientRequestOptions,
): Promise<JiraSearchPage> {
  const response = await jiraApiRequest<JiraApiSearchResponse>(credentials, "/rest/api/3/search", {
    ...options,
    body: {
      fields: request.fields ?? JIRA_SEARCH_FIELDS,
      jql: request.jql,
      maxResults: request.maxResults,
      startAt: request.startAt,
    },
    method: "POST",
  });

  const syncedAt = new Date().toISOString();
  const issues = response.issues.map((issue) => normalizeJiraIssue(issue, projectId, syncedAt));
  const isLast = response.startAt + response.issues.length >= response.total;

  return { issues, isLast, startAt: response.startAt, total: response.total };
}

export async function getIssue(
  credentials: JiraConnectionCredentials,
  issueKey: string,
  projectId: string,
  options?: JiraClientRequestOptions,
): Promise<JiraIssueDetail> {
  const rawIssue = await jiraApiRequest<JiraApiIssue>(
    credentials,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${JIRA_SEARCH_FIELDS.join(",")}`,
    options,
  );

  return normalizeJiraIssue(rawIssue, projectId, new Date().toISOString());
}

export async function getComments(
  credentials: JiraConnectionCredentials,
  issueKey: string,
  options?: JiraClientRequestOptions,
): Promise<JiraComment[]> {
  const response = await jiraApiRequest<{ comments: JiraApiComment[] }>(
    credentials,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    options,
  );

  return response.comments.map((rawComment) => normalizeComment(rawComment, issueKey));
}

/** Bounded to the first page — issue history drill-down (M6), not bulk sync. */
export async function getIssueChangelog(
  credentials: JiraConnectionCredentials,
  issueKey: string,
  options?: JiraClientRequestOptions,
): Promise<JiraChangelogEntry[]> {
  const response = await jiraApiRequest<{ values: JiraApiChangelogEntry[] }>(
    credentials,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?maxResults=100`,
    options,
  );

  return normalizeJiraChangelogEntries(response.values);
}
