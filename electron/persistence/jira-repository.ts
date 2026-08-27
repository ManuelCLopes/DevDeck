import { randomUUID } from "node:crypto";
import type {
  JiraComment,
  JiraConnection,
  JiraIssueDetail,
  JiraIssueLink,
  JiraIssueRecord,
  JiraProjectConfig,
} from "../../shared/jira";
import type { SqliteConnection } from "./sqlite-driver";

/**
 * Typed repository over the Jira tables from schema v1
 * (electron/persistence/migrations/0001-init.ts). This is BI-013,
 * intentionally deferred in Phase 1 because nothing wrote to these
 * tables yet — Jira sync (Phase 2) is the first writer.
 *
 * Every function takes an already-open connection; callers own the
 * connection's lifecycle (electron/engineering-brain-ipc.ts).
 */

interface JiraConnectionRow {
  account_email: string;
  auth_method: string;
  base_url: string;
  id: string;
  last_error: string | null;
  last_successful_sync_at: string | null;
}

function rowToConnection(row: JiraConnectionRow): JiraConnection {
  return {
    accountEmail: row.account_email,
    authMethod: row.auth_method as JiraConnection["authMethod"],
    baseUrl: row.base_url,
    id: row.id,
    lastError: row.last_error,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
  };
}

export interface UpsertJiraConnectionInput {
  accountEmail: string;
  baseUrl: string;
  id: string;
}

