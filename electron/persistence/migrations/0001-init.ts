import type { Migration } from "../migration-runner";

/**
 * Schema v1 — the core Backlog Intelligence tables from
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md (section 11).
 *
 * This is a domain-foundation migration only: it creates structure, not
 * behaviour. Nothing writes to these tables before Jira sync (M2) and
 * repository evidence collection (M3) exist. Foreign keys point at Jira's
 * own issue keys (text, not local autoincrement ids) because Jira is the
 * external system of record — see docs/ENGINEERING_BRAIN_RFC.md section 13.
 */
export const initSchemaMigration: Migration = {
  version: 1,
  name: "init_backlog_schema",
  up(db) {
    db.exec(`
      CREATE TABLE jira_connections (
        id TEXT PRIMARY KEY,
        base_url TEXT NOT NULL,
        account_email TEXT NOT NULL,
        auth_method TEXT NOT NULL,
        last_successful_sync_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE jira_projects (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES jira_connections(id) ON DELETE CASCADE,
        project_key TEXT NOT NULL,
        name TEXT NOT NULL,
        jql TEXT,
        jql_hash TEXT,
        selected_fields_hash TEXT,
        last_full_sync_at TEXT,
        last_incremental_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (connection_id, project_key)
      );

      CREATE INDEX idx_jira_projects_connection ON jira_projects(connection_id);

      CREATE TABLE backlog_mappings (
        id TEXT PRIMARY KEY,
        jira_project_key TEXT NOT NULL,
        match_type TEXT NOT NULL,
        match_value TEXT,
        local_project_ids TEXT NOT NULL,
        priority INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_backlog_mappings_project_key ON backlog_mappings(jira_project_key);

      CREATE TABLE jira_issues (
        issue_key TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES jira_projects(id) ON DELETE CASCADE,
        issue_type TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        description TEXT,
        labels TEXT NOT NULL DEFAULT '[]',
        components TEXT NOT NULL DEFAULT '[]',
        parent_issue_key TEXT,
        out_of_scope INTEGER NOT NULL DEFAULT 0,
        jira_updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        raw_fields TEXT
      );

      CREATE INDEX idx_jira_issues_project ON jira_issues(project_id);
      CREATE INDEX idx_jira_issues_status ON jira_issues(status);
      CREATE INDEX idx_jira_issues_updated ON jira_issues(jira_updated_at);

      CREATE VIRTUAL TABLE jira_issues_fts USING fts5(
        issue_key UNINDEXED,
        summary,
        description,
        content='jira_issues',
        content_rowid='rowid'
      );

      -- Keep the FTS5 index in sync with jira_issues. This is the
      -- standard external-content sync pattern for SQLite FTS5; without
      -- these triggers the index silently drifts from the source table.
      CREATE TRIGGER jira_issues_fts_after_insert AFTER INSERT ON jira_issues BEGIN
        INSERT INTO jira_issues_fts(rowid, issue_key, summary, description)
        VALUES (new.rowid, new.issue_key, new.summary, new.description);
      END;

      CREATE TRIGGER jira_issues_fts_after_delete AFTER DELETE ON jira_issues BEGIN
        INSERT INTO jira_issues_fts(jira_issues_fts, rowid, issue_key, summary, description)
        VALUES ('delete', old.rowid, old.issue_key, old.summary, old.description);
      END;

      CREATE TRIGGER jira_issues_fts_after_update AFTER UPDATE ON jira_issues BEGIN
        INSERT INTO jira_issues_fts(jira_issues_fts, rowid, issue_key, summary, description)
        VALUES ('delete', old.rowid, old.issue_key, old.summary, old.description);
        INSERT INTO jira_issues_fts(rowid, issue_key, summary, description)
        VALUES (new.rowid, new.issue_key, new.summary, new.description);
      END;

      CREATE TABLE jira_comments (
        id TEXT PRIMARY KEY,
        issue_key TEXT NOT NULL REFERENCES jira_issues(issue_key) ON DELETE CASCADE,
        author TEXT,
        body TEXT NOT NULL,
        jira_created_at TEXT NOT NULL
      );

      CREATE INDEX idx_jira_comments_issue ON jira_comments(issue_key);

      CREATE TABLE jira_issue_links (
        id TEXT PRIMARY KEY,
        issue_key TEXT NOT NULL REFERENCES jira_issues(issue_key) ON DELETE CASCADE,
        link_type TEXT NOT NULL,
        related_issue_key TEXT NOT NULL
      );

      CREATE INDEX idx_jira_issue_links_issue ON jira_issue_links(issue_key);

      CREATE TABLE repository_snapshots (
        id TEXT PRIMARY KEY,
        local_project_id TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        default_branch TEXT,
        indexer_version TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_repository_snapshots_project ON repository_snapshots(local_project_id);

      CREATE TABLE scans (
        id TEXT PRIMARY KEY,
        jira_project_id TEXT REFERENCES jira_projects(id) ON DELETE SET NULL,
        status TEXT NOT NULL,
        engine_version TEXT NOT NULL,
        prompt_version TEXT,
        repository_snapshot_ids TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        cancelled_at TEXT,
        error_code TEXT
      );

      CREATE INDEX idx_scans_status ON scans(status);

      CREATE TABLE scan_items (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        issue_key TEXT NOT NULL REFERENCES jira_issues(issue_key) ON DELETE CASCADE,
        status TEXT NOT NULL,
        error_code TEXT,
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX idx_scan_items_scan ON scan_items(scan_id);
      CREATE INDEX idx_scan_items_issue ON scan_items(issue_key);

      CREATE TABLE evidence (
        id TEXT PRIMARY KEY,
        scan_item_id TEXT NOT NULL REFERENCES scan_items(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        source_id TEXT,
        source_url TEXT,
        repository_snapshot_id TEXT REFERENCES repository_snapshots(id) ON DELETE SET NULL,
        file_path TEXT,
        symbol TEXT,
        title TEXT,
        excerpt TEXT,
        strength TEXT NOT NULL,
        query TEXT,
        collected_at TEXT NOT NULL,
        collector_version TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX idx_evidence_scan_item ON evidence(scan_item_id);
      CREATE INDEX idx_evidence_kind ON evidence(kind);

      CREATE TABLE assessments (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        issue_key TEXT NOT NULL REFERENCES jira_issues(issue_key) ON DELETE CASCADE,
        classification TEXT NOT NULL,
        confidence REAL NOT NULL,
        confidence_band TEXT NOT NULL,
        summary TEXT NOT NULL,
        rationale TEXT NOT NULL,
        evidence_ids TEXT NOT NULL DEFAULT '[]',
        contradictions TEXT NOT NULL DEFAULT '[]',
        open_questions TEXT NOT NULL DEFAULT '[]',
        suggested_action TEXT NOT NULL,
        suggested_title TEXT,
        suggested_description TEXT,
        engine_version TEXT NOT NULL,
        prompt_version TEXT,
        repository_snapshot_ids TEXT NOT NULL DEFAULT '[]',
        stale INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_assessments_scan ON assessments(scan_id);
      CREATE INDEX idx_assessments_issue ON assessments(issue_key);
      CREATE INDEX idx_assessments_classification ON assessments(classification);

      CREATE TABLE assessment_feedback (
        id TEXT PRIMARY KEY,
        assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        decision TEXT NOT NULL,
        corrected_classification TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_assessment_feedback_assessment ON assessment_feedback(assessment_id);
    `);
  },
};
