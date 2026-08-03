# DevDeck Architecture Handbook

This directory decomposes the Engineering Brain RFC into implementation-focused architecture documents.

## Reading order

1. [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) — system context, containers, domain ownership, and runtime boundaries.
2. [`STORAGE_AND_MIGRATIONS.md`](STORAGE_AND_MIGRATIONS.md) — SQLite topology, schema lifecycle, migrations, retention, and recovery.
3. [`INDEXING_PIPELINE.md`](INDEXING_PIPELINE.md) — repository snapshots, lexical indexing, incremental invalidation, and file policy.
4. [`RETRIEVAL_ENGINE.md`](RETRIEVAL_ENGINE.md) — query planning, evidence retrieval, ranking, deduplication, and context budgets.
5. [`ASSESSMENT_AND_EVALUATION.md`](ASSESSMENT_AND_EVALUATION.md) — rules, confidence, model reasoning, evaluation corpus, and release gates.
6. [`SECURITY_MODEL.md`](SECURITY_MODEL.md) — assets, trust boundaries, threats, permissions, prompt injection, and write safety.
7. [`IPC_AND_OPERATIONS.md`](IPC_AND_OPERATIONS.md) — desktop API, events, cancellation, background work, and observability.
8. [`DOMAIN_AND_API_SPECIFICATIONS.md`](DOMAIN_AND_API_SPECIFICATIONS.md) — domain ownership, canonical entities, DTOs, events, pagination, validation, and compatibility.
9. [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md) — milestones, dependencies, exit criteria, rollout, and ownership.

## Document hierarchy

- `docs/ENGINEERING_CONSTITUTION.md` defines non-negotiable principles.
- `docs/ENGINEERING_PLAYBOOK.md` defines development standards.
- `docs/ENGINEERING_BRAIN_RFC.md` defines the platform proposal.
- `docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md` defines the first skill.
- This handbook defines implementation detail.
- `docs/adr/` records accepted architectural decisions.

## Coverage

The handbook covers:

- local-first deployment and runtime boundaries;
- storage, migrations, backup, retention, and recovery;
- repository snapshots and indexing;
- deterministic and optional semantic retrieval;
- evidence provenance and contradiction handling;
- rules, model reasoning, confidence, and evaluation;
- credentials, prompt injection, path/process safety, and write controls;
- IPC, operations, cancellation, background scheduling, and diagnostics;
- domain contracts and desktop API design;
- milestone sequencing and release gates.

## Change policy

Architecture changes must update the relevant handbook document and, where a durable decision is introduced or reversed, add or supersede an ADR. Implementation and documentation should land in the same pull request whenever practical.
