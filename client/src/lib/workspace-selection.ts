import type { MonitoredProject, WorkspaceSelection } from "@shared/workspace";

export type { MonitoredProject, WorkspaceSelection };

const WORKSPACE_SELECTION_KEY = "devdeck_workspace_selection";

export const DEFAULT_MONITORED_DIRECTORIES = [
  "~/Developer/frontend",
  "~/Developer/backend",
  "~/Developer/mobile",
  "~/Developer/data",
];

function isAbsolutePath(pathValue: string) {
  return pathValue.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathValue);
}

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
    if (typeof parsedSelection.rootName !== "string" || !Array.isArray(parsedSelection.projects)) {
      return null;
    }

    return {
      ...parsedSelection,
      projects: parsedSelection.projects.map((project) => ({
        ...project,
        localPath:
          typeof project.localPath === "string"
            ? project.localPath
            : typeof parsedSelection.rootPath === "string" && isAbsolutePath(parsedSelection.rootPath)
              ? project.isRoot
                ? parsedSelection.rootPath
                : `${parsedSelection.rootPath}/${project.relativePath ?? project.name}`
              : undefined,
      })),
      rootPath:
        typeof parsedSelection.rootPath === "string"
          ? parsedSelection.rootPath
          : undefined,
    };
  } catch {
    return null;
  }
}

export function setWorkspaceSelection(selection: WorkspaceSelection) {
  localStorage.setItem(WORKSPACE_SELECTION_KEY, JSON.stringify(selection));
}

function getProjectMergeKey(project: MonitoredProject) {
  return project.localPath ?? project.id;
}

export function mergeWorkspaceSelection(
  currentSelection: WorkspaceSelection | null,
  nextSelection: WorkspaceSelection,
) {
  if (!currentSelection) {
    return nextSelection;
  }

  const mergedProjects = new Map<string, MonitoredProject>();
  for (const project of currentSelection.projects) {
    mergedProjects.set(getProjectMergeKey(project), project);
  }

  for (const project of nextSelection.projects) {
    mergedProjects.set(getProjectMergeKey(project), project);
  }

  const mergedRootPath =
    currentSelection.rootPath && nextSelection.rootPath && currentSelection.rootPath !== nextSelection.rootPath
      ? undefined
      : nextSelection.rootPath ?? currentSelection.rootPath;

  const mergedRootName =
    currentSelection.rootName !== nextSelection.rootName
      ? "Multiple Workspaces"
      : nextSelection.rootName;

  return {
    projects: Array.from(mergedProjects.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    rootName: mergedRootName,
    rootPath: mergedRootPath,
  } satisfies WorkspaceSelection;
}

export function clearWorkspaceSelection() {
  localStorage.removeItem(WORKSPACE_SELECTION_KEY);
}

export function getMonitoredDirectoryLabels(selection: WorkspaceSelection | null) {
  if (!selection || selection.projects.length === 0) {
    return DEFAULT_MONITORED_DIRECTORIES;
  }

  return selection.projects.map((project) => project.name);
}

export function getMonitoredProjects(selection: WorkspaceSelection | null) {
  return selection?.projects ?? [];
}

export function hasValidWorkspaceSelection(selection: WorkspaceSelection | null) {
  if (!selection || selection.projects.length === 0) {
    return false;
  }

  return selection.projects.some((project) =>
    typeof project.localPath === "string" ? isAbsolutePath(project.localPath) : false,
  ) || (typeof selection.rootPath === "string" && isAbsolutePath(selection.rootPath));
}
