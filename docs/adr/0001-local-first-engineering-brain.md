# ADR-0001: Local-first Engineering Brain

**Status:** Accepted  
**Date:** 2026-08-03

## Context

The Engineering Brain will process source code, repository history, Jira content, assessments, and user feedback. A mandatory remote backend would increase privacy, deployment, cost, and trust complexity.

## Decision

Engineering Brain persistence, repository indexing, orchestration, and rules execution are local-first. External systems enrich local state but are not hidden runtime requirements.

## Rationale

DevDeck is already a desktop workspace with direct access to local repositories and native services. Local ownership improves privacy, offline capability, latency, and inspectability.

## Consequences

### Positive

- source data remains under user control;
- rules-only workflows can operate offline;
- no central service is required for the MVP;
- failures in external services degrade rather than disable the product.

### Negative

- local migrations, recovery, and resource management become product responsibilities;
- cross-device synchronisation is not automatic;
- enterprise central policy and shared indexes require future design.

## Alternatives considered

- mandatory cloud backend;
- hybrid backend from the first release;
- stateless analysis with no local history.

## Follow-up

Define retention, backup, diagnostics, and optional future synchronisation through separate decisions.
