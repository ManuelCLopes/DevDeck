import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBacklogMappings,
  useDeleteBacklogMapping,
  useSaveBacklogMapping,
} from "@/hooks/use-backlog-mapping";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import type { RepositoryMappingMatch } from "@shared/backlog";
import { FolderGit2, Trash2 } from "lucide-react";

interface RepositoryMappingCardProps {
  jiraProjectKey: string;
}

const MATCH_TYPE_LABELS: Record<RepositoryMappingMatch["type"], string> = {
  component: "Component",
  issue: "Issue key",
  label: "Label",
  project_default: "Project default (fallback)",
};

function describeMatch(match: RepositoryMappingMatch): string {
  return match.type === "project_default"
    ? MATCH_TYPE_LABELS.project_default
    : `${MATCH_TYPE_LABELS[match.type]}: ${match.value}`;
}

export default function RepositoryMappingCard({ jiraProjectKey }: RepositoryMappingCardProps) {
  const workspaceSelection = useWorkspaceSelection();
  const mappingsQuery = useBacklogMappings(jiraProjectKey);
  const saveMapping = useSaveBacklogMapping();
  const deleteMapping = useDeleteBacklogMapping(jiraProjectKey);

  const [matchType, setMatchType] = useState<RepositoryMappingMatch["type"]>("project_default");
  const [matchValue, setMatchValue] = useState("");
  const [priority, setPriority] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const availableProjects = workspaceSelection?.projects ?? [];
  const mappings = mappingsQuery.data ?? [];

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  };

  const handleSave = () => {
    if (selectedProjectIds.length === 0) {
      return;
    }
    const match: RepositoryMappingMatch =
      matchType === "project_default"
        ? { type: "project_default" }
        : { type: matchType, value: matchValue.trim() };
    if (match.type !== "project_default" && !match.value) {
      return;
    }

    saveMapping.mutate(
      {
        enabled: true,
        jiraProjectKey,
        localProjectIds: selectedProjectIds,
        match,
        priority,
      },
      {
        onSuccess: () => {
          setMatchValue("");
          setSelectedProjectIds([]);
          setPriority(0);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Repository mapping</CardTitle>
        </div>
        <CardDescription>
          Which local repositories back this Jira project. Nothing is scanned implicitly —
          only issues matched by an enabled rule below use these repositories as evidence
          sources.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mappings.length > 0 ? (
          <ul className="space-y-2">
            {mappings.map((mapping) => (
              <li
                key={mapping.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div>
                  <Badge variant="outline">{describeMatch(mapping.match)}</Badge>
                  <span className="ml-2 text-muted-foreground">
                    {mapping.localProjectIds.length} repositor
                    {mapping.localProjectIds.length === 1 ? "y" : "ies"} · priority{" "}
                    {mapping.priority}
                  </span>
                </div>
                <Button
                  disabled={deleteMapping.isPending}
                  onClick={() => deleteMapping.mutate(mapping.id)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No mapping rules yet.</p>
        )}

        <div className="space-y-3 border-t pt-3">
          <Label>Add a rule</Label>
          <div className="flex flex-wrap gap-2">
            <Select
              onValueChange={(value) => setMatchType(value as RepositoryMappingMatch["type"])}
              value={matchType}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MATCH_TYPE_LABELS) as Array<RepositoryMappingMatch["type"]>).map(
                  (type) => (
                    <SelectItem key={type} value={type}>
                      {MATCH_TYPE_LABELS[type]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {matchType !== "project_default" ? (
              <Input
                className="w-[180px]"
                onChange={(event) => setMatchValue(event.target.value)}
                placeholder={matchType === "issue" ? "ENG-123" : matchType}
                value={matchValue}
              />
            ) : null}
            <Input
              className="w-[100px]"
              min={0}
              onChange={(event) => setPriority(Number(event.target.value) || 0)}
              placeholder="Priority"
              type="number"
              value={priority}
            />
          </div>

          {availableProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No local repositories in your workspace yet — add projects first.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {availableProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <Checkbox
                    checked={selectedProjectIds.includes(project.id)}
                    onCheckedChange={() => toggleProject(project.id)}
                  />
                  {project.name}
                </label>
              ))}
            </div>
          )}

          <Button
            disabled={
              selectedProjectIds.length === 0 ||
              (matchType !== "project_default" && !matchValue.trim()) ||
              saveMapping.isPending
            }
            onClick={handleSave}
            size="sm"
          >
            {saveMapping.isPending ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
