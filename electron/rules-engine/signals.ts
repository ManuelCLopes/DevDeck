import { randomUUID } from "node:crypto";
import type { AssessmentSignal } from "../../shared/assessment";
import type { EvidenceItem } from "../../shared/evidence";
import type { JiraIssueDetail } from "../../shared/jira";

/**
 * Deterministic, rules-only signal generation (Phase 4 —
 * docs/ENGINEERING_BRAIN_RFC.md section 21 "Rules engine"). Every
 * function here is pure: same issue + evidence in, same signals out, no
 * model call, no I/O. electron/rules-engine/confidence.ts aggregates
 * whatever fires here into one Assessment.
 *
 * The RFC lists six rule categories: implementation, obsolescence,
 * duplicate, stale specification, contradiction, and insufficient
 * evidence. This v1 covers four of them from data Phase 2/3 already
 * collect — implementation (git/PR/code evidence), obsolescence (a
 * project's own JQL filter dropping the issue), duplicate (a Jira issue
 * link naming it a duplicate), and insufficient evidence (the fallback
 * when nothing else fires). "Stale specification evidence" needs
 * comparing an issue's description against what the code actually does
 * — a job for Phase 5's model layer, not something a rule can do
 * reliably. "Contradiction" isn't a signal generator here; it's
 * detected in confidence.ts from signals two of these functions already
 * produced (e.g. implementation evidence *and* an obsolescence signal
 * firing for the same issue).
 */

function buildSignal(input: Omit<AssessmentSignal, "id">): AssessmentSignal {
  return { id: randomUUID(), ...input };
}

/**
 * A git commit or GitHub pull request that names the issue key
 * verbatim is the strongest evidence this dataset can produce (weighted
 * "high" by evidence-gather.ts) — enough on its own to suggest the work
 * happened. A lexical code match without either is weaker: it proves
 * the issue key appears somewhere in the repository (often just a code
 * comment or a test name), not that the work was done, so it scores
 * well under the implementation threshold.
 */
export function computeImplementationSignals(evidence: EvidenceItem[]): AssessmentSignal[] {
  const strongEvidence = evidence.filter(
    (item) =>
      (item.kind === "git_commit" || item.kind === "github_pull_request") &&
      item.strength === "high",
  );
  if (strongEvidence.length > 0) {
    return [
      buildSignal({
        category: "implementation_evidence",
        classification: "possibly_implemented",
        evidenceIds: strongEvidence.map((item) => item.id),
        explanation: `Found ${strongEvidence.length} commit(s) or pull request(s) that reference this issue directly.`,
        score: Math.min(1, 0.6 + 0.1 * strongEvidence.length),
        weight: 1,
      }),
    ];
  }

  const codeMatches = evidence.filter((item) => item.kind === "code_file");
  if (codeMatches.length > 0) {
    return [
      buildSignal({
        category: "implementation_evidence",
        classification: "possibly_implemented",
        // Capped — citing every match adds noise past the first few,
        // and the count is already in the explanation.
        evidenceIds: codeMatches.slice(0, 5).map((item) => item.id),
        explanation: `Found ${codeMatches.length} code reference(s) to this issue, but no commit or pull request explicitly linked to it.`,
        score: 0.45,
        weight: 1,
      }),
    ];
  }

  return [];
}

/**
 * `outOfScope` is set by runFullJiraSync (electron/jira/jira-sync.ts)
 * when an issue this project previously synced no longer matches its
 * configured JQL filter — a real, deterministic fact about this issue's
 * relationship to the tracked backlog, not a guess. It doesn't cite an
 * `evidence` row because it isn't collected evidence; it's Jira's own
 * sync state, which the explanation states directly.
 */
export function computeObsolescenceSignal(issue: JiraIssueDetail): AssessmentSignal[] {
  if (!issue.record.outOfScope) {
    return [];
  }

  return [
    buildSignal({
      category: "obsolescence_evidence",
      classification: "possibly_obsolete",
      evidenceIds: [],
      explanation:
        "This issue no longer matches the project's configured Jira sync filter (marked out of scope by the last full sync) — it may have been resolved, closed, or moved outside the tracked backlog.",
      score: 0.7,
      weight: 1,
    }),
  ];
}

/**
 * A Jira issue link whose type names *this* issue as the duplicate is an
 * explicit, human-asserted relationship — stronger than an inferred one.
 *
 * `linkType` (jira-normalizer.ts's `normalizeIssueLink`) is already
 * direction-correct for this issue: Jira's outward phrasing ("duplicates")
 * when this issue is the outward endpoint, or the inward phrasing ("is
 * duplicated by") when it's the inward endpoint. Those mean opposite
 * things — "duplicates" says *this* issue is the duplicate; "is
 * duplicated by" says the *related* issue is. Matching on the substring
 * "duplicate" would fire on both and misclassify the original half of
 * every such pair, so this only matches the outward phrasing.
 *
 * One signal per matching link, since an issue can duplicate more than
 * one other issue.
 */
export function computeDuplicateSignals(issue: JiraIssueDetail): AssessmentSignal[] {
  return issue.links
    .filter((link) => link.linkType.toLowerCase().startsWith("duplicate"))
    .map((link) =>
      buildSignal({
        category: "duplicate_evidence",
        classification: "possible_duplicate",
        evidenceIds: [],
        explanation: `Jira link "${link.linkType}" to ${link.relatedIssueKey} suggests this may be a duplicate.`,
        score: 0.75,
        weight: 1,
      }),
    );
}

/**
 * The fallback when nothing else fired: no implementation, obsolescence,
 * or duplicate signal means there is nothing this rule set can ground a
 * classification in, and the acceptance criteria explicitly forbid
 * guessing from age or any other evidence-free heuristic (docs/
 * BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md Phase 4: "no age-only
 * classifications"). `insufficient_evidence` says so honestly instead.
 */
export function computeInsufficientEvidenceSignal(evidence: EvidenceItem[]): AssessmentSignal[] {
  if (evidence.length > 0) {
    return [];
  }

  return [
    buildSignal({
      category: "insufficient_evidence",
      classification: "insufficient_evidence",
      evidenceIds: [],
      explanation:
        "No repository evidence (commits, pull requests, or code references) has been gathered for this issue yet.",
      score: 0.55,
      weight: 1,
    }),
  ];
}

/**
 * Runs every rule and falls back to insufficient-evidence only when
 * none of the evidence-grounded rules fired — an obsolescence or
 * duplicate signal is a real basis for an assessment even when the
 * repository side found nothing.
 */
export function computeAssessmentSignals(
  issue: JiraIssueDetail,
  evidence: EvidenceItem[],
): AssessmentSignal[] {
  const signals = [
    ...computeImplementationSignals(evidence),
    ...computeObsolescenceSignal(issue),
    ...computeDuplicateSignals(issue),
  ];

  if (signals.length === 0) {
    return computeInsufficientEvidenceSignal(evidence);
  }

  return signals;
}
