import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useResolvedRepositoryMapping } from "@/hooks/use-backlog-mapping";
import { useEvidenceGather, useIssueEvidence } from "@/hooks/use-evidence";
import { useJiraIssueDetail } from "@/hooks/use-jira-issue-detail";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import { getDesktopApi } from "@/lib/desktop";
import type { EvidenceItem } from "@shared/evidence";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileCode,
  GitCommitHorizontal,
  Github,
  RefreshCw,
} from "lucide-react";

const EVIDENCE_KIND_LABELS: Record<EvidenceItem["kind"], string> = {
  code_file: "Code match",
  code_symbol: "Code symbol",
  component_removed: "Component removed",
  configuration: "Configuration",
  documentation: "Documentation",
  git_commit: "Commit",
  github_pull_request: "Pull request",
  jira_comment: "Jira comment",
  jira_field: "Jira field",
  jira_history: "Jira history",
  jira_link: "Jira link",
  migration: "Migration",
  repository_activity: "Repository activity",
  test: "Test",
};

const EVIDENCE_KIND_ICONS: Partial<Record<EvidenceItem["kind"], typeof FileCode>> = {
  code_file: FileCode,
  git_commit: GitCommitHorizontal,
  github_pull_request: Github,
};

interface BacklogIssueDetailProps {
  issueKey?: string;
}

export default function BacklogIssueDetail({ issueKey }: BacklogIssueDetailProps) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const projectConfigId = searchParams.get("projectConfigId");
  const projectKey = searchParams.get("projectKey");

  const normalizedIssueKey = issueKey ?? null;
  const issueDetailQuery = useJiraIssueDetail(normalizedIssueKey);
  const workspaceSelection = useWorkspaceSelection();

  const resolveInput = useMemo(() => {
    if (!issueDetailQuery.data || !projectKey) {
      return null;
    }
    return {
      components: issueDetailQuery.data.record.components,
      issueKey: issueDetailQuery.data.record.issueKey,
      jiraProjectKey: projectKey,
      labels: issueDetailQuery.data.record.labels,
    };
  }, [issueDetailQuery.data, projectKey]);
  const mappingQuery = useResolvedRepositoryMapping(resolveInput);

  const repositories = useMemo(() => {
    if (!mappingQuery.data || !workspaceSelection) {
      return [];
    }
    return mappingQuery.data.localProjectIds
      .map((id) => workspaceSelection.projects.find((project) => project.id === id))
      .filter((project): project is NonNullable<typeof project> => Boolean(project?.localPath))
      .map((project) => ({
        githubRepositorySlug: project.githubRepositorySlug ?? null,
        localProjectId: project.id,
        repositoryPath: project.localPath as string,
      }));
  }, [mappingQuery.data, workspaceSelection]);

  const evidenceQuery = useIssueEvidence(projectConfigId, normalizedIssueKey);
  const gather = useEvidenceGather(projectConfigId, normalizedIssueKey);

  const issue = issueDetailQuery.data;
  const evidenceItems = evidenceQuery.data ?? [];

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <Button
          className="w-fit"
          onClick={() => setLocation("/backlog")}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Backlog
        </Button>

        {issueDetailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !issue ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Issue {normalizedIssueKey} isn't synced locally yet. Run a sync from the Backlog
              page first.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{issue.record.issueKey}</h1>
                <Badge variant="outline">{issue.record.issueType}</Badge>
                <Badge>{issue.record.status}</Badge>
                {issue.record.outOfScope ? (
                  <Badge variant="outline">out of scope</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-lg">{issue.record.summary}</p>
              {issue.record.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {issue.record.description}
                </p>
              ) : null}
              {(issue.record.labels.length > 0 || issue.record.components.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {issue.record.labels.map((label) => (
                    <Badge key={`label-${label}`} variant="outline">
                      {label}
                    </Badge>
                  ))}
                  {issue.record.components.map((component) => (
                    <Badge key={`component-${component}`} variant="outline">
                      {component}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {issue.comments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Comments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {issue.comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border p-2 text-sm">
                      <div className="text-xs text-muted-foreground">
                        {comment.author ?? "Unknown"} ·{" "}
                        {new Date(comment.jiraCreatedAt).toLocaleString()}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evidence</CardTitle>
                <CardDescription>
                  Deterministic evidence only — no model involved. Evidence never implies the
                  issue should be closed; a human still decides.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!projectKey ? (
                  <p className="text-sm text-muted-foreground">
                    Open this issue from the Backlog page's issue table so the project context
                    carries over.
                  </p>
                ) : repositories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No repository mapping resolves for this issue yet — add one below the issue
                    table on the Backlog page.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      disabled={gather.isGathering}
                      onClick={() => gather.start(repositories)}
                      size="sm"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {gather.isGathering ? "Gathering…" : "Gather evidence"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {repositories.length} repositor{repositories.length === 1 ? "y" : "ies"}{" "}
                      mapped
                    </span>
                  </div>
                )}

                {gather.isGathering && gather.operation ? (
                  <Progress value={Math.round(gather.operation.progress * 100)} />
                ) : null}
                {gather.operation?.status === "failed" ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Evidence gathering failed ({gather.operation.errorCode ?? "unknown error"}).
                    </AlertDescription>
                  </Alert>
                ) : null}

                {evidenceItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No evidence gathered yet for this issue.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {evidenceItems.map((item) => {
                      const Icon = EVIDENCE_KIND_ICONS[item.kind] ?? FileCode;
                      return (
                        <li key={item.id} className="rounded-md border p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="outline">{EVIDENCE_KIND_LABELS[item.kind]}</Badge>
                            <Badge
                              variant={
                                item.strength === "high"
                                  ? "default"
                                  : item.strength === "medium"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {item.strength}
                            </Badge>
                          </div>
                          {item.title ? <p className="mt-1 font-medium">{item.title}</p> : null}
                          {item.excerpt ? (
                            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                              {item.excerpt}
                            </p>
                          ) : null}
                          <div className="mt-1 flex items-center gap-2">
                            {item.filePath ? (
                              <Button
                                onClick={() => getDesktopApi()?.openInCode(item.filePath as string)}
                                size="sm"
                                variant="ghost"
                              >
                                {item.filePath}
                              </Button>
                            ) : null}
                            {item.sourceUrl ? (
                              <a
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                href={item.sourceUrl}
                                onClick={(event) => {
                                  event.preventDefault();
                                  void getDesktopApi()?.openExternal(item.sourceUrl as string);
                                }}
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
