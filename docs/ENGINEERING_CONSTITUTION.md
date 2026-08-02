# DevDeck Engineering Constitution

**Status:** Adopted principles for architecture and implementation  
**Scope:** All DevDeck product and engineering work

---

## 1. Evidence before intelligence

No model-generated conclusion is trusted without traceable evidence.

Every recommendation must expose the sources, assumptions, contradictions, and confidence signals that produced it. When evidence is insufficient, DevDeck must say so explicitly.

## 2. Local-first by default

Data, indexing, execution, and persistence should remain on the user’s machine whenever practical.

Remote services are optional enrichments, not hidden requirements. Features must degrade gracefully when external systems are unavailable.

## 3. Humans own decisions

DevDeck may analyse, rank, explain, and recommend. Humans approve irreversible or externally visible actions.

High-impact actions require preview, explicit confirmation, fresh-state validation, and an audit record.

## 4. Deterministic before probabilistic

Prefer explicit references, source metadata, Git history, code search, and rules before semantic retrieval or model reasoning.

A model is used to interpret bounded context, not to replace reliable system evidence.

## 5. AI remains optional

Core DevDeck workflows must remain useful when AI is disabled, unavailable, prohibited, or over budget.

Rules-only and local-only operating modes are permanent product capabilities.

## 6. Every recommendation is explainable

Avoid unexplained scores, opaque classifications, and unsupported certainty.

Users must be able to understand what DevDeck found, how it interpreted the evidence, and where uncertainty remains.

## 7. One canonical owner for each state

Do not duplicate authoritative state across renderer, Electron, files, and external systems.

Electron owns native and persisted desktop state. Shared contracts define cross-process truth. The renderer consumes state through typed APIs.

## 8. Domain boundaries are explicit

New capabilities should be implemented as coherent domains with clear contracts, storage ownership, events, and tests.

Do not spread domain logic across pages, IPC handlers, and utility files without an owning service boundary.

## 9. Electron is the desktop backend

Filesystem access, Git, credentials, databases, process execution, native OS APIs, and external integrations belong in Electron.

The renderer must never receive unrestricted native capabilities.

## 10. Security is a design input

Credentials, source code, issue content, provider prompts, repository paths, and external actions are protected assets.

Threat modelling, least privilege, redaction, path validation, and process isolation are required design work, not release polish.

## 11. External content is untrusted

Repository files, Jira issues, pull request comments, agent traces, and model output are untrusted inputs.

They may contain malicious instructions, malformed data, secrets, or misleading context. They must never redefine system policy or permissions.

## 12. Reproducibility over novelty

Important analyses must record versions, repository snapshots, source references, and configuration so that results can be reconstructed.

A result that cannot be explained or reproduced is not production-ready.

## 13. Incremental systems over repeated full work

Synchronisation, indexing, invalidation, and analysis should be incremental and targeted.

The system should understand what changed and only recompute what is affected.

## 14. Graceful degradation is mandatory

A GitHub outage should not disable local Git analysis. A model outage should not disable rules. One issue failure should not fail an entire scan.

Partial and stale states must be visible, not silently hidden.

## 15. Observability is part of the feature

Long-running and automated work must expose state, progress, timing, errors, cancellation, and degraded operation.

The user and maintainers should be able to understand what DevDeck is doing.

## 16. Feedback improves systems through explicit versions

Human feedback may inform rule, retrieval, and prompt improvements, but production behaviour must not mutate silently.

Meaningful behaviour changes require versioning, evaluation, review, and release notes.

## 17. Fewer dependencies, stronger abstractions

Add external dependencies only when they provide durable value and have acceptable maintenance, security, licensing, and packaging characteristics.

Wrap volatile integrations behind DevDeck-owned interfaces.

## 18. Documentation is part of the architecture

Architecture, ADRs, domain contracts, operational limits, and security assumptions must be documented alongside implementation.

A significant architectural decision is incomplete until its rationale and consequences are recorded.

## 19. Backwards compatibility is deliberate

Persisted schemas, IPC contracts, settings, and exports require versioning and migration strategies.

Breaking changes must be intentional, documented, and tested.

## 20. Build for trust

DevDeck should optimise for making engineering decisions safer, faster, and easier to verify—not for appearing autonomous or impressive.

Evidence, bounded claims, user control, and reliable execution take precedence over AI theatre.
