import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDesktopApi } from "@/lib/desktop";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import type {
  AgentHarnessDiscoveryRequest,
  AgentHarnessDiscoveryResult,
} from "@shared/agents";

export function useAgentHarness() {
  const desktopApi = getDesktopApi();
  const workspaceSelection = useWorkspaceSelection();
  const { data: snapshot } = useWorkspaceSnapshot();

  const request = useMemo<AgentHarnessDiscoveryRequest>(() => {
    const snapshotProjects =
      snapshot?.projects.map((project) => ({
        id: project.id,
        localPath: project.localPath,
        name: project.name,
      })) ?? [];
    const selectionProjects =
      workspaceSelection?.projects.map((project) => ({
        id: project.id,
        localPath: project.localPath ?? null,
        name: project.name,
      })) ?? [];
    const projects = snapshotProjects.length > 0 ? snapshotProjects : selectionProjects;

    return {
      projects,
      selectionRootPath: workspaceSelection?.rootPath ?? null,
    };
  }, [snapshot?.projects, workspaceSelection]);

  const requestKey = useMemo(
    () =>
      request.projects
        .map((project) => `${project.id}:${project.localPath ?? ""}`)
        .concat(request.selectionRootPath ?? "")
        .join("|"),
    [request],
  );

  return useQuery<AgentHarnessDiscoveryResult>({
    enabled:
      Boolean(desktopApi?.discoverAgentHarness) &&
      (request.projects.length > 0 || Boolean(request.selectionRootPath)),
    queryFn: async () => {
      if (!desktopApi?.discoverAgentHarness) {
        throw new Error("Agent harness discovery requires the DevDeck desktop app.");
      }
      return desktopApi.discoverAgentHarness(request);
    },
    queryKey: ["agent-harness", requestKey],
  });
}
