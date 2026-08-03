# Storage and Migrations

## Purpose

This document defines the persistence model for the Engineering Brain and Backlog Intelligence domains.

## Decision summary

- SQLite is the default local store.
- Electron is the sole database owner.
- The renderer receives serialisable DTOs through typed IPC.
- Credentials remain in macOS Keychain.
- Repository-owned configuration may live in project files when it should travel with Git.
- JSON remains acceptable for small append-oriented telemetry, but not for relational Engineering Brain state.

## Database location

```text
~/Library/Application Support/DevDeck/engineering-brain.sqlite
```

The file name should remain stable. Domain evolution should happen through schema migrations rather than parallel databases unless a future ADR explicitly changes this decision.

## Connection lifecycle

1. Resolve the Electron user-data path.
2. Open the database.
3. Enable foreign keys.
4. Enable WAL mode.
5. Configure a busy timeout.
6. Acquire a migration lock.
7. Create a backup before destructive migrations.
8. Run versioned migrations.
9. Validate the expected schema version.
10. Start repositories and background services.
11. Checkpoint WAL periodically.
12. Close gracefully on application shutdown.

## Recommended pragmas

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

`FULL` synchronous mode may be used for particularly sensitive action audit writes if measurements justify it.

## Logical schemas

SQLite has one physical database, but tables should be grouped by domain through naming and repository ownership.

### Integration state

- `jira_connections`
- `jira_projects`
- `jira_sync_cursors`
- `jira_issues`
- `jira_comments`
- `jira_issue_links`

### Repository intelligence

- `repository_mappings`
- `repository_snapshots`
- `repository_files`
- `repository_symbols`
- `repository_issue_references`

### Analysis

- `scans`
- `scan_items`
- `evidence`
- `assessment_signals`
- `assessments`
- `assessment_feedback`

### Actions and audit

- `action_proposals`
- `action_executions`
- `external_call_audit`

## Identity

All local entities should use stable string IDs, preferably UUIDv7 or another sortable unique identifier.

External IDs must be stored separately from local IDs. Jira issue IDs, issue keys, GitHub PR numbers, commit SHAs, and repository paths are source identifiers, not DevDeck primary keys.

## Raw payload policy

Raw external payloads may be retained when they materially improve forward compatibility or diagnostics.

Rules:

- raw payload columns are optional;
- credentials are never included;
- payload retention is configurable;
- normalised fields remain the query contract;
- migration code must not depend exclusively on unstable raw structures.

## Full-text search

Use SQLite FTS5 for issue summaries, descriptions, comments, and selected documentation text where supported.

FTS tables should be treated as derived indexes. They may be rebuilt from canonical tables.

## Transactions

Use transactions for:

- page-level Jira sync upserts;
- migration steps;
- scan item completion plus assessment persistence;
- action execution plus audit recording;
- retention and cleanup operations.

Long-running network or Git operations must not hold database transactions open.

## Repositories

Each domain owns repository interfaces. Other domains must not issue direct SQL against tables they do not own.

Example:

```ts
export interface AssessmentRepository {
  getById(id: string): Promise<BacklogAssessment | null>;
  listByIssue(issueId: string): Promise<BacklogAssessment[]>;
  save(input: SaveAssessmentInput): Promise<BacklogAssessment>;
  markStaleBySnapshot(snapshotId: string): Promise<number>;
}
```

## Migration format

Migrations should be numbered and immutable after merge.

```text
electron/persistence/migrations/
├── 0001-engineering-brain-foundation.ts
├── 0002-jira-sync.ts
├── 0003-repository-index.ts
└── 0004-assessments.ts
```

Each migration contains:

- version;
- description;
- `up` implementation;
- optional validation;
- whether backup is required;
- whether it is reversible.

## Migration rules

1. Never silently discard user data.
2. Prefer additive changes.
3. Backfill in bounded batches for large tables.
4. Separate schema changes from expensive data recomputation.
5. Derived indexes may be rebuilt after the schema transaction.
6. Record migration start, completion, and failure.
7. Do not start normal services after a failed migration.
8. Expose a recoverable diagnostics state to the user.

## Backups

Before destructive migrations, copy the database and related WAL/SHM state after a clean checkpoint.

Backup names:

```text
engineering-brain.backup-<schema-version>-<timestamp>.sqlite
```

Keep a bounded number of automatic backups. Never delete the newest known-good backup during the same startup that creates it.

## Recovery

Recovery modes:

- retry migration;
- open diagnostics-only mode;
- restore latest backup;
- export recoverable data;
- reset Engineering Brain data after explicit confirmation.

A database reset must not remove unrelated DevDeck configuration or credentials.

## Retention

Default policy:

- retain current Jira snapshots while a project is configured;
- retain assessment history;
- retain action audit indefinitely unless explicitly exported and removed;
- retain detailed evidence for a configurable period;
- retain repository indexes only for current or recently used snapshots;
- retain raw model output only when policy allows.

## Pruning

Pruning must be transactional and observable.

Never prune:

- evidence referenced by a retained assessment unless the assessment is converted to a durable summary that preserves provenance;
- action audit referenced by an execution;
- the newest valid repository snapshot for an enabled mapping.

## Encryption

The initial local database is not application-level encrypted. Sensitive credentials remain in Keychain and must not enter SQLite.

If encrypted local content becomes a product requirement, adopt it through an ADR after evaluating SQLCipher, key lifecycle, recovery, packaging, and performance.

## Concurrency

SQLite writes should be serialised through a database service. Reads may run concurrently where the driver permits.

Background tasks must use bounded write queues and avoid unbounded write amplification during indexing.

## Testing

Required tests:

- fresh database creation;
- sequential migrations;
- migration from every supported previous version;
- failed migration recovery;
- backup creation;
- foreign-key enforcement;
- concurrent read/write behaviour;
- retention safety;
- FTS rebuild;
- macOS packaged application path handling.

## Open decisions

- final SQLite driver;
- exact supported migration window;
- default evidence retention period;
- whether completed scans may be compacted;
- whether database repair uses a bundled SQLite CLI or library APIs.
