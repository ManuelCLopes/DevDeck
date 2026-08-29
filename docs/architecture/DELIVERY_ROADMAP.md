# Delivery Roadmap

## Purpose

This roadmap translates the Engineering Brain RFC into reviewable engineering milestones with dependencies, exit criteria, rollout expectations, and ownership boundaries.

The roadmap is capability-based rather than date-driven. Estimates are planning inputs, not commitments.

## Delivery principles

1. Establish deterministic value before model-assisted value.
2. Validate packaging and persistence risk early.
3. Release read-only before write-back.
4. Measure quality before increasing autonomy.
5. Build shared platform primitives through the first real skill.
6. Avoid speculative semantic infrastructure.
7. Keep every milestone independently testable and reversible.

## Milestone overview

```mermaid
flowchart LR
    M0["M0 Architecture Validation"]
    M1["M1 Domain Foundation"]
    M2["M2 Jira Read-only"]
    M3["M3 Repository Evidence"]
    M4["M4 Rules-only Backlog Health"]
    M5["M5 Hybrid Assessment"]
    M6["M6 Operational Triage"]
    M7["M7 Controlled Write-back"]
    M8["M8 Continuous Intelligence"]
    M9["M9 Semantic and Graph"]
    M10["M10 Hardening"]

    M0 --> M1 --> M2 --> M3 --> M4 --> M5 --> M6 --> M7 --> M8 --> M9 --> M10
```

## M0 — Architecture validation

**Status (2026-08-18): partially complete.** The foundational ADRs (docs/adr/) are accepted, and M1 proceeded on top of them per this roadmap's own dependency note ("M1 depends on M0 persistence decisions" — the decision, not full packaging validation). The packaged-arm64/signing/notarisation half of the persistence exit criterion below was not closed before M1 started and still isn't; see ADR-0003.

### Objectives

- remove high-risk unknowns;
- establish evaluation data;
- verify Electron packaging constraints;
- approve domain and security boundaries.

### Deliverables

- accepted foundational ADRs;
- SQLite driver spike;
- signed and notarised package with selected driver;
- Jira API mock and authentication spike;
- Git repository fixtures;
- threat model review;
- 20–30 anonymised evaluation cases;
- UX wireframes;
- feature-flag plan.

### Exit criteria

- persistence works in development, tests, packaged arm64 app, signing, and notarisation;
- Keychain abstraction is proven;
- initial schema reviewed;
- evaluation baseline recorded;
- no unresolved critical security risk;
- scope and non-goals approved.

### Estimated effort

1–2 weeks for a focused small team.

## M1 — Domain foundation

**Status (2026-08-18): implemented**, with one open item carried from M0. See below.

### Objectives

Create the executable platform shell without implementing Jira or indexing.

### Deliverables

- shared contracts and Zod schemas;
- Engineering Brain operation service;
- event model;
- typed preload API;
- IPC handlers;
- SQLite lifecycle and migrations;
- feature flags;
- Backlog route shell;
- diagnostics summary;
- foundational tests.

### Exit criteria

- fresh database and migrations work; ✅ `electron/persistence/` — see `backlog-db.test.ts`, `migration-runner.test.ts`, `migrations/0001-init.test.ts`.
- operation start/query/cancel flow works; ✅ `electron/engineering-brain/engineering-brain-service.ts` + `engineering-brain-service.test.ts`. No operation kinds are registered yet, so `startOperation` always fails with `UnknownOperationKindError` until a real skill registers a handler (M4 onward).
- renderer can reconnect to canonical state; ✅ for diagnostics (`useBacklogDiagnostics` re-fetches on mount). Operations themselves are **not** persisted — they live in an in-memory registry that a restart clears. That is an accepted Phase 1 gap, not a later-phase design decision: revisit once a real operation kind exists and needs to survive a restart.
- no credentials or external calls exist yet; ✅ nothing in this milestone talks to Jira, GitHub, or a model provider.
- type check, tests, build, and package pass. ✅ on Linux (`npm run check`, `npm test`, `npm run build`, existing Playwright desktop smoke suite). ❌ **not validated:** signed/notarised arm64 macOS packaging — this is an M0 exit criterion that was never actually closed out before M1 work started, and it still isn't; see ADR-0003's "Interim driver decision".

### Estimated effort

1–2 weeks. Actual: implemented in one session; the outstanding macOS packaging validation is untimed follow-up work.

## M2 — Jira read-only

**Status (2026-08-27): implemented against mocked Jira responses; never validated against a live Jira Cloud site.** See below.

### Objectives

Connect Jira Cloud and persist a reliable local snapshot.

### Deliverables

- API-token authentication;
- Keychain storage;
- connection health;
- project discovery;
- JQL validation and preview;
- paginated full sync;
- incremental sync;
- issue, comment, link, and selected changelog normalisation;
- offline issue browsing;
- sync diagnostics.

### Exit criteria

