import { useLocation } from "wouter";
import { navigateInApp } from "@/lib/app-navigation";
import { getDesktopApi } from "@/lib/desktop";
import { queryClient } from "@/lib/queryClient";
import { clearWorkspaceHandle } from "@/lib/workspace-handle";
import {
  clearWorkspaceSelection,
  removeManagedProject,
  setWorkspaceSelection,
} from "@/lib/workspace-selection";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import { useCodingTool } from "@/hooks/use-coding-tool";
import type { CodingToolId } from "@/lib/coding-tool";

export function useProjectActions() {
  const [, setLocation] = useLocation();
  const workspaceSelection = useWorkspaceSelection();
  const desktopApi = getDesktopApi();
  const codingTool = useCodingTool();

  const copyPath = async (projectPath: string) => {
    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(projectPath);
      return;
    }

    await navigator.clipboard.writeText(projectPath);
  };

  const openInCode = async (projectPath: string, explicitTool?: CodingToolId) => {
    await codingTool.openPreferredTool(projectPath, explicitTool);
  };

  const revealInFinder = async (projectPath: string) => {
    await desktopApi?.showItemInFinder?.(projectPath);
  };

  const removeProject = async (projectId: string) => {
    const nextSelection = removeManagedProject(workspaceSelection, projectId);
    if (!nextSelection) {
      clearWorkspaceSelection();
      await clearWorkspaceHandle();
      void queryClient.removeQueries({ queryKey: ["workspace", "snapshot"] });
      navigateInApp("/onboarding", setLocation);
      return;
    }

    setWorkspaceSelection(nextSelection);
    void queryClient.invalidateQueries({ queryKey: ["workspace", "snapshot"] });
    const currentSearch =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (window.location.pathname === "/" && currentSearch?.get("project") === projectId) {
      navigateInApp("/", setLocation);
    }
  };

  return {
    codingTool,
    copyPath,
    openInCode,
    removeProject,
    revealInFinder,
  };
}
