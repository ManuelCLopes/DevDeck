# ADR-0003: SQLite for Engineering Brain persistence

**Status:** Accepted, pending driver selection  
**Date:** 2026-08-03

## Context

Engineering Brain requires relational queries, full-text search, migrations, transactions, scan history, evidence relationships, and durable feedback. Existing JSON persistence is not sufficient for this access pattern.

## Decision

Use a local SQLite database owned by Electron. Select the concrete driver only after validating arm64 macOS packaging, tests, signing, and notarisation.

## Rationale

SQLite provides a strong local relational model without introducing an external service. It supports FTS, transactions, backups, and predictable deployment.

## Consequences

### Positive

- zero server dependency;
- mature query and migration capabilities;
- portable local backup;
- suitable scale for expected local data.

### Negative

- native driver packaging may add complexity;
- DevDeck owns migrations and recovery;
- writes require careful serialisation.

## Alternatives considered

- JSON files;
- embedded document stores;
- PostgreSQL or remote database;
- browser storage in the renderer.

## Follow-up

Run a driver spike and package a signed/notarised build before feature implementation depends on it.
