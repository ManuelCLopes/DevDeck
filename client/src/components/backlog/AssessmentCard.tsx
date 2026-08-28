import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useAssessmentFeedback,
  useIssueAssessment,
  useSubmitAssessmentFeedback,
} from "@/hooks/use-assessments";
import {
  CLASSIFICATION_LABELS,
  CONFIDENCE_BAND_BADGE_VARIANT,
  SUGGESTED_ACTION_LABELS,
} from "@/lib/assessment-labels";
import type { BacklogClassification } from "@shared/backlog";
import type { EvidenceItem } from "@shared/evidence";
import { AlertTriangle, ScanSearch } from "lucide-react";

interface AssessmentCardProps {
  evidenceItems: EvidenceItem[];
  issueKey: string;
}

const CLASSIFICATION_OPTIONS = Object.keys(CLASSIFICATION_LABELS) as BacklogClassification[];

/**
 * Read-only view of the issue's most recent rules-only assessment
 * (Phase 4), plus human feedback controls. Scans only run project-wide
 * from the Backlog page's RulesScanCard — this card has no "assess this
 * issue" button of its own; it just reflects whatever the latest scan
 * produced.
 */
export default function AssessmentCard({ evidenceItems, issueKey }: AssessmentCardProps) {
  const assessmentQuery = useIssueAssessment(issueKey);
  const assessment = assessmentQuery.data ?? null;
  const feedbackQuery = useAssessmentFeedback(assessment?.id ?? null);
  const submitFeedback = useSubmitAssessmentFeedback(issueKey);

  const [correctedClassification, setCorrectedClassification] = useState<
    BacklogClassification | ""
  >("");
  const [note, setNote] = useState("");
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!assessmentQuery.isLoading && !assessment) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Assessment</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No assessment yet — run a rules scan for this project from the Backlog page.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!assessment) {
    return null;
  }

  const citedEvidence = evidenceItems.filter((item) => assessment.evidenceIds.includes(item.id));
  const feedback = feedbackQuery.data ?? [];
  const latestFeedback = feedback[feedback.length - 1] ?? null;

  const handleFeedback = async (decision: "accepted" | "corrected" | "rejected") => {
    setIsSubmitting(true);
    try {
      await submitFeedback({
        assessmentId: assessment.id,
        correctedClassification: decision === "corrected" ? correctedClassification || null : null,
        decision,
        note: note.trim() || null,
      });
      setIsCorrecting(false);
      setNote("");
      setCorrectedClassification("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <ScanSearch className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Assessment</CardTitle>
          <Badge>{CLASSIFICATION_LABELS[assessment.classification]}</Badge>
          <Badge variant={CONFIDENCE_BAND_BADGE_VARIANT[assessment.confidenceBand]}>
            {Math.round(assessment.confidence * 100)}% confidence
          </Badge>
        </div>
        <CardDescription>
          Deterministic, no model involved — a human still decides. Assessed{" "}
          {new Date(assessment.createdAt).toLocaleString()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{assessment.rationale}</p>

        <div className="text-sm">
          <span className="text-muted-foreground">Suggested action:</span>{" "}
          {SUGGESTED_ACTION_LABELS[assessment.suggestedAction]}
        </div>

        {assessment.contradictions.length > 0 ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc pl-4">
                {assessment.contradictions.map((contradiction) => (
                  <li key={contradiction}>{contradiction}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {assessment.openQuestions.length > 0 ? (
          <div className="text-sm">
            <span className="text-muted-foreground">Open questions:</span>
            <ul className="mt-1 list-disc pl-4">
              {assessment.openQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {citedEvidence.length > 0 ? (
          <div className="text-sm">
            <span className="text-muted-foreground">Cited evidence:</span>
            <ul className="mt-1 list-disc pl-4">
              {citedEvidence.map((item) => (
                <li key={item.id}>{item.title ?? item.excerpt ?? item.kind}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2 border-t pt-3">
          {latestFeedback ? (
            <p className="text-xs text-muted-foreground">
              Feedback recorded: {latestFeedback.decision}
              {latestFeedback.note ? ` — "${latestFeedback.note}"` : ""}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={isSubmitting}
              onClick={() => void handleFeedback("accepted")}
              size="sm"
              variant="outline"
            >
              Accept
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => void handleFeedback("rejected")}
              size="sm"
              variant="outline"
            >
              Reject
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => setIsCorrecting((current) => !current)}
              size="sm"
              variant="outline"
            >
              Correct classification
            </Button>
          </div>

          {isCorrecting ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                onValueChange={(value) =>
                  setCorrectedClassification(value as BacklogClassification)
                }
                value={correctedClassification}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Correct classification" />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICATION_OPTIONS.map((classification) => (
                    <SelectItem key={classification} value={classification}>
                      {CLASSIFICATION_LABELS[classification]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={isSubmitting || !correctedClassification}
                onClick={() => void handleFeedback("corrected")}
                size="sm"
              >
                Submit correction
              </Button>
            </div>
          ) : null}

          <Textarea
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note…"
            value={note}
          />
        </div>
      </CardContent>
    </Card>
  );
}
