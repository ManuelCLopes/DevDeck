import { randomUUID } from "node:crypto";
import type { RepositoryMappingMatch, RepositoryMappingRule } from "../../shared/backlog";
import type { SqliteConnection } from "./sqlite-driver";

/**
 * Repository over `backlog_mappings` (schema v1) — Jira project,
 * component, label, or issue → local repositories
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 14).
 *
 * Precedence when resolving which repositories apply to one issue:
 * issue override > component > label > project fallback. Within the
 * same match type, a higher `priority` number wins. "Never scan all
 * repositories implicitly" — resolveRepositoryMapping returns an empty
 * list, not every mapping, when nothing matches.
 */

interface BacklogMappingRow {
  enabled: number;
  id: string;
  jira_project_key: string;
  local_project_ids: string;
  match_type: string;
  match_value: string | null;
  priority: number;
}

function rowToMatch(row: BacklogMappingRow): RepositoryMappingMatch {
  if (row.match_type === "project_default") {
    return { type: "project_default" };
  }
  if (row.match_type === "component" || row.match_type === "label" || row.match_type === "issue") {
    return { type: row.match_type, value: row.match_value ?? "" };
  }
  throw new Error(`Unknown backlog mapping match type in database: ${row.match_type}`);
}

function rowToRule(row: BacklogMappingRow): RepositoryMappingRule {
  return {
    enabled: row.enabled === 1,
    id: row.id,
    jiraProjectKey: row.jira_project_key,
    localProjectIds: JSON.parse(row.local_project_ids) as string[],
    match: rowToMatch(row),
    priority: row.priority,
  };
}

export interface SaveBacklogMappingInput {
  enabled: boolean;
  id?: string;
  jiraProjectKey: string;
  localProjectIds: string[];
  match: RepositoryMappingMatch;
  priority: number;
}

export function upsertBacklogMapping(
  db: SqliteConnection,
  input: SaveBacklogMappingInput,
): RepositoryMappingRule {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  const matchValue = input.match.type === "project_default" ? null : input.match.value;

  db.prepare(
    `INSERT INTO backlog_mappings (
       id, jira_project_key, match_type, match_value, local_project_ids,
       priority, enabled, created_at, updated_at
     ) VALUES (@id, @jiraProjectKey, @matchType, @matchValue, @localProjectIds, @priority, @enabled, @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       jira_project_key = excluded.jira_project_key,
       match_type = excluded.match_type,
       match_value = excluded.match_value,
       local_project_ids = excluded.local_project_ids,
       priority = excluded.priority,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
  ).run({
    enabled: input.enabled ? 1 : 0,
    id,
    jiraProjectKey: input.jiraProjectKey,
    localProjectIds: JSON.stringify(input.localProjectIds),
    matchType: input.match.type,
    matchValue,
    now,
    priority: input.priority,
  });

  return getBacklogMapping(db, id) as RepositoryMappingRule;
}

export function getBacklogMapping(db: SqliteConnection, id: string): RepositoryMappingRule | null {
  const row = db.prepare("SELECT * FROM backlog_mappings WHERE id = ?").get(id) as
    | BacklogMappingRow
    | undefined;
  return row ? rowToRule(row) : null;
}

export function listBacklogMappings(
  db: SqliteConnection,
  jiraProjectKey: string,
): RepositoryMappingRule[] {
  const rows = db
    .prepare(
      "SELECT * FROM backlog_mappings WHERE jira_project_key = ? ORDER BY match_type, priority DESC",
    )
    .all(jiraProjectKey) as BacklogMappingRow[];
  return rows.map(rowToRule);
}

export function deleteBacklogMapping(db: SqliteConnection, id: string): void {
  db.prepare("DELETE FROM backlog_mappings WHERE id = ?").run(id);
}

export interface ResolveRepositoryMappingInput {
  components: string[];
  issueKey: string;
  jiraProjectKey: string;
  labels: string[];
}

const MATCH_TYPE_PRECEDENCE = ["issue", "component", "label", "project_default"] as const;

/**
 * Resolves the single highest-precedence enabled mapping rule for one
 * issue, or null when nothing matches — callers must treat null as "no
 * repositories," never as "all repositories."
 */
export function resolveRepositoryMapping(
  db: SqliteConnection,
  input: ResolveRepositoryMappingInput,
): RepositoryMappingRule | null {
  const rules = listBacklogMappings(db, input.jiraProjectKey).filter((rule) => rule.enabled);

  for (const matchType of MATCH_TYPE_PRECEDENCE) {
    const candidates = rules.filter((rule) => rule.match.type === matchType);
    const matching = candidates.filter((rule) => {
      switch (rule.match.type) {
        case "issue":
          return rule.match.value === input.issueKey;
        case "component":
          return input.components.includes(rule.match.value);
        case "label":
          return input.labels.includes(rule.match.value);
        case "project_default":
          return true;
        default:
          return false;
      }
    });

    if (matching.length > 0) {
      return matching.reduce((best, rule) => (rule.priority > best.priority ? rule : best));
    }
  }

  return null;
}
