import type {
  JiraChangelogEntry,
  JiraComment,
  JiraIssueDetail,
  JiraIssueLink,
} from "../../shared/jira";
import { adfToPlainText } from "./jira-adf";

/**
 * Raw Jira Cloud REST API v3 shapes (wire format), kept internal to the
 * Jira integration. Only the normalised shared/jira.ts types cross into
 * the rest of the app — mirrors how electron/github-api.ts keeps
 * GitHubApi* types local and normalises before anything else sees them.
 */
export interface JiraApiIssueTypeRef {
  name: string;
}

export interface JiraApiStatusRef {
  name: string;
}

export interface JiraApiComponentRef {
  name: string;
}

export interface JiraApiUserRef {
  displayName?: string;
}

export interface JiraApiComment {
  author?: JiraApiUserRef | null;
  body?: unknown;
  created: string;
  id: string;
}

export interface JiraApiIssueLinkTypeRef {
  inward?: string;
  name: string;
  outward?: string;
}

export interface JiraApiIssueLink {
  id?: string;
  inwardIssue?: { key: string };
  outwardIssue?: { key: string };
  type: JiraApiIssueLinkTypeRef;
}

export interface JiraApiIssueFields {
  comment?: { comments: JiraApiComment[] };
  components?: JiraApiComponentRef[];
  description?: unknown;
  issuelinks?: JiraApiIssueLink[];
  issuetype: JiraApiIssueTypeRef;
  labels?: string[];
  parent?: { key: string };
  status: JiraApiStatusRef;
  summary: string;
  updated: string;
}

export interface JiraApiIssue {
  fields: JiraApiIssueFields;
  id: string;
  key: string;
}

export interface JiraApiChangelogEntry {
  created: string;
  id: string;
  items: Array<{
    field: string;
    fromString: string | null;
    toString: string | null;
  }>;
  author?: JiraApiUserRef | null;
}

function normalizeIssueLink(rawLink: JiraApiIssueLink, issueKey: string): JiraIssueLink | null {
  const relatedIssueKey = rawLink.outwardIssue?.key ?? rawLink.inwardIssue?.key;
  if (!relatedIssueKey) {
    return null;
  }

  const linkType = rawLink.outwardIssue
    ? (rawLink.type.outward ?? rawLink.type.name)
    : (rawLink.type.inward ?? rawLink.type.name);

  return {
    // Jira's own link id is shared by both endpoints of the
    // relationship (it appears verbatim in each issue's `issuelinks`).
    // jira_issue_links.id is our primary key, and we store one row per
    // endpoint (one for the issue that references it outward, one for
    // the issue that references it inward) — reusing Jira's id would
    // collide the second time the same link is synced from the other
    // side. Always derive a per-endpoint id instead.
    id: `${issueKey}:${relatedIssueKey}:${linkType}`,
    issueKey,
    linkType,
    relatedIssueKey,
  };
}

export function normalizeComment(rawComment: JiraApiComment, issueKey: string): JiraComment {
  return {
    author: rawComment.author?.displayName ?? null,
    body: adfToPlainText(rawComment.body) ?? "",
    id: rawComment.id,
    issueKey,
    jiraCreatedAt: rawComment.created,
  };
}

/**
 * Converts one raw Jira search/get-issue result into DevDeck's stored
 * shape. `projectId` is the local `jira_projects.id` (not Jira's own
 * project id) — the caller (jira-sync.ts) already knows which local
 * project config this issue belongs to.
 */
export function normalizeJiraIssue(
  rawIssue: JiraApiIssue,
  projectId: string,
  syncedAt: string,
): JiraIssueDetail {
  const { fields } = rawIssue;

  const links = (fields.issuelinks ?? [])
    .map((rawLink) => normalizeIssueLink(rawLink, rawIssue.key))
    .filter((link): link is JiraIssueLink => link !== null);

  const comments = (fields.comment?.comments ?? []).map((rawComment) =>
    normalizeComment(rawComment, rawIssue.key),
  );

  return {
    comments,
    links,
    record: {
      components: (fields.components ?? []).map((component) => component.name),
      description: adfToPlainText(fields.description),
      issueKey: rawIssue.key,
      issueType: fields.issuetype.name,
      jiraUpdatedAt: fields.updated,
      labels: fields.labels ?? [],
      outOfScope: false,
      parentIssueKey: fields.parent?.key ?? null,
      projectId,
      status: fields.status.name,
      summary: fields.summary,
      syncedAt,
    },
  };
}

export function normalizeJiraChangelogEntries(
  rawEntries: JiraApiChangelogEntry[],
): JiraChangelogEntry[] {
  const normalized: JiraChangelogEntry[] = [];

  for (const entry of rawEntries) {
    for (const item of entry.items) {
      normalized.push({
        author: entry.author?.displayName ?? null,
        created: entry.created,
        field: item.field,
        fromValue: item.fromString,
        id: `${entry.id}:${item.field}`,
        toValue: item.toString,
      });
    }
  }

  return normalized;
}

export const JIRA_SEARCH_FIELDS = [
  "summary",
  "description",
  "issuetype",
  "status",
  "labels",
  "components",
  "parent",
  "comment",
  "issuelinks",
  "updated",
];
