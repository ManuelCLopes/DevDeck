# ADR-0007: Typed narrow IPC

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Engineering Brain introduces new native services and long-running operations. A generic IPC command channel would expose excessive capability and weaken runtime validation.

## Decision

Expose narrow domain methods through the typed preload bridge. Validate IPC inputs at runtime and return serialisable DTOs and stable public errors.

## Rationale

Explicit APIs improve security, discoverability, testability, compatibility, and domain ownership.

## Consequences

### Positive

- native capabilities remain bounded;
- changes are visible in shared contracts;
- renderer hooks are easier to test;
- permissions can be tied to methods.

### Negative

- more contract and wrapper code;
- API evolution requires deliberate compatibility work;
- events and cancellation need shared definitions.

## Alternatives considered

- exposing `ipcRenderer` directly;
- generic `execute(command, payload)` endpoint;
- renderer calling local services over HTTP.

## Follow-up

Use start/query/cancel/event patterns for long-running operations and add runtime schemas for all inputs.
