import AppLayout from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBacklogDiagnostics } from "@/hooks/use-backlog-diagnostics";
import { useBacklogFeatureFlags } from "@/hooks/use-backlog-feature-flags";
import { EMPTY_BACKLOG_SUMMARY } from "@shared/backlog";
import { AlertTriangle, DatabaseZap, Layers, ListChecks, ShieldAlert } from "lucide-react";

const SUMMARY_TILES: Array<{
  key: keyof typeof EMPTY_BACKLOG_SUMMARY;
  label: string;
}> = [
  { key: "syncedIssueCount", label: "Synced issues" },
  { key: "pendingReviewIssueCount", label: "Pending review" },
  { key: "connectedJiraProjectCount", label: "Jira projects" },
  { key: "mappedRepositoryCount", label: "Mapped repositories" },
];

function BacklogDisabledState() {
  return (
    <AppLayout>
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Backlog Intelligence is disabled</CardTitle>
            </div>
            <CardDescription>
              This capability is off by default while it is under active
              development. Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                DEVDECK_FEATURE_BACKLOG_INTELLIGENCE=true
              </code>{" "}
              to preview the current (empty) shell.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function Backlog() {
  const { data: featureFlags } = useBacklogFeatureFlags();
  const backlogIntelligenceEnabled = featureFlags?.backlogIntelligenceEnabled ?? false;
  const diagnostics = useBacklogDiagnostics(backlogIntelligenceEnabled);

  if (!backlogIntelligenceEnabled) {
    return <BacklogDisabledState />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Backlog</h1>
          <p className="text-sm text-muted-foreground">
            Compares planned Jira work with the real state of your
            repositories. Read-only, human-reviewed, evidence-backed — see{" "}
            <span className="font-mono text-xs">docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {SUMMARY_TILES.map((tile) => (
            <Card key={tile.key}>
              <CardHeader className="pb-2">
                <CardDescription>{tile.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-semibold">
                  {EMPTY_BACKLOG_SUMMARY[tile.key] ?? 0}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Get started</CardTitle>
            </div>
            <CardDescription>
              Jira connection, repository mapping, and scans are not
              available yet — this is the domain foundation shell only
              (Phase 1). Nothing here talks to Jira, GitHub, or a model
              provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled variant="outline">
              <ListChecks className="mr-2 h-4 w-4" />
              Connect Jira (coming soon)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Diagnostics</CardTitle>
            </div>
            <CardDescription>Local Backlog Intelligence database health.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {diagnostics.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : diagnostics.data ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={diagnostics.data.ready ? "default" : "destructive"}>
                    {diagnostics.data.ready ? "Ready" : "Not ready"}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Database:</span>{" "}
                  <span className="font-mono text-xs">
                    {diagnostics.data.databasePath || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Schema version:</span>{" "}
                  {diagnostics.data.schemaVersion}
                </div>
                <div>
                  <span className="text-muted-foreground">Applied migrations:</span>{" "}
                  {diagnostics.data.appliedMigrations.length > 0
                    ? diagnostics.data.appliedMigrations.join(", ")
                    : "none pending this session"}
                </div>
                {diagnostics.data.error ? (
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{diagnostics.data.error}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Diagnostics unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
