# DevDeck Engineering Playbook

**Status:** Active engineering standard  
**Audience:** Maintainers, contributors, agents, and reviewers  
**Scope:** All production changes to DevDeck

---

## 1. Purpose

This playbook defines how DevDeck is designed, implemented, reviewed, tested, documented, and released.

It complements:

- `docs/ENGINEERING_CONSTITUTION.md`;
- `docs/ENGINEERING_BRAIN_RFC.md`;
- `docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md`;
- `docs/ARCHITECTURE.md`;
- the ADRs under `docs/adr/`.

The constitution defines principles. RFCs define intended systems. ADRs record decisions. This playbook defines the day-to-day engineering rules that keep the codebase coherent.

---

## 2. Engineering values in practice

Every implementation should optimise for:

1. correctness before cleverness;
2. evidence before inference;
3. explicit ownership before convenience;
4. bounded APIs before broad access;
5. local-first execution before hidden services;
6. graceful degradation before brittle dependency chains;
7. observability before opaque background work;
8. maintainability before premature abstraction;
9. tests that protect behaviour, not implementation trivia;
10. documentation that explains why, not only what.

---

## 3. Architectural boundaries

### 3.1. Renderer

The renderer owns:

- presentation;
- navigation;
- local interaction state;
- forms;
- React Query integration;
- optimistic UI where safe;
- visualisation;
- accessibility.

The renderer must not:

- read arbitrary files;
- execute processes;
- access Keychain;
- call GitHub, Jira, or model providers directly;
- own persisted business state;
- duplicate canonical Electron state in localStorage;
- call Electron IPC channels directly from components.

### 3.2. Preload

The preload layer owns:

- the typed `window.devdeck` API;
- input and output validation;
- event subscription wrappers;
- isolation of IPC channel names;
- explicit unsubscribe behaviour.

The preload layer must not contain business logic.

### 3.3. Electron

Electron owns:

- filesystem access;
- Git;
- GitHub and Jira integrations;
- Keychain;
- SQLite and persisted desktop state;
- background tasks;
- process execution;
- PTYs;
- notifications;
- menu bar and OS integration;
- model-provider calls;
- exports.

### 3.4. Shared

`shared/` owns:

- cross-process types;
- Zod schemas;
- stable enums;
- serialisable DTOs;
- pure normalisation logic;
- version identifiers;
- shared constants with domain meaning.

Shared modules must not import Electron, React, Node filesystem APIs, or environment-specific code.

---

## 4. Domain design

A new capability should become a domain when it has at least three of the following:

- distinct data model;
- persistent state;
- lifecycle;
- external integration;
- dedicated UI;
- background behaviour;
- domain-specific errors;
- domain-specific tests;
- independent release risk.

A domain should usually contain:

```text
shared/<domain>.ts
electron/<domain>/
client/src/components/<domain>/
client/src/hooks/use-<domain>-*.ts
client/src/lib/<domain>-*.ts
```

Each domain must define:

- canonical entities;
- owning service;
- public desktop API;
- events;
- persistence ownership;
- error model;
- observability;
- tests;
- documentation.

Avoid “utility” modules that quietly become domain owners.

---

## 5. Source layout conventions

### 5.1. Renderer

```text
client/src/
├── pages/          # route-level composition
├── components/     # reusable visual/domain components
├── hooks/          # stateful integration with desktop APIs
├── lib/            # pure renderer logic
└── env.d.ts        # typed window.devdeck surface
```

Rules:

- pages compose; they do not implement low-level data access;
- hooks own React Query calls and subscriptions;
- components receive explicit props;
- pure formatting, filtering, and scoring live in `lib/`;
- no IPC calls from arbitrary components.

### 5.2. Electron

```text
electron/
├── main.ts
├── preload.ts
├── <domain>/
│   ├── <domain>-service.ts
│   ├── <domain>-store.ts
│   ├── <domain>-errors.ts
│   └── *.test.ts
└── <domain>-ipc.ts
```

