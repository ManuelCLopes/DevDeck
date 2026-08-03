# ADR-0005: Human-in-the-loop and read-only first

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Backlog Intelligence may eventually suggest or perform Jira changes. Early assessment quality will be uncertain, and business relevance cannot be established from code evidence alone.

## Decision

Initial releases are read-only. DevDeck analyses, explains, and recommends; users own decisions. Write-back is introduced only through explicit action proposals, confirmation, conflict checks, and audit.

## Rationale

This preserves trust, limits blast radius, and creates a feedback dataset before external mutation is enabled.

## Consequences

### Positive

- no accidental issue closure or rewrite;
- easier permission model;
- quality can be measured safely;
- human judgement remains authoritative.

### Negative

- users must apply changes manually at first;
- the workflow delivers insight before automation;
- write-back requires a later dedicated architecture phase.

## Alternatives considered

- automatic closure above a confidence threshold;
- immediate bulk updates;
- model-controlled actions.

## Follow-up

Define low-risk write actions and release gates after sufficient evaluation and user feedback.
