# ADR-0004: Deterministic retrieval before model reasoning

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Backlog analysis can use exact references, Git history, code search, source metadata, semantic retrieval, and LLM reasoning. Starting with model interpretation would make results harder to verify and evaluate.

## Decision

Retrieve and rank deterministic evidence before invoking a model. Model reasoning receives a bounded evidence package and cannot invent or replace source references.

## Rationale

Exact references and current code are stronger evidence than linguistic similarity. This ordering improves explainability, rules-only capability, cost control, and failure handling.

## Consequences

### Positive

- useful operation without AI;
- lower model cost;
- auditable conclusions;
- stronger evaluation and debugging.

### Negative

- more retrieval engineering is required;
- some implicit relationships may initially be missed;
- rules and ranking require versioning.

## Alternatives considered

- model-first repository analysis;
- embeddings-first retrieval;
- unrestricted agent investigation.

## Follow-up

Create retrieval-quality metrics and add semantic methods only when measured gaps justify them.
