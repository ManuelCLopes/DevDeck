export interface MonitoredProject {
  id: string;
  isRoot?: boolean;
  name: string;
  relativePath?: string;
  repositoryCount: number | null;
}

export interface WorkspaceSelection {
  projects: MonitoredProject[];
  rootName: string;
}

const WORKSPACE_SELECTION_KEY = "devdeck_workspace_selection";

export const DEFAULT_MONITORED_DIRECTORIES = [
  "~/Developer/frontend",
  "~/Developer/backend",
  "~/Developer/mobile",
  "~/Developer/data",
];

export function getWorkspaceSelection(): WorkspaceSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSelection = localStorage.getItem(WORKSPACE_SELECTION_KEY);
  if (!rawSelection) {
    return null;
  }

  try {
    const parsedSelection = JSON.parse(rawSelection) as WorkspaceSelection;
    if (
      typeof parsedSelection.rootName !== "string" ||
      !Array.isArray(parsedSelection.projects)
    ) {
      return null;
    }

    return parsedSelection;
  } catch {
    return null;
  }
}

export function setWorkspaceSelection(selection: WorkspaceSelection) {
  localStorage.setItem(WORKSPACE_SELECTION_KEY, JSON.stringify(selection));
}

export function clearWorkspaceSelection() {
  localStorage.removeItem(WORKSPACE_SELECTION_KEY);
}

export function getMonitoredDirectoryLabels(selection: WorkspaceSelection | null) {
  if (!selection || selection.projects.length === 0) {
    return DEFAULT_MONITORED_DIRECTORIES;
  }

  return selection.projects.map((project) =>
    project.isRoot
      ? selection.rootName
      : `${selection.rootName}/${project.relativePath ?? project.name}`,
  );
}
