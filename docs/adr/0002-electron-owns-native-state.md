# ADR-0002: Electron owns native and persisted state

**Status:** Accepted  
**Date:** 2026-08-03

## Context

DevDeck uses Electron with a React renderer. Engineering Brain adds filesystem access, Git, SQLite, credentials, background jobs, provider calls, and external integrations.

## Decision

Electron Main is the sole owner of native capabilities and persisted desktop state. The renderer accesses domain state through typed preload APIs.

## Rationale

A single ownership boundary reduces credential exposure, duplicate state, unsafe native access, and architecture drift.

## Consequences

### Positive

- renderer remains sandboxed from secrets and native APIs;
- persistence and background work have one owner;
- IPC contracts become explicit review points;
- packaged desktop behaviour matches the architecture.

### Negative

- more DTO and IPC design work is required;
- renderer development may require Electron mocks;
- long-running state must support reconnection after reload.

## Alternatives considered

- renderer-owned storage and integrations;
- direct external API calls from React;
- using the legacy web server as the desktop backend.

## Follow-up

Keep handlers thin, validate all IPC input, and document domain APIs.
