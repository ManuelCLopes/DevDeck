# ADR-0009: Defer semantic indexing until a measured retrieval gap exists

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Embeddings and knowledge graphs may improve implicit relationship discovery, but they add indexing cost, storage, privacy, invalidation, evaluation, and dependency complexity.

## Decision

The MVP uses exact references, lexical search, Git history, FTS, and selective structural parsing. Semantic indexing is introduced only after evaluation demonstrates important misses that simpler methods cannot solve adequately.

## Rationale

Backlog analysis has unusually strong deterministic signals: issue keys, commit history, PRs, paths, tests, endpoints, and component removal. These should be exploited and measured before adding probabilistic infrastructure.

## Consequences

### Positive

- faster and safer MVP;
- lower storage and provider complexity;
- clear lexical baseline for later comparison;
- semantic infrastructure must justify itself through metrics.

### Negative

- some implicit links may initially be missed;
- cross-repository conceptual search is delayed;
- future semantic introduction requires migration and index design.

## Alternatives considered

- embeddings from the first release;
- mandatory vector database;
- model-driven repository exploration without a persistent index.

## Follow-up

Track retrieval misses in the evaluation corpus and define entry criteria for semantic work.
