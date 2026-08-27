/**
 * Jira Cloud domain types for Phase 2 (read-only sync).
 *
 * See docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 13 and
 * docs/ENGINEERING_BRAIN_RFC.md section 17. Everything here is read-only:
 * there is no mutation endpoint anywhere in this domain (write-back is
 * M7 / Phase 7, and remains a separate permission boundary — ADR-0010).
 */

export type JiraAuthMethod = "api_token";

/**
 * Non-secret connection identity, safe to send to the renderer. The API
 * token itself never leaves Electron — see electron/jira/jira-auth.ts.
 */
export interface JiraConnection {
  accountEmail: string;
  authMethod: JiraAuthMethod;
  baseUrl: string;
  id: string;
  lastError: string | null;
  lastSuccessfulSyncAt: string | null;
}

export interface JiraConnectionCredentials {
  accountEmail: string;
  apiToken: string;
  baseUrl: string;
}

export interface JiraConnectionHealth {
  displayName: string | null;
  ok: boolean;
  reason: string | null;
}

export interface JiraAuthCapabilities {
  storageBackend: "file" | "keychain";
}

export interface JiraRemoteProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

/**
 * A locally configured sync target: one Jira project scoped by a JQL
 * filter, mapped to a local `jira_projects` row (schema v1, Phase 1).
 */
export interface JiraProjectConfig {
  connectionId: string;
  id: string;
  jql: string | null;
  lastFullSyncAt: string | null;
  lastIncrementalSyncAt: string | null;
  name: string;
  projectKey: string;
}

export interface JiraIssueLink {
  id: string;
  issueKey: string;
  linkType: string;
  relatedIssueKey: string;
}

export interface JiraComment {
  author: string | null;
  body: string;
  id: string;
  issueKey: string;
  jiraCreatedAt: string;
}

/**
 * The normalised, stored shape of a Jira issue — matches the
 * `jira_issues` table from electron/persistence/migrations/0001-init.ts.
 * `description` and comment bodies are plain text (converted from ADF by
 * electron/jira/jira-adf.ts), never the raw Atlassian Document Format.
 */
export interface JiraIssueRecord {
  components: string[];
  description: string | null;
  issueKey: string;
  issueType: string;
  jiraUpdatedAt: string;
  labels: string[];
  outOfScope: boolean;
  parentIssueKey: string | null;
  projectId: string;
  status: string;
  summary: string;
  syncedAt: string;
}

export interface JiraIssueDetail {
  comments: JiraComment[];
  links: JiraIssueLink[];
  record: JiraIssueRecord;
}

export interface JiraChangelogEntry {
  author: string | null;
  created: string;
  field: string;
  fromValue: string | null;
  id: string;
  toValue: string | null;
}

export interface JiraSearchRequest {
  fields?: string[];
  jql: string;
  maxResults: number;
  startAt: number;
}

export interface JiraSearchPage {
  issues: JiraIssueDetail[];
  isLast: boolean;
  startAt: number;
  total: number;
}

export type JiraSyncMode = "full" | "incremental";

export interface JiraSyncResult {
  fetchedIssueCount: number;
  markedOutOfScopeCount: number;
  mode: JiraSyncMode;
  projectConfigId: string;
  syncedAt: string;
  upsertedIssueCount: number;
}

/**
 * Errors surfaced across the Jira integration, mapped from HTTP status
 * and connectivity failures — see
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 25.
 */
export type JiraErrorCode =
  | "JIRA_AUTH_FAILED"
  | "JIRA_RATE_LIMITED"
  | "JIRA_UNAVAILABLE"
  | "JQL_INVALID"
  | "PERMISSION_DENIED"
  | "UNKNOWN";
