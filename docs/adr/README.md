# Architecture Decision Records

Architecture Decision Records preserve the context, decision, consequences, and alternatives for durable DevDeck architecture choices.

## Status values

- Proposed
- Accepted
- Superseded
- Deprecated
- Rejected

Accepted ADRs are historical records and should not be rewritten to hide later changes. A new decision supersedes an earlier ADR and links to it.

## Index

- [0001 — Local-first Engineering Brain](0001-local-first-engineering-brain.md)
- [0002 — Electron owns native and persisted state](0002-electron-owns-native-state.md)
- [0003 — SQLite for Engineering Brain persistence](0003-sqlite-persistence.md)
- [0004 — Deterministic retrieval before model reasoning](0004-deterministic-before-model.md)
- [0005 — Human-in-the-loop and read-only first](0005-human-in-the-loop.md)
- [0006 — Explicit repository snapshots](0006-repository-snapshots.md)
- [0007 — Typed narrow IPC](0007-typed-narrow-ipc.md)
- [0008 — Optional provider abstraction](0008-optional-model-provider.md)
- [0009 — Defer semantic indexing](0009-defer-semantic-indexing.md)
- [0010 — Separate recommendations from actions](0010-separate-recommendations-actions.md)

## Template

```markdown
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Superseded | Deprecated | Rejected
**Date:** YYYY-MM-DD

## Context

## Decision

## Rationale

## Consequences

### Positive

### Negative

## Alternatives considered

## Follow-up
```