export function upsertJiraConnection(
  db: SqliteConnection,
  input: UpsertJiraConnectionInput,
): JiraConnection {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO jira_connections (id, base_url, account_email, auth_method, created_at, updated_at)
     VALUES (@id, @baseUrl, @accountEmail, 'api_token', @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       base_url = excluded.base_url,
       account_email = excluded.account_email,
       updated_at = excluded.updated_at`,
  ).run({ ...input, now });

  return getJiraConnection(db, input.id) as JiraConnection;
}

export function recordJiraConnectionHealth(
  db: SqliteConnection,
  connectionId: string,
  outcome: { errorMessage: string | null; succeededAt: string | null },
): void {
  db.prepare(
    `UPDATE jira_connections
     SET last_successful_sync_at = COALESCE(@succeededAt, last_successful_sync_at),
         last_error = @errorMessage,
         updated_at = @now
     WHERE id = @connectionId`,
  ).run({
    connectionId,
    errorMessage: outcome.errorMessage,
    now: new Date().toISOString(),
    succeededAt: outcome.succeededAt,
  });
}

export function getJiraConnection(
  db: SqliteConnection,
  id: string,
): JiraConnection | null {
  const row = db
    .prepare("SELECT * FROM jira_connections WHERE id = ?")
    .get(id) as JiraConnectionRow | undefined;
  return row ? rowToConnection(row) : null;
}

/**
 * Deletes a connection and, via `ON DELETE CASCADE`, every
 * jira_project/jira_issue/comment/link that hung off it. Used when the
 * single Phase 2 connection's site identity changes (a different
 * `baseUrl`) — without this, the old site's cached projects and issues
 * would linger under the new account and future syncs could mix or
 * overwrite records that happen to share an issue key.
 */
export function deleteJiraConnection(db: SqliteConnection, id: string): void {
  db.prepare("DELETE FROM jira_connections WHERE id = ?").run(id);
}

interface JiraProjectConfigRow {
  connection_id: string;
  id: string;
  jql: string | null;
  last_full_sync_at: string | null;
  last_incremental_sync_at: string | null;
  name: string;
  project_key: string;
}

function rowToProjectConfig(row: JiraProjectConfigRow): JiraProjectConfig {
  return {
    connectionId: row.connection_id,
    id: row.id,
    jql: row.jql,
    lastFullSyncAt: row.last_full_sync_at,
    lastIncrementalSyncAt: row.last_incremental_sync_at,
    name: row.name,
    projectKey: row.project_key,
  };
}

export interface UpsertJiraProjectConfigInput {
  connectionId: string;
  jql: string | null;
  name: string;
  projectKey: string;
}

/**
 * Creates or updates the local sync target for one Jira project
 * (`connection_id` + `project_key` is unique — see schema v1). Returns
 * the resulting row either way, so callers don't need to separately
 * track whether this was an insert or an update.
 */
export function upsertJiraProjectConfig(
  db: SqliteConnection,
  input: UpsertJiraProjectConfigInput,
): JiraProjectConfig {
  const now = new Date().toISOString();
  const newId = randomUUID();

  db.prepare(
    `INSERT INTO jira_projects (id, connection_id, project_key, name, jql, created_at, updated_at)
     VALUES (@newId, @connectionId, @projectKey, @name, @jql, @now, @now)
     ON CONFLICT(connection_id, project_key) DO UPDATE SET
       name = excluded.name,
       jql = excluded.jql,
       updated_at = excluded.updated_at`,
  ).run({ ...input, newId, now });

  const row = db
    .prepare(
      "SELECT * FROM jira_projects WHERE connection_id = ? AND project_key = ?",
    )
    .get(input.connectionId, input.projectKey) as JiraProjectConfigRow;
  return rowToProjectConfig(row);
}

export function getJiraProjectConfig(
  db: SqliteConnection,
  id: string,
): JiraProjectConfig | null {
  const row = db
    .prepare("SELECT * FROM jira_projects WHERE id = ?")
    .get(id) as JiraProjectConfigRow | undefined;
  return row ? rowToProjectConfig(row) : null;
}

export function listJiraProjectConfigs(
  db: SqliteConnection,
  connectionId: string,
): JiraProjectConfig[] {
  const rows = db
    .prepare("SELECT * FROM jira_projects WHERE connection_id = ? ORDER BY name")
    .all(connectionId) as JiraProjectConfigRow[];
  return rows.map(rowToProjectConfig);
}

export function updateJiraProjectSyncCursor(
  db: SqliteConnection,
  projectConfigId: string,
  cursor: { lastFullSyncAt?: string; lastIncrementalSyncAt?: string },
): void {
  db.prepare(
    `UPDATE jira_projects
     SET last_full_sync_at = COALESCE(@lastFullSyncAt, last_full_sync_at),
         last_incremental_sync_at = COALESCE(@lastIncrementalSyncAt, last_incremental_sync_at),
         updated_at = @now
     WHERE id = @projectConfigId`,
  ).run({
    lastFullSyncAt: cursor.lastFullSyncAt ?? null,
    lastIncrementalSyncAt: cursor.lastIncrementalSyncAt ?? null,
    now: new Date().toISOString(),
    projectConfigId,
  });
}

interface JiraIssueRow {
  components: string;
  description: string | null;
  issue_key: string;
  issue_type: string;
  jira_updated_at: string;
  labels: string;
  out_of_scope: number;
  parent_issue_key: string | null;
  project_id: string;
  status: string;
  summary: string;
  synced_at: string;
}

function rowToIssueRecord(row: JiraIssueRow): JiraIssueRecord {
  return {
    components: JSON.parse(row.components) as string[],
    description: row.description,
    issueKey: row.issue_key,
    issueType: row.issue_type,
    jiraUpdatedAt: row.jira_updated_at,
    labels: JSON.parse(row.labels) as string[],
    outOfScope: row.out_of_scope === 1,
    parentIssueKey: row.parent_issue_key,
    projectId: row.project_id,
    status: row.status,
    summary: row.summary,
    syncedAt: row.synced_at,
  };
}

/**
 * Upserts a page of issues (and replaces their comments/links) inside
 * one transaction. Safe to call repeatedly with overlapping pages — an
 * incremental sync's safety-overlap window intentionally re-fetches a
 * few already-synced issues.
 */
export function upsertJiraIssues(db: SqliteConnection, issues: JiraIssueDetail[]): void {
  const upsertIssue = db.prepare(
    `INSERT INTO jira_issues (
       issue_key, project_id, issue_type, status, summary, description,
       labels, components, parent_issue_key, out_of_scope, jira_updated_at, synced_at
     ) VALUES (
       @issueKey, @projectId, @issueType, @status, @summary, @description,
       @labels, @components, @parentIssueKey, 0, @jiraUpdatedAt, @syncedAt
     )
     ON CONFLICT(issue_key) DO UPDATE SET
       issue_type = excluded.issue_type,
       status = excluded.status,
       summary = excluded.summary,
       description = excluded.description,
       labels = excluded.labels,
       components = excluded.components,
       parent_issue_key = excluded.parent_issue_key,
       out_of_scope = 0,
       jira_updated_at = excluded.jira_updated_at,
       synced_at = excluded.synced_at`,
  );
  const deleteComments = db.prepare("DELETE FROM jira_comments WHERE issue_key = ?");
  const insertComment = db.prepare(
    `INSERT INTO jira_comments (id, issue_key, author, body, jira_created_at)
     VALUES (@id, @issueKey, @author, @body, @jiraCreatedAt)`,
  );
  const deleteLinks = db.prepare("DELETE FROM jira_issue_links WHERE issue_key = ?");
  const insertLink = db.prepare(
    `INSERT INTO jira_issue_links (id, issue_key, link_type, related_issue_key)
     VALUES (@id, @issueKey, @linkType, @relatedIssueKey)`,
  );

  const applyUpsert = db.transaction((issuesToUpsert: JiraIssueDetail[]) => {
    for (const issue of issuesToUpsert) {
      upsertIssue.run({
        ...issue.record,
        components: JSON.stringify(issue.record.components),
        labels: JSON.stringify(issue.record.labels),
      });

      deleteComments.run(issue.record.issueKey);
      for (const comment of issue.comments) {
        insertComment.run(comment);
      }

      deleteLinks.run(issue.record.issueKey);
      for (const link of issue.links) {
        insertLink.run(link);
      }
    }
  });

  applyUpsert(issues);
}

/**
 * Marks issues that left the configured JQL filter as `out_of_scope`
 * rather than deleting them
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 13: "Mark
 * issues leaving the filter as out_of_scope rather than deleting
 * them"). Only meaningful after a *full* sync, where
 * `currentIssueKeys` is the complete result set for the JQL — an
 * incremental sync only sees changed issues and must not call this.
 */
export function markJiraIssuesOutOfScope(
  db: SqliteConnection,
  projectId: string,
  currentIssueKeys: string[],
): number {
  if (currentIssueKeys.length === 0) {
    const result = db
      .prepare(
        "UPDATE jira_issues SET out_of_scope = 1 WHERE project_id = ? AND out_of_scope = 0",
      )
      .run(projectId);
    return result.changes;
  }

  const placeholders = currentIssueKeys.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE jira_issues
       SET out_of_scope = 1
       WHERE project_id = ? AND out_of_scope = 0 AND issue_key NOT IN (${placeholders})`,
    )
    .run(projectId, ...currentIssueKeys);
  return result.changes;
}

