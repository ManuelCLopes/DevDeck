import { useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useJiraIssues } from "@/hooks/use-jira-issues";
import { ListChecks } from "lucide-react";

const PAGE_SIZE = 25;

interface JiraIssuesTableProps {
  projectConfigId: string | null;
  projectKey: string | null;
}

export default function JiraIssuesTable({ projectConfigId, projectKey }: JiraIssuesTableProps) {
  const [, setLocation] = useLocation();
  const [offset, setOffset] = useState(0);
  const issuesQuery = useJiraIssues(projectConfigId, { limit: PAGE_SIZE, offset });

  const openIssue = (issueKey: string) => {
    const params = new URLSearchParams();
    if (projectConfigId) {
      params.set("projectConfigId", projectConfigId);
    }
    if (projectKey) {
      params.set("projectKey", projectKey);
    }
    setLocation(`/backlog/issues/${encodeURIComponent(issueKey)}?${params.toString()}`);
  };

  const issues = issuesQuery.data?.issues ?? [];
  const total = issuesQuery.data?.total ?? 0;
  const hasNextPage = offset + PAGE_SIZE < total;
  const hasPreviousPage = offset > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Synced issues</CardTitle>
        </div>
        <CardDescription>
          Local, offline copy of the last sync — {total} issue{total === 1 ? "" : "s"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!projectConfigId ? (
          <p className="text-sm text-muted-foreground">
            Configure and sync a project above to see issues here.
          </p>
        ) : issuesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No synced issues yet. Run a full sync above.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow
                      key={issue.issueKey}
                      className={`cursor-pointer ${issue.outOfScope ? "opacity-60" : ""}`}
                      onClick={() => openIssue(issue.issueKey)}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        <span className="text-primary hover:underline">{issue.issueKey}</span>
                        {issue.outOfScope ? (
                          <Badge className="ml-2" variant="outline">
                            out of scope
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-md truncate">{issue.summary}</TableCell>
                      <TableCell className="whitespace-nowrap">{issue.issueType}</TableCell>
                      <TableCell className="whitespace-nowrap">{issue.status}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(issue.jiraUpdatedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={!hasPreviousPage}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  size="sm"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={!hasNextPage}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  size="sm"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
