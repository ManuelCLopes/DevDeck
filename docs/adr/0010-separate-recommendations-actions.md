# ADR-0010: Separate recommendations from actions

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Assessments may suggest Jira changes. Treating model or rules output as an executable command would combine inference, permission, conflict handling, and mutation into one unsafe boundary.

## Decision

Assessments produce recommendations. A separate trusted action service may convert an approved recommendation into an action proposal. Execution requires permission checks, fresh external state, preview, explicit confirmation, idempotency, and audit.

## Rationale

The separation ensures that reasoning cannot bypass application policy and allows recommendations to remain useful even when write-back is disabled.

## Consequences

### Positive

- strong human-control boundary;
- write permissions remain optional;
- conflicts and retries have explicit semantics;
- action history is independently auditable.

### Negative

- additional domain entities and UI steps;
- recommendations cannot be applied in one hidden operation;
- bulk actions require careful orchestration.

## Alternatives considered

- direct model tool calls to Jira;
- automatically applying high-confidence recommendations;
- embedding mutation payloads directly in assessments.

## Follow-up

Introduce action proposals only after read-only quality gates are met and begin with low-risk Jira actions.
