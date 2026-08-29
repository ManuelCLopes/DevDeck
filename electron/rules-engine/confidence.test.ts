import test from "node:test";
import assert from "node:assert/strict";
import type { AssessmentSignal } from "../../shared/assessment";
import { aggregateSignals } from "./confidence";

function buildSignal(overrides: Partial<AssessmentSignal> = {}): AssessmentSignal {
  return {
    category: "implementation_evidence",
    classification: "possibly_implemented",
    evidenceIds: ["evidence-1"],
    explanation: "Found evidence.",
    id: "signal-1",
    score: 0.8,
    weight: 1,
    ...overrides,
  };
}

test("aggregateSignals picks the highest-scoring classification and cites its evidence", () => {
  const strong = buildSignal({
    classification: "possibly_implemented",
    evidenceIds: ["evidence-1", "evidence-2"],
    score: 0.8,
  });
  const weak = buildSignal({
    category: "duplicate_evidence",
    classification: "possible_duplicate",
    evidenceIds: [],
    score: 0.3,
  });

  const result = aggregateSignals([strong, weak]);

  assert.equal(result.classification, "possibly_implemented");
  assert.equal(result.confidence, 0.8);
  assert.equal(result.confidenceBand, "medium");
  assert.deepEqual(result.evidenceIds, ["evidence-1", "evidence-2"]);
  assert.deepEqual(result.contradictions, []);
  assert.equal(result.suggestedAction, "investigate");
});

test("aggregateSignals sums multiple signals for the same classification", () => {
  const first = buildSignal({ evidenceIds: ["evidence-1"], score: 0.4 });
  const second = buildSignal({ evidenceIds: ["evidence-2"], score: 0.3 });

  const result = aggregateSignals([first, second]);

  assert.equal(result.classification, "possibly_implemented");
  // 0.4 + 0.3, floating point tolerance.
  assert.ok(Math.abs(result.confidence - 0.7) < 1e-9);
  assert.deepEqual(result.evidenceIds, ["evidence-1", "evidence-2"]);
});

test("aggregateSignals caps confidence at 1 even when signals sum past it", () => {
  const first = buildSignal({ score: 0.8 });
  const second = buildSignal({ score: 0.8 });

  const result = aggregateSignals([first, second]);

  assert.equal(result.confidence, 1);
});

test("aggregateSignals records a contradiction and discounts confidence when opposing classifications both score", () => {
  const implemented = buildSignal({
    classification: "possibly_implemented",
    evidenceIds: ["evidence-1"],
    score: 0.8,
  });
  const obsolete = buildSignal({
    category: "obsolescence_evidence",
    classification: "possibly_obsolete",
    evidenceIds: [],
    score: 0.7,
  });

  const result = aggregateSignals([implemented, obsolete]);

  assert.equal(result.classification, "possibly_implemented");
  assert.equal(result.contradictions.length, 1);
  assert.match(result.contradictions[0], /possibly_implemented/);
  assert.match(result.contradictions[0], /possibly_obsolete/);
  // 0.8 (winning score) * 0.7 (contradiction penalty).
  assert.ok(Math.abs(result.confidence - 0.56) < 1e-9);
  assert.ok(result.openQuestions.length > 0);
});

test("aggregateSignals does not record a contradiction for classifications that aren't an opposing pair", () => {
  const implemented = buildSignal({ classification: "possibly_implemented", score: 0.6 });
  const duplicate = buildSignal({
    category: "duplicate_evidence",
    classification: "possible_duplicate",
    evidenceIds: [],
    score: 0.5,
  });

  const result = aggregateSignals([implemented, duplicate]);

  assert.deepEqual(result.contradictions, []);
  assert.equal(result.confidence, 0.6);
});

test("aggregateSignals maps insufficient_evidence to an open question and the investigate action", () => {
  const signal = buildSignal({
    category: "insufficient_evidence",
    classification: "insufficient_evidence",
    evidenceIds: [],
    score: 0.55,
  });

  const result = aggregateSignals([signal]);

  assert.equal(result.classification, "insufficient_evidence");
  assert.equal(result.suggestedAction, "investigate");
  assert.ok(result.openQuestions.length > 0);
});

test("aggregateSignals is deterministic for the same input", () => {
  const signals = [
    buildSignal({ evidenceIds: ["evidence-1"], score: 0.6 }),
    buildSignal({
      category: "obsolescence_evidence",
      classification: "possibly_obsolete",
      evidenceIds: [],
      score: 0.7,
    }),
  ];

  const first = aggregateSignals(signals);
  const second = aggregateSignals(signals);

  assert.deepEqual(first, second);
});
