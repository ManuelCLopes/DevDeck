import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useProjectAssessmentSummary, useRulesScan, useRulesScans } from "@/hooks/use-assessments";
import { CLASSIFICATION_LABELS } from "@/lib/assessment-labels";
import type { BacklogClassification } from "@shared/backlog";
import { AlertTriangle, ScanSearch } from "lucide-react";

interface RulesScanCardProps {
  jiraProjectId: string;
}

// Excludes "valid" — the current rule set never produces it (see
// electron/rules-engine/signals.ts), so showing a permanent zero for it
// would be misleading rather than informative.
const DISPLAYED_CLASSIFICATIONS: BacklogClassification[] = [
  "possibly_implemented",
  "possibly_obsolete",
  "possible_duplicate",
  "insufficient_evidence",
  "partially_implemented",
  "needs_rewrite",
];

export default function RulesScanCard({ jiraProjectId }: RulesScanCardProps) {
  const summaryQuery = useProjectAssessmentSummary(jiraProjectId);
  const scansQuery = useRulesScans(jiraProjectId);
  const scan = useRulesScan(jiraProjectId);

  const summary = summaryQuery.data;
  const latestScan = scansQuery.data?.[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Rules-only backlog scan</CardTitle>
        </div>
        <CardDescription>
          Deterministic, no model involved — every classification below is derived from
          gathered evidence, Jira's own sync state, and issue links. Nothing is closed or
          changed automatically; review each assessment on its issue page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={scan.isScanning} onClick={() => scan.start()} size="sm">
            {scan.isScanning ? "Scanning…" : "Run scan"}
          </Button>
          {summary?.lastScanAt ? (
            <span className="text-xs text-muted-foreground">
              Last scan: {new Date(summary.lastScanAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No scan has run yet.</span>
          )}
        </div>

        {scan.isScanning && scan.operation ? (
          <Progress value={Math.round(scan.operation.progress * 100)} />
        ) : null}
        {scan.operation?.status === "failed" ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Scan failed ({scan.operation.errorCode ?? "unknown error"}).</span>
          </div>
        ) : null}

        {summary ? (
          <div className="flex flex-wrap gap-2">
            {DISPLAYED_CLASSIFICATIONS.map((classification) => (
              <Badge key={classification} variant="outline">
                {CLASSIFICATION_LABELS[classification]}: {summary.countsByClassification[classification]}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run a scan to see a classification breakdown for this project's synced issues.
          </p>
        )}

        {latestScan && latestScan.failedIssueCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {latestScan.failedIssueCount} issue(s) failed to assess in the last scan — they kept
            their previous assessment, if any.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
