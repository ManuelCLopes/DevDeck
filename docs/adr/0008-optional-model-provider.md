# ADR-0008: Optional model-provider abstraction

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Model capabilities, privacy requirements, pricing, and availability change over time. Binding assessment logic directly to one provider would create lock-in and make rules-only operation harder.

## Decision

All model use goes through a DevDeck-owned provider abstraction. Model-assisted assessment is optional, policy-controlled, and has a rules-only fallback.

## Rationale

The abstraction separates domain logic from provider APIs, supports local or remote models, and makes testing and degraded operation practical.

## Consequences

### Positive

- providers can be replaced or added;
- tests use deterministic fakes;
- model outages do not disable core analysis;
- privacy and budget policy is centralised.

### Negative

- lowest-common-denominator contracts may limit provider-specific features;
- capability negotiation is required;
- provider configuration adds UI and diagnostics work.

## Alternatives considered

- direct integration with one provider;
- model calls from the renderer;
- mandatory local model runtime.

## Follow-up

Define structured completion, cancellation, usage reporting, and provider-capability contracts before the first integration.
