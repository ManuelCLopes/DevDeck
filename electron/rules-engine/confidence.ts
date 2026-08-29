import type { AssessmentSignal } from "../../shared/assessment";
import type { BacklogClassification, ConfidenceBand, SuggestedAction } from "../../shared/backlog";
import { toConfidenceBand } from "../../shared/backlog";

/**
 * Deterministic signal aggregation (Phase 4 — docs/ENGINEERING_BRAIN_RFC.md
 * section 21: "Confidence aggregation must be deterministic, versioned,
 * inspectable, and penalise contradictions."). Bump this whenever the
 * aggregation logic changes materially — electron/rules-engine/rules-scan.ts
 * stamps every persisted assessment with it (`assessments.engine_version`),
 * so a later re-scan can tell whether a stored assessment came from the
 * same rules or an older version of them.
 */
export const RULES_ENGINE_VERSION = "1";

/** Multiplies the winning classification's score down when its signals contradict another classification's — never zeroes it out, since the winning signal is still real evidence, just less trustworthy on its own. */
const CONTRADICTION_CONFIDENCE_PENALTY = 0.7;

/**
 * Classification pairs that cannot both be true of the same issue at
 * once. Order within a pair doesn't matter — both directions are
 * checked. Kept to genuinely opposed pairs the current signal set can
 * actually produce together (electron/rules-engine/signals.ts) rather
 * than every combinatorial possibility.
 */
const CONTRADICTORY_CLASSIFICATION_PAIRS: ReadonlyArray<
  readonly [BacklogClassification, BacklogClassification]
> = [["possibly_implemented", "possibly_obsolete"]];

const SUGGESTED_ACTION_BY_CLASSIFICATION: Record<BacklogClassification, SuggestedAction> = {
  insufficient_evidence: "investigate",
  needs_rewrite: "rewrite",
  partially_implemented: "investigate",
  possible_duplicate: "link_duplicate",
  possibly_implemented: "investigate",
  possibly_obsolete: "consider_closing",
  valid: "keep",
};

const CLASSIFICATION_SUMMARY: Record<BacklogClassification, string> = {
  insufficient_evidence: "Not enough evidence to assess.",
  needs_rewrite: "The issue description needs rewriting.",
  partially_implemented: "Partially implemented.",
  possible_duplicate: "Possible duplicate of another issue.",
  possibly_implemented: "Likely already implemented.",
  possibly_obsolete: "Possibly obsolete.",
  valid: "Still valid and unimplemented.",
};

export interface AggregatedAssessment {
  classification: BacklogClassification;
  confidence: number;
  confidenceBand: ConfidenceBand;
  contradictions: string[];
  evidenceIds: string[];
  openQuestions: string[];
  rationale: string;
  suggestedAction: SuggestedAction;
  summary: string;
}

/**
 * Combines every signal that fired for one issue into a single
 * assessment. Signals are grouped by classification and summed
 * (`score * weight`); the highest-scoring classification wins. A
 * contradictory pair both scoring (e.g. implementation evidence *and*
 * an obsolescence signal on the same issue) is recorded in
 * `contradictions` and discounts the winning score rather than being
 * silently dropped — the point of a rules-only baseline is that a human
 * can see exactly why it landed where it did.
 */
export function aggregateSignals(signals: AssessmentSignal[]): AggregatedAssessment {
  if (signals.length === 0) {
    // computeAssessmentSignals (signals.ts) always returns at least the
    // insufficient-evidence fallback, so this should never happen in
    // practice — stay honest rather than throw if it ever does.
    return {
      classification: "insufficient_evidence",
      confidence: 0.5,
      confidenceBand: toConfidenceBand(0.5),
      contradictions: [],
      evidenceIds: [],
      openQuestions: ["No rule produced a signal for this issue."],
      rationale: "No rule produced a signal for this issue.",
      suggestedAction: SUGGESTED_ACTION_BY_CLASSIFICATION.insufficient_evidence,
      summary: CLASSIFICATION_SUMMARY.insufficient_evidence,
    };
  }

  const scoreByClassification = new Map<BacklogClassification, number>();
  for (const signal of signals) {
    const current = scoreByClassification.get(signal.classification) ?? 0;
    scoreByClassification.set(signal.classification, current + signal.score * signal.weight);
  }

  // Array.prototype.sort is stable, so ties keep the classifications'
  // first-appearance order from `signals` — deterministic for the same
  // input, matching the RFC's requirement.
  const rankedClassifications = Array.from(scoreByClassification.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const [topClassification, topScore] = rankedClassifications[0];

  const contradictions: string[] = [];
  let confidencePenalty = 1;
  for (const [first, second] of CONTRADICTORY_CLASSIFICATION_PAIRS) {
    if (scoreByClassification.has(first) && scoreByClassification.has(second)) {
      contradictions.push(
        `Signals point to both "${first}" and "${second}" for this issue — the evidence conflicts and needs human review.`,
      );
      confidencePenalty = Math.min(confidencePenalty, CONTRADICTION_CONFIDENCE_PENALTY);
    }
  }

  const confidence = Math.max(0, Math.min(1, topScore * confidencePenalty));
  const contributingSignals = signals.filter(
    (signal) => signal.classification === topClassification,
  );
  const evidenceIds = Array.from(
    new Set(contributingSignals.flatMap((signal) => signal.evidenceIds)),
  );
  const rationale = contributingSignals.map((signal) => signal.explanation).join(" ");

  const openQuestions: string[] = [];
  if (topClassification === "insufficient_evidence") {
    openQuestions.push(
      "No repository evidence has been gathered for this issue yet — verify a repository mapping exists, then gather evidence before trusting this assessment.",
    );
  }
  if (contradictions.length > 0) {
    openQuestions.push("Review the conflicting signals before acting on this assessment.");
  }

  return {
    classification: topClassification,
    confidence,
    confidenceBand: toConfidenceBand(confidence),
    contradictions,
    evidenceIds,
    openQuestions,
    rationale,
    suggestedAction: SUGGESTED_ACTION_BY_CLASSIFICATION[topClassification],
    summary:
      contradictions.length > 0
        ? `${CLASSIFICATION_SUMMARY[topClassification]} (conflicting evidence found)`
        : CLASSIFICATION_SUMMARY[topClassification],
  };
}