- at least 1,000 issues sync reliably; ❌ **not validated.** This execution environment has no Jira Cloud instance or credentials to sync against. `electron/jira/jira-sync.test.ts` proves the pagination/upsert/out-of-scope logic against a stubbed API across multiple pages, but that is not the same claim as "1,000 real issues from a real site sync reliably." Do this before relying on M2 for a real backlog.
- retries and rate limits are handled; ✅ `electron/jira/jira-client.ts` — bounded exponential backoff with jitter on 429/5xx, `Retry-After` honoured when present, unit-tested including the backoff curve itself (`jira-client.test.ts`).
- incremental sync updates changed issues only; ✅ `runIncrementalJiraSync` scopes its JQL to a relative `updated >= "-Nm"` window and never calls `markJiraIssuesOutOfScope` (`jira-sync.test.ts`).
- invalid JQL and permission failures are actionable; ✅ mapped to `JQL_INVALID` / `PERMISSION_DENIED` with Jira's own error text preserved (`electron/jira/jira-errors.ts`).
- no Jira mutation endpoints are exposed; ✅ every `jira-client.ts` function is a GET, or a POST to `/search` (a query, not a mutation — Jira just puts long JQL there instead of a URL).
- tokens are absent from database, logs, and renderer DTOs. ✅ credentials live only in Keychain/file storage (`electron/jira/jira-auth.ts`); no IPC handler returns an `apiToken`; nothing under `electron/jira/` or `electron/jira-ipc.ts` logs anything.

Also delivered beyond the listed deliverables: offline issue browsing (`JiraIssuesTable`, reads local SQLite only) and connection-health diagnostics (`jira_connections.last_error` / `last_successful_sync_at`, surfaced in `JiraConnectionCard`) — a lighter version of "sync diagnostics" than section 4.6's full observability model (scan id, stage durations, token/cost data), which only makes sense once a scan concept exists (M4).

Not built in M2, deferred: a guided-filter UI (JQL only for now — the plan allows either); issue-detail drill-down UI (`getIssue`/`getComments`/`getIssueChangelog` already exist in the client, unused by any screen yet); a `BacklogErrorCode` taxonomy beyond the Jira-specific subset (BI-003, still open).

### Estimated effort

2–3 weeks. Actual: implemented in one session; live-Jira validation is untimed follow-up work, same shape as M1's macOS packaging gap.

## M3 — Repository evidence

### Objectives

Map Jira scope to repositories and collect deterministic evidence.

### Deliverables

- project/component/label/issue mappings;
- repository snapshot service;
- safe Git runner;
- file policy;
- lexical index;
- exact issue-key search;
- Git history queries;
- GitHub PR enrichment;
- evidence normalisation and provenance;
- evidence UI;
- incremental indexing.

### Exit criteria

- exact commit and PR references are discoverable;
- current file and line evidence is navigable;
- deleted and renamed components are detectable;
- excluded files are never indexed;
- index cancellation preserves previous ready state;
- same snapshot and engine version produce reproducible evidence.

### Estimated effort

3–5 weeks.

## M4 — Rules-only Backlog Health

### Objectives

Deliver the first standalone user value without any model dependency.

### Deliverables

- scan orchestration;
- per-issue work queue;
- deterministic rules;
- signal and confidence model;
- assessment persistence;
- contradiction handling;
- issue review queue;
- human feedback;
- CSV, JSON, and Markdown exports;
- evaluation report.

### Exit criteria

- 500-issue scan completes with bounded resources;
- every assessment has valid evidence or `insufficient_evidence`;
- issue age alone never drives obsolescence;
- failures are isolated;
- users can accept, reject, and correct assessments;
- precision thresholds are approved for beta.

### Product milestone

First release with clear standalone value.

### Estimated effort

2–4 weeks.

## M5 — Hybrid assessment

### Objectives

Use an optional model to improve intent comparison, partial-coverage analysis, and issue rewriting.

### Deliverables

- model-provider abstraction;
- provider and repository policy UI;
- context budgets;
- secret redaction;
- structured model output;
- prompt and schema versioning;
- reconciliation with rules;
- cost and token tracking;
- model evaluation corpus;
- rules-only fallback.

### Exit criteria

- AI can be fully disabled;
- provider failure does not fail scans;
- fabricated or unknown evidence IDs are rejected;
- submitted context is inspectable;
- quality exceeds the M4 baseline on approved metrics;
- costs remain within configured budgets.

### Product milestone

First strongly differentiated release.

### Estimated effort

3–4 weeks.

## M6 — Operational triage

### Objectives

Make Backlog Intelligence efficient for recurring grooming sessions.

### Deliverables

- saved views;
- classification queues;
- bulk recommendation review;
- scan comparison;
- assessment history;
- rewrite diff;
- keyboard navigation;
- accessibility pass;
- OpenCode investigation handoff;
- performance work for large projects.

### Exit criteria

- a user can review 50 issues efficiently;
- stale and current assessments are clear;
- history and scan comparison are understandable;
- OpenCode receives bounded, correct context;
- accessibility checks pass.

### Product milestone

First release suitable for routine team use.

