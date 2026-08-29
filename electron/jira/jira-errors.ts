import type { JiraErrorCode } from "../../shared/jira";

export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: JiraErrorCode,
  ) {
    super(message);
    this.name = "JiraApiError";
  }
}

export class JiraConnectivityError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JiraConnectivityError";
  }
}

/**
 * Maps a Jira REST response to a DevDeck error code
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 25). Jira
 * overloads 400 for both malformed requests and invalid JQL — treat 400
 * as JQL_INVALID since every Phase 2 caller that hits it is a JQL-bearing
 * request (search or preview).
 */
export function mapJiraStatusToErrorCode(status: number): JiraErrorCode {
  if (status === 400) {
    return "JQL_INVALID";
  }
  if (status === 401) {
    return "JIRA_AUTH_FAILED";
  }
  if (status === 403) {
    return "PERMISSION_DENIED";
  }
  if (status === 429) {
    return "JIRA_RATE_LIMITED";
  }
  if (status >= 500) {
    return "JIRA_UNAVAILABLE";
  }
  return "UNKNOWN";
}

function extractJiraErrorMessages(bodyText: string): string[] {
  try {
    const parsed = JSON.parse(bodyText) as {
      errorMessages?: unknown;
      errors?: unknown;
    };
    const messages: string[] = [];
    if (Array.isArray(parsed.errorMessages)) {
      messages.push(...parsed.errorMessages.filter((m): m is string => typeof m === "string"));
    }
    if (parsed.errors && typeof parsed.errors === "object") {
      messages.push(
        ...Object.values(parsed.errors as Record<string, unknown>).filter(
          (m): m is string => typeof m === "string",
        ),
      );
    }
    return messages;
  } catch {
    return [];
  }
}

export function buildJiraApiError(status: number, bodyText: string): JiraApiError {
  const code = mapJiraStatusToErrorCode(status);
  const messages = extractJiraErrorMessages(bodyText);
  const detail = messages.length > 0 ? messages.join(" ") : bodyText.trim();

  const summaries: Record<JiraErrorCode, string> = {
    JIRA_AUTH_FAILED: "Jira rejected the account email or API token.",
    JIRA_RATE_LIMITED: "Jira is rate-limiting this connection.",
    JIRA_UNAVAILABLE: "Jira is currently unavailable.",
    JQL_INVALID: "Jira rejected this JQL.",
    PERMISSION_DENIED: "This Jira account lacks permission for that request.",
    UNKNOWN: `Jira API request failed with status ${status}.`,
  };

  const message = detail ? `${summaries[code]} ${detail}` : summaries[code];
  return new JiraApiError(message.trim(), status, code);
}