Rules:

- `main.ts` wires services; it should not accumulate domain logic;
- long-running operations belong in dedicated services;
- persistence is hidden behind repositories/stores;
- external APIs are wrapped behind DevDeck-owned clients;
- process execution uses dedicated safe helpers.

### 5.3. Shared

Prefer one domain entry file plus supporting schemas when needed.

Do not expose implementation-specific database or provider types across IPC.

---

## 6. Naming conventions

### Files

- kebab-case;
- domain prefix for ambiguous files;
- `.test.ts` beside focused unit targets;
- route pages use the existing project convention consistently.

### Types

- PascalCase;
- nouns for entities;
- `<Verb><Noun>Input` for command inputs;
- `<Noun>Summary` for reduced DTOs;
- `<Noun>Detail` for expanded DTOs;
- `<Domain>ErrorCode` for stable error enums.

### Functions

- verbs for commands;
- `get` for required single values;
- `find` for optional values;
- `list` for collections;
- `load` for storage or expensive assembly;
- `sync` for reconciliation with external state;
- `start` for long-running work;
- `cancel` for cooperative cancellation.

### Booleans

Use `is`, `has`, `can`, `should`, or `enabled` prefixes/suffixes with clear semantics.

---

## 7. IPC design

### 7.1. Contract-first workflow

For a new desktop capability:

1. define shared types and schemas;
2. define the `window.devdeck` API;
3. implement preload wrappers;
4. implement Electron handlers;
5. add renderer hooks;
6. add tests;
7. document the API.

### 7.2. IPC rules

- narrow methods over generic invoke endpoints;
- serialisable DTOs only;
- validate inputs at the boundary;
- normalise errors before returning;
- never expose raw stack traces to the renderer;
- support cancellation for long-running operations;
- events must include stable identifiers;
- subscriptions must return unsubscribe functions.

### 7.3. Long-running operations

Use command + event patterns:

```text
startScan(input) -> scan summary
scan progress events
getScan(scanId)
cancelScan(scanId)
```

Do not hold one IPC request open for minutes.

### 7.4. Error shape

