# ADR-0003: SQLite for Engineering Brain persistence

**Status:** Accepted; driver selected on an interim basis, packaging validation still open  
**Date:** 2026-08-03  
**Updated:** 2026-08-18 — see "Interim driver decision" below

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

## Interim driver decision (Phase 1 / M1)

`better-sqlite3` was added as the concrete driver for Phase 1 (domain foundation): it is synchronous, the most widely used SQLite driver in Electron apps, and DevDeck already accepts a native dependency of the same shape (`node-pty`, rebuilt via `@electron/rebuild` and unpacked from the asar archive). `electron/persistence/sqlite-driver.ts` keeps it behind a narrow port so swapping the driver later stays a one-file change.

What is validated so far, on Linux, without macOS:

- fresh database creation, WAL/foreign-key pragmas, and schema v1 migration apply correctly under plain Node (`npm test`) and under the esbuild-bundled CJS Electron build (`npm run build`);
- the existing Playwright desktop smoke suite still passes with the database opened during `app.whenReady()`.

What is **still open** — this ADR's exit criterion is not yet met:

- arm64 macOS packaging, code signing, and notarisation with `better-sqlite3` unpacked from the asar archive;
- an `electron-rebuild`/`@electron/rebuild` run against the actual Electron ABI (only the plain-Node ABI has been exercised here);
- a decision on whether `better-sqlite3` remains final or is replaced (e.g. by `node:sqlite`) once Node's built-in SQLite module is unflagged in the Electron versions DevDeck ships.

Do not treat this ADR as fully closed until a signed, notarised macOS build has been produced and smoke-tested on real hardware.
