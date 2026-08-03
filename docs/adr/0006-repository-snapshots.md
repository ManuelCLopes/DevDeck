# ADR-0006: Bind analyses to explicit repository snapshots

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Repository contents change continuously. An assessment that cites a file or symbol without recording the analysed repository state becomes difficult to reproduce and may appear current after the evidence has changed.

## Decision

Every repository-backed scan is bound to immutable snapshot metadata containing at least repository identity, canonical path, HEAD SHA, indexer version, and policy hash. Assessments reference the snapshots used to produce them.

## Rationale

Snapshot binding makes results reproducible, enables targeted staleness, supports cache validity, and prevents historical evidence from being confused with current code.

## Consequences

### Positive

- assessments can be reconstructed;
- cache and index invalidation are explicit;
- users can see why an assessment became stale;
- scan comparison is reliable.

### Negative

- snapshot metadata and retention are required;
- dirty working-tree behaviour must be defined;
- repository changes may invalidate many assessments.

## Alternatives considered

- always analyse the current working tree with no snapshot record;
- store complete source copies per scan;
- use timestamps without commit identities.

## Follow-up

Default to committed HEAD state. Add working-tree-aware analysis only as an explicit future mode.