```ts
export interface PublicError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

Public messages should be actionable and safe.

---

## 8. State management

### 8.1. Canonical state

Persisted domain state lives in Electron-owned storage.

React Query caches desktop state in the renderer. Local component state owns transient interaction state.

### 8.2. localStorage

Use localStorage only for:

- non-sensitive UI preferences;
- browser-shell fallback where already established;
- lightweight presentation state.

Do not use it for canonical domain state, credentials, scan results, or external-system snapshots.

### 8.3. Optimistic updates

Optimistic UI is allowed only when:

- the action is low risk;
- rollback is straightforward;
- conflict semantics are defined;
- external writes are not hidden.

---

## 9. Persistence and migrations

### 9.1. Storage choice

Choose storage based on access patterns:

- JSON for small append-oriented local state;
- SQLite for relational, query-heavy, versioned domains;
- Keychain for credentials;
- repository files only for project-owned configuration that should travel with Git.

### 9.2. Migrations

Every persisted schema change requires:

- versioned migration;
- forward migration test;
- compatibility consideration;
- backup strategy for destructive changes;
- clear failure behaviour;
- release-note entry when user-visible.

Migrations must be idempotent at the runner level and transactional where possible.

### 9.3. Data ownership

One service owns each store. Other domains access it through an API, not direct table or file access.

---

## 10. External integrations

Every external system must have:

- a DevDeck-owned client interface;
- authentication abstraction;
- timeout policy;
- retry policy;
- rate-limit handling;
- cancellation;
- normalised errors;
- mock or fixture support;
- observability;
- documented permissions.

Do not leak external API response shapes across the application.

### Credentials

- Keychain by default;
- never in renderer state;
- never in logs;
- never in exports;
- explicit revoke/remove flow.

---

## 11. Process and filesystem safety

### Process execution

- use `spawn` or equivalent with argument arrays;
- never interpolate untrusted values into a shell command;
- avoid `shell: true`;
- cap stdout/stderr;
- enforce timeouts;
- support cancellation;
- validate refs, paths, and arguments.

### Filesystem

- resolve canonical paths;
- restrict access to selected roots;
- prevent path traversal;
- define symlink policy;
- exclude secret and generated paths;
- avoid reading entire large files without bounds.

---

## 12. AI and agent engineering

### 12.1. AI is a bounded subsystem

A model may:

- classify;
- summarise;
- extract;
- compare;
- propose;
- explain.

A model must not be treated as:

- a source of truth;
- a permission authority;
- a credential owner;
- an action executor;
- a confidence oracle.

### 12.2. Model calls

Every production model call requires:

- provider abstraction;
- explicit policy;
- bounded context;
- redaction;
- structured output where practical;
- schema validation;
- evidence validation;
- timeout and cancellation;
- cost/token observability;
- fallback behaviour.

### 12.3. Prompts

Prompts must be:

- versioned;
- testable;
- stored in code or documented templates;
- explicit about untrusted input;
- explicit about evidence-only reasoning;
- evaluated against a corpus.

### 12.4. Agents

Agents require:

- declared responsibility;
- allowed tools;
- denied actions;
- scope;
- budget;
- traceability;
- cancellation;
- human handoff.

Avoid agents with broad, ambiguous objectives.

---

## 13. Feature flags

A risky or incremental feature requires a flag when it:

- changes persisted data;
- adds external writes;
- introduces a provider dependency;
- runs in background;
- changes critical navigation;
- has uncertain performance;
- needs staged rollout.

Flags must have:

- owner;
- default state;
- rollout plan;
- removal condition;
- kill-switch behaviour.

Do not leave permanent dead flags.

---

## 14. Observability requirements

Long-running operations must expose:

- start and completion;
- stable operation ID;
- progress where meaningful;
- current stage;
- cancellation;
- retry/degraded state;
- terminal error.

Structured logs should include IDs and error codes, not sensitive payloads.

Metrics should be tied to product and operational questions, not collected indiscriminately.

---

## 15. Testing strategy

### 15.1. Unit tests

Use for:

- pure transformations;
- scoring;
- ranking;
- normalisation;
- schemas;
- policy;
- path validation;
- error mapping.

### 15.2. Integration tests

Use for:

- SQLite;
- migrations;
- filesystem fixtures;
- Git repositories;
- external API mocks;
- IPC handlers;
- cancellation;
- retries;
- background state.

### 15.3. E2E tests

Use for critical user journeys:

- onboarding;
- workspace selection;
- integrations;
- scans;
- review flows;
- settings;
- packaging-sensitive desktop behaviour.

### 15.4. Security tests

Add focused tests for:

- credential leakage;
- shell injection;
- path traversal;
- symlink escape;
- prompt injection;
- stale writes;
- invalid model output.

### 15.5. Test quality

Tests should assert user-visible or contract-level behaviour. Avoid brittle snapshots of incidental markup or internal call order unless that order is part of the contract.

---

## 16. Performance engineering

Before optimising, define:

- expected scale;
- latency budget;
- memory budget;
- concurrency limits;
- cache strategy;
- cancellation requirements.

Prefer incremental work and bounded queues.

Do not perform large scans, indexing, or serialisation on the renderer thread.

Performance-sensitive features require representative fixtures and measurable acceptance criteria.

---

## 17. Dependency policy

A new dependency requires justification covering:

- capability provided;
- alternatives considered;
- maintenance activity;
- security posture;
- licence;
- bundle/package impact;
- native build impact;
- Electron compatibility;
- testability;
- exit strategy.

Prefer standard APIs and small focused packages over large frameworks when the abstraction cost is low.

Native dependencies must be validated in signed and notarised macOS builds early.

---

## 18. Documentation rules

Update documentation when a change affects:

- architecture;
- IPC;
- persisted schemas;
- setup;
- permissions;
- external integrations;
- feature flags;
- release process;
- agent contracts;
- security assumptions.

Use:

- RFC for significant proposed systems;
- ADR for architectural decisions;
- playbook updates for engineering process;
- API docs for contracts;
- README for user/contributor entry points.

Documentation should explain rationale, constraints, consequences, and operational behaviour.

---

## 19. ADR process

Create an ADR when a decision:

- changes a foundational boundary;
- selects a major dependency or storage system;
- introduces a long-term constraint;
- rejects a plausible alternative;
- affects multiple domains;
- has meaningful migration cost.

ADR states:

- Proposed;
- Accepted;
- Superseded;
- Deprecated;
- Rejected.

An ADR should contain context, decision, rationale, consequences, alternatives, and follow-up work.

Do not rewrite accepted ADR history. Supersede it with a new ADR.

---

## 20. Pull request expectations

A production PR should include:

- clear problem statement;
- scope and non-goals;
- architectural impact;
- screenshots for UI changes;
- tests;
- migration notes;
- security considerations;
- observability considerations;
- rollout/flag information;
- documentation updates;
- known limitations.

Keep PRs reviewable. Separate mechanical refactors from behavioural changes where practical.

---

## 21. Code review checklist

Reviewers should verify:

### Architecture

- correct layer owns the behaviour;
- shared contracts are stable and serialisable;
- no renderer-native boundary violation;
- domain ownership is clear.

### Correctness

- failure and partial states are handled;
- cancellation is supported where required;
- concurrency is bounded;
- stale data is visible.

### Security

- no credentials leak;
- paths and process arguments are validated;
- external content is treated as untrusted;
- permissions are minimal.

### Quality

- tests cover important behaviour;
- logs are safe and useful;
- documentation is updated;
- feature flags have a lifecycle.

---

## 22. Definition of Done

A change is complete when all applicable items are satisfied:

- functional requirements met;
- architecture boundaries respected;
- contracts and schemas updated;
- error and degraded states implemented;
- cancellation added for long-running work;
- unit/integration/E2E tests added;
- security risks reviewed;
- logs and metrics added where needed;
- migrations included and tested;
- accessibility reviewed;
- documentation updated;
- feature flags and rollout defined;
- `npm run check` passes;
- unit tests pass;
- E2E tests pass;
- production build passes;
- macOS packaging checks pass when relevant.

---

## 23. Release engineering

A release-affecting change must consider:

- signed build compatibility;
- notarisation;
- native module rebuilds;
- migration timing;
- backward compatibility;
- upgrade and rollback behaviour;
- release notes;
- diagnostics.

Do not defer packaging validation for native or Electron-sensitive changes until the end of a project.

---

## 24. Deprecation and removal

Before removing an API, schema, setting, feature flag, or persisted field:

1. identify consumers;
2. provide migration where needed;
3. document deprecation;
4. measure remaining use where possible;
5. remove tests and compatibility code deliberately;
6. update ADRs or API docs.

---

## 25. Working with coding agents

Agents contributing to DevDeck must:

- read `docs/ARCHITECTURE.md`;
- read this playbook;
- read relevant ADRs;
- inspect shared contracts before editing UI or IPC;
- preserve local-first behaviour;
- avoid broad refactors without explicit need;
- run type checks and focused tests;
- document cross-process changes;
- report uncertainty rather than inventing APIs.

Agent-generated changes are reviewed to the same standard as human-generated changes.

---

## 26. Escalation rules

Pause implementation and request an architectural decision when:

- two domains claim the same state;
- a feature needs renderer access to native capabilities;
- a migration risks data loss;
- an external write lacks conflict semantics;
- a model is being used as authority;
- a dependency introduces unclear packaging risk;
- background work lacks cancellation or budgets;
- security assumptions are undocumented.

---

## 27. Final standard

A good DevDeck change should be understandable in four ways:

1. from the user experience;
2. from the domain model;
3. from the runtime architecture;
4. from tests and observability.

When one of these views is missing, the implementation is usually incomplete.