### Estimated effort

2–3 weeks.

## M7 — Controlled Jira write-back

### Preconditions

- sufficient accepted-feedback volume;
- classification precision is stable;
- updated threat model;
- write scopes and conflict semantics approved.

### Initial actions

- add comment;
- add label;
- update description;
- link duplicate;
- create follow-up issue.

Issue closure and workflow transition remain deferred unless separately approved.

### Deliverables

- action proposal model;
- permission checks;
- fresh-state validation;
- diff preview;
- explicit confirmation;
- idempotency;
- action audit;
- partial failure handling.

### Exit criteria

- read-only mode remains complete;
- retries do not duplicate external actions;
- stale writes are blocked;
- every write is attributable and auditable;
- bulk actions require second confirmation.

### Estimated effort

3–4 weeks.

## M8 — Continuous intelligence

### Objectives

Keep assessments fresh without rescanning everything.

### Deliverables

- scheduled Jira sync;
- repository freshness detection;
- targeted invalidation;
- merge-triggered re-analysis;
- changed-issue re-analysis;
- notifications;
- quiet periods and battery/network policies;
- background cost budgets.

### Exit criteria

- only affected issues are re-analysed;
- duplicate jobs are prevented;
- background execution does not materially degrade interactive work;
- users control cadence and notifications;
- stale reasons are visible.

### Estimated effort

2–4 weeks.

## M9 — Semantic and graph capabilities

### Entry criteria

Do not start this milestone until evaluation identifies meaningful retrieval failures that lexical and structural methods cannot solve economically.

### Potential deliverables

- local or policy-approved embeddings;
- issue–PR–commit–file–symbol graph;
- cross-repository conceptual search;
- backlog clustering;
- architecture and documentation drift foundations.

### Exit criteria

- measurable recall improvement;
- controlled false-positive impact;
- acceptable disk, memory, cost, and indexing time;
- explicit privacy policy;
- semantic index remains optional and rebuildable.

## M10 — Hardening and distribution

### Deliverables

- Jira OAuth 2.0;
- backup and restore UI;
- database repair flow;
- data retention controls;
- diagnostics bundle;
- enterprise policy evaluation;
- Jira Data Center feasibility decision;
- penetration testing;
- accessibility audit;
- performance hardening;
- migration and operations guides.

## Dependency map

- M1 depends on M0 persistence decisions.
- M2 depends on M1 operation and storage foundations.
- M3 can begin repository spikes during M2 but integrates after M1.
- M4 depends on M2 issue data and M3 evidence.
- M5 depends on M4 evaluation and assessment contracts.
- M6 depends on stable M4/M5 workflows.
- M7 depends on measured trust and security review.
- M8 depends on stable invalidation identities.
- M9 depends on retrieval metrics, not calendar date.

## Suggested commit strategy

Within implementation PRs, prefer commits aligned with coherent review units:

```text
contracts and schemas
persistence and migrations
service and operations
preload and IPC
renderer hooks
UI
unit and integration tests
E2E and documentation
```

## Rollout stages

1. developer-only;
2. internal alpha;
3. opt-in read-only beta;
4. rules-only public beta;
5. hybrid beta;
6. operational team beta;
7. controlled write-back beta;
8. general availability.

## Feature flags

```text
backlogIntelligenceEnabled
jiraSyncEnabled
repositoryIndexEnabled
rulesAssessmentEnabled
modelAssessmentEnabled
backgroundSyncEnabled
jiraWriteBackEnabled
semanticIndexEnabled
```

Every flag requires an owner, default, rollout plan, kill-switch behaviour, and removal condition.

## Quality gates across milestones

Every milestone must pass:

- type check;
- unit tests;
- relevant integration tests;
- relevant E2E flows;
- production build;
- macOS package validation for native changes;
- security checklist;
- documentation update;
- migration tests when applicable.

## Team ownership

Suggested areas:

- platform: persistence, operations, IPC, security;
- integrations: Jira and GitHub;
- retrieval: Git, indexing, evidence ranking;
- product: Backlog UI and workflows;
- AI/evaluation: providers, prompts, corpus, calibration.

A small team may combine roles, but code ownership should still identify primary reviewers.

## Programme metrics

- time to first useful scan;
- scan completion and failure rates;
- evidence precision and recall;
- classification precision;
- human acceptance rate;
- false obsolete and false implemented rates;
- issues reviewed per session;
- model cost per issue;
- cache hit rate;
- background resource usage;
- write action conflict and failure rates.

## Stop conditions

Pause rollout if:

- fabricated evidence occurs;
- false obsolete rate exceeds approved threshold;
- credentials appear in logs or diagnostics;
- packaged migration failures occur;
- background work causes unacceptable resource impact;
- write conflicts are not reliably detected.

## Open planning decisions

- staffing model;
- public beta precision thresholds;
- supported Jira project scale in v1;
- OAuth timing;
- whether M5 ships with one provider or a generic bring-your-own-key flow;
- whether M7 remains permanently limited to low-risk actions.
