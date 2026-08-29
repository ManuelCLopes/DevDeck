import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useJiraProjectConfigs,
  useJiraRemoteProjects,
  usePreviewJiraJql,
  useSaveJiraProjectConfig,
} from "@/hooks/use-jira-projects";
import { useJiraSync } from "@/hooks/use-jira-sync";
import type { JiraConnection } from "@shared/jira";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";

interface JiraProjectSyncCardProps {
  connection: JiraConnection;
  onSelectedProjectConfigChange: (projectConfigId: string | null) => void;
  selectedProjectConfigId: string | null;
}

export default function JiraProjectSyncCard({
  connection,
  onSelectedProjectConfigChange,
  selectedProjectConfigId,
}: JiraProjectSyncCardProps) {
  const remoteProjectsQuery = useJiraRemoteProjects(true);
  const projectConfigsQuery = useJiraProjectConfigs(connection.id);
  const previewJql = usePreviewJiraJql();
  const saveProjectConfig = useSaveJiraProjectConfig();

  const [remoteProjectKey, setRemoteProjectKey] = useState("");
  const [jql, setJql] = useState("");

  const remoteProjects = remoteProjectsQuery.data ?? [];
  const projectConfigs = projectConfigsQuery.data ?? [];

  useEffect(() => {
    if (!remoteProjectKey && remoteProjects.length > 0) {
      setRemoteProjectKey(remoteProjects[0].key);
      setJql(`project = "${remoteProjects[0].key}"`);
    }
  }, [remoteProjectKey, remoteProjects]);

  useEffect(() => {
    if (!selectedProjectConfigId && projectConfigs.length > 0) {
      onSelectedProjectConfigChange(projectConfigs[0].id);
    }
  }, [onSelectedProjectConfigChange, projectConfigs, selectedProjectConfigId]);

  const selectedProjectConfig =
    projectConfigs.find((config) => config.id === selectedProjectConfigId) ?? null;

  const sync = useJiraSync(selectedProjectConfigId, connection.id);

  const handleSaveProject = () => {
    const remoteProject = remoteProjects.find((project) => project.key === remoteProjectKey);
    if (!remoteProject) {
      return;
    }
    saveProjectConfig.mutate(
      {
        connectionId: connection.id,
        jql: jql.trim() || null,
        name: remoteProject.name,
        projectKey: remoteProject.key,
      },
      {
        onSuccess: (savedConfig) => {
          onSelectedProjectConfigChange(savedConfig.id);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project & filter</CardTitle>
        <CardDescription>
          Pick a Jira project and a JQL filter to sync locally. Guided filters are not built
          yet — write JQL directly (see docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section
          13).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {projectConfigs.length > 0 ? (
          <div className="space-y-1">
            <Label>Configured projects</Label>
            <Select
              onValueChange={(value) => onSelectedProjectConfigChange(value)}
              value={selectedProjectConfigId ?? undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a configured project" />
              </SelectTrigger>
              <SelectContent>
                {projectConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.name} ({config.projectKey})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {selectedProjectConfig ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{selectedProjectConfig.name}</span>
              <Badge variant="outline">{selectedProjectConfig.projectKey}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              <div>
                Last full sync:{" "}
                {selectedProjectConfig.lastFullSyncAt
                  ? new Date(selectedProjectConfig.lastFullSyncAt).toLocaleString()
                  : "never"}
              </div>
              <div>
                Last incremental sync:{" "}
                {selectedProjectConfig.lastIncrementalSyncAt
                  ? new Date(selectedProjectConfig.lastIncrementalSyncAt).toLocaleString()
                  : "never"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                disabled={sync.isSyncing}
                onClick={() => sync.start("full")}
                size="sm"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Full sync
              </Button>
              <Button
                disabled={sync.isSyncing || !selectedProjectConfig.lastFullSyncAt}
                onClick={() => sync.start("incremental")}
                size="sm"
                variant="outline"
              >
                Incremental sync
              </Button>
            </div>
            {sync.operation && (sync.isSyncing || sync.operation.status === "failed") ? (
              <div className="space-y-1 pt-1">
                {sync.isSyncing ? (
                  <Progress value={Math.round(sync.operation.progress * 100)} />
                ) : null}
                {sync.operation.status === "failed" ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Sync failed ({sync.operation.errorCode ?? "unknown error"}). See the
                      connection card above for the latest Jira error message.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 border-t pt-3">
          <Label>Add or update a project</Label>
          <Select onValueChange={setRemoteProjectKey} value={remoteProjectKey || undefined}>
            <SelectTrigger>
              <SelectValue placeholder="Select a Jira project" />
            </SelectTrigger>
            <SelectContent>
              {remoteProjects.map((project) => (
                <SelectItem key={project.key} value={project.key}>
                  {project.name} ({project.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            onChange={(event) => setJql(event.target.value)}
            placeholder='project = "ENG" AND statusCategory != Done'
            rows={3}
            value={jql}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!jql.trim() || previewJql.isPending}
              onClick={() =>
                previewJql.mutate({ connectionId: connection.id, jql: jql.trim() })
              }
              size="sm"
              variant="outline"
            >
              <Search className="mr-2 h-4 w-4" />
              {previewJql.isPending ? "Checking…" : "Preview"}
            </Button>
            <Button
              disabled={!remoteProjectKey || saveProjectConfig.isPending}
              onClick={handleSaveProject}
              size="sm"
            >
              {saveProjectConfig.isPending ? "Saving…" : "Save project"}
            </Button>
            {previewJql.data ? (
              previewJql.data.valid ? (
                <span className="text-sm text-muted-foreground">
                  {previewJql.data.total} matching issue{previewJql.data.total === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-sm text-destructive">{previewJql.data.reason}</span>
              )
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