export interface ListJiraIssuesResult {
  issues: JiraIssueRecord[];
  total: number;
}

export function listJiraIssuesForProject(
  db: SqliteConnection,
  projectId: string,
  pagination: { limit: number; offset: number },
): ListJiraIssuesResult {
  const rows = db
    .prepare(
      `SELECT * FROM jira_issues
       WHERE project_id = ?
       ORDER BY jira_updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(projectId, pagination.limit, pagination.offset) as JiraIssueRow[];

  const { total } = db
    .prepare("SELECT COUNT(*) AS total FROM jira_issues WHERE project_id = ?")
    .get(projectId) as { total: number };

  return { issues: rows.map(rowToIssueRecord), total };
}

export function getJiraIssueDetail(
  db: SqliteConnection,
  issueKey: string,
): JiraIssueDetail | null {
  const row = db
    .prepare("SELECT * FROM jira_issues WHERE issue_key = ?")
    .get(issueKey) as JiraIssueRow | undefined;
  if (!row) {
    return null;
  }

  const comments = db
    .prepare(
      "SELECT id, issue_key, author, body, jira_created_at FROM jira_comments WHERE issue_key = ? ORDER BY jira_created_at",
    )
    .all(issueKey) as Array<{
    author: string | null;
    body: string;
    id: string;
    issue_key: string;
    jira_created_at: string;
  }>;

  const links = db
    .prepare(
      "SELECT id, issue_key, link_type, related_issue_key FROM jira_issue_links WHERE issue_key = ?",
    )
    .all(issueKey) as Array<{
    id: string;
    issue_key: string;
    link_type: string;
    related_issue_key: string;
  }>;

  return {
    comments: comments.map(
      (comment): JiraComment => ({
        author: comment.author,
        body: comment.body,
        id: comment.id,
        issueKey: comment.issue_key,
        jiraCreatedAt: comment.jira_created_at,
      }),
    ),
    links: links.map(
      (link): JiraIssueLink => ({
        id: link.id,
        issueKey: link.issue_key,
        linkType: link.link_type,
        relatedIssueKey: link.related_issue_key,
      }),
    ),
    record: rowToIssueRecord(row),
  };
}
