import type { MonitoredProject, WorkspaceSelection } from "@shared/workspace";

export type { MonitoredProject, WorkspaceSelection };

export interface ManagedProjectCollection {
  id: string;
  name: string;
  projects: MonitoredProject[];
  workspaceName: string;
  workspacePath?: string;
}

const WORKSPACE_SELECTION_KEY = "devdeck_workspace_selection";
const WORKSPACE_SELECTION_EVENT = "devdeck:workspace-selection-updated";
let cachedWorkspaceSelectionRaw: string | null = null;
let cachedWorkspaceSelection: WorkspaceSelection | null = null;

export const DEFAULT_MONITORED_DIRECTORIES = [
  "~/Developer/frontend",
  "~/Developer/backend",
  "~/Developer/mobile",
  "~/Developer/data",
];

function isAbsolutePath(pathValue: string) {
  return pathValue.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathValue);
}

function compareProjects(left: MonitoredProject, right: MonitoredProject) {
  const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.name.localeCompare(right.name);
}

function getProjectMergeKey(project: MonitoredProject) {
  return project.githubRepositorySlug ?? project.localPath ?? project.id;
}

function getWorkspaceName(project: MonitoredProject, rootName: string) {
  return project.workspaceName ?? rootName;
}

function getWorkspacePath(project: MonitoredProject, rootPath?: string) {
  if (typeof project.workspacePath === "string") {
    return project.workspacePath;
  }

  if (typeof project.localPath === "string" && project.isRoot) {
    return project.localPath;
  }

  return rootPath;
}

function getCollectionName(project: MonitoredProject, workspaceName: string) {
  const candidate = project.collectionName?.trim();
  return candidate && candidate.length > 0 ? candidate : workspaceName;
}

function createCollectionId(seedName: string, seedPath?: string) {
  return `collection:${seedPath ?? seedName}`;
}

function getCollectionId(
  project: MonitoredProject,
  workspaceName: string,
  workspacePath: string | undefined,
  fallbackSeed: string,
) {
  return project.collectionId ?? createCollectionId(workspaceName, workspacePath ?? fallbackSeed);
}

function normalizeProject(
  project: MonitoredProject,
  index: number,
  selection: Pick<WorkspaceSelection, "rootName" | "rootPath">,
): MonitoredProject {
  const workspaceName = getWorkspaceName(project, selection.rootName);
  const workspacePath = getWorkspacePath(project, selection.rootPath);
  const relativePath =
    typeof project.relativePath === "string" && project.relativePath.length > 0
      ? project.relativePath
      : undefined;
  const localPath =
    typeof project.localPath === "string"
      ? project.localPath
      : workspacePath
        ? project.isRoot
          ? workspacePath
          : relativePath
            ? `${workspacePath}/${relativePath}`
            : undefined
        : undefined;

  return {
    ...project,
    collectionId: getCollectionId(project, workspaceName, workspacePath, localPath ?? project.id),
    collectionName: getCollectionName(project, workspaceName),
    hidden: project.hidden === true,
    localPath,
    order: typeof project.order === "number" ? project.order : index,
    relativePath,
    workspaceName,
    workspacePath,
  };
}

function deriveSelectionMetadata(
  projects: MonitoredProject[],
  fallbackRootName: string,
  fallbackRootPath?: string,
) {
  const workspaces = new Map<string, { name: string; path?: string }>();

  for (const project of projects) {
    const workspaceName = project.workspaceName ?? fallbackRootName;
    const workspacePath = project.workspacePath;
    const key = workspacePath ?? workspaceName;

    if (!workspaces.has(key)) {
      workspaces.set(key, {
        name: workspaceName,
        path: workspacePath,
      });
    }
  }

  if (workspaces.size === 1) {
    const workspace = Array.from(workspaces.values())[0];
    return {
      rootName: workspace.name,
      rootPath: workspace.path ?? fallbackRootPath,
    };
  }

  return {
    rootName: "Multiple Workspaces",
    rootPath: undefined,
  };
}

function normalizeWorkspaceSelection(selection: WorkspaceSelection | null) {
  if (!selection || !Array.isArray(selection.projects) || selection.projects.length === 0) {
    return null;
  }

  const fallbackRootName =
    typeof selection.rootName === "string" && selection.rootName.length > 0
      ? selection.rootName
      : "Workspace";
  const fallbackRootPath =
    typeof selection.rootPath === "string" ? selection.rootPath : undefined;
  const projects = selection.projects
    .map((project, index) =>
      normalizeProject(project, index, {
        rootName: fallbackRootName,
        rootPath: fallbackRootPath,
      }),
    )
    .sort(compareProjects)
    .map((project, index) => ({
      ...project,
      order: index,
    }));
  const metadata = deriveSelectionMetadata(projects, fallbackRootName, fallbackRootPath);

  return {
    projects,
    rootName: metadata.rootName,
    rootPath: metadata.rootPath,
  } satisfies WorkspaceSelection;
}

function dispatchWorkspaceSelectionChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(WORKSPACE_SELECTION_EVENT));
}

function buildSelectionFromOrderedProjects(
  currentSelection: WorkspaceSelection,
  orderedProjects: MonitoredProject[],
) {
  const normalizedProjects = orderedProjects.map((project, index) => ({
    ...project,
    order: index,
  }));
  const metadata = deriveSelectionMetadata(
    normalizedProjects,
    currentSelection.rootName,
    currentSelection.rootPath,
  );

  return {
    projects: normalizedProjects,
    rootName: metadata.rootName,
    rootPath: metadata.rootPath,
  } satisfies WorkspaceSelection;
}

function mergeVisibleAndHiddenProjects(
  selection: WorkspaceSelection,
  orderedVisibleProjects: MonitoredProject[],
) {
  const hiddenProjects = selection.projects
    .filter((project) => project.hidden)
    .sort(compareProjects);

  return buildSelectionFromOrderedProjects(selection, [
    ...orderedVisibleProjects,
    ...hiddenProjects,
  ]);
}

function reorderListByIds<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);

  if (
    sourceIndex === -1 ||
    targetIndex === -1 ||
    sourceIndex === targetIndex
  ) {
    return items;
  }

  const nextItems = items.slice();
  const [sourceItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, sourceItem);
  return nextItems;
}

export function subscribeWorkspaceSelection(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => listener();
  window.addEventListener(WORKSPACE_SELECTION_EVENT, handleChange);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(WORKSPACE_SELECTION_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function getWorkspaceSelection(): WorkspaceSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSelection = localStorage.getItem(WORKSPACE_SELECTION_KEY);
  if (!rawSelection) {
    cachedWorkspaceSelectionRaw = null;
    cachedWorkspaceSelection = null;
    return null;
  }

  if (rawSelection === cachedWorkspaceSelectionRaw) {
    return cachedWorkspaceSelection;
  }

  try {
    cachedWorkspaceSelectionRaw = rawSelection;
    cachedWorkspaceSelection = normalizeWorkspaceSelection(
      JSON.parse(rawSelection) as WorkspaceSelection,
    );
    return cachedWorkspaceSelection;
  } catch {
    cachedWorkspaceSelectionRaw = null;
    cachedWorkspaceSelection = null;
    return null;
  }
}

export function setWorkspaceSelection(selection: WorkspaceSelection) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    clearWorkspaceSelection();
    return;
  }

  const rawSelection = JSON.stringify(normalizedSelection);
  cachedWorkspaceSelectionRaw = rawSelection;
  cachedWorkspaceSelection = normalizedSelection;
  localStorage.setItem(WORKSPACE_SELECTION_KEY, rawSelection);
  dispatchWorkspaceSelectionChanged();
}

export function mergeWorkspaceSelection(
  currentSelection: WorkspaceSelection | null,
  nextSelection: WorkspaceSelection,
) {
  const normalizedCurrent = normalizeWorkspaceSelection(currentSelection);
  const normalizedNext = normalizeWorkspaceSelection(nextSelection);

  if (!normalizedNext) {
    return normalizedCurrent ?? nextSelection;
  }

  if (!normalizedCurrent) {
    return normalizedNext;
  }

  const mergedProjects = new Map<string, MonitoredProject>();
  let nextOrder = normalizedCurrent.projects.length;

  for (const project of normalizedCurrent.projects) {
    mergedProjects.set(getProjectMergeKey(project), project);
  }

  for (const project of normalizedNext.projects) {
    const mergeKey = getProjectMergeKey(project);
    const existingProject = mergedProjects.get(mergeKey);

    if (existingProject) {
      mergedProjects.set(mergeKey, {
        ...project,
        collectionId: existingProject.collectionId ?? project.collectionId,
        collectionName: existingProject.collectionName ?? project.collectionName,
        githubRepositorySlug:
          project.githubRepositorySlug ?? existingProject.githubRepositorySlug,
        hidden: existingProject.hidden ?? project.hidden,
        localPath: project.localPath ?? existingProject.localPath,
        order: existingProject.order ?? project.order,
        workspaceName: project.workspaceName ?? existingProject.workspaceName,
        workspacePath: project.workspacePath ?? existingProject.workspacePath,
      });
      continue;
    }

    mergedProjects.set(mergeKey, {
      ...project,
      order: nextOrder,
    });
    nextOrder += 1;
  }

  return normalizeWorkspaceSelection({
    projects: Array.from(mergedProjects.values()),
    rootName: normalizedCurrent.rootName,
    rootPath: normalizedCurrent.rootPath,
  }) as WorkspaceSelection;
}

export function clearWorkspaceSelection() {
  cachedWorkspaceSelectionRaw = null;
  cachedWorkspaceSelection = null;
  localStorage.removeItem(WORKSPACE_SELECTION_KEY);
  dispatchWorkspaceSelectionChanged();
}

export function getMonitoredDirectoryLabels(selection: WorkspaceSelection | null) {
  if (!selection || selection.projects.length === 0) {
    return DEFAULT_MONITORED_DIRECTORIES;
  }

  return selection.projects.map((project) => project.name);
}

export function getMonitoredProjects(selection: WorkspaceSelection | null) {
  return selection?.projects.slice().sort(compareProjects) ?? [];
}

export function getManagedProjectCollections(
  selection: WorkspaceSelection | null,
  options?: { includeHidden?: boolean },
) {
  if (!selection) {
    return [] as ManagedProjectCollection[];
  }

  const includeHidden = options?.includeHidden === true;
  const collections = new Map<string, ManagedProjectCollection>();
  for (const project of getMonitoredProjects(selection)) {
    if (!includeHidden && project.hidden) {
      continue;
    }

    const collectionId = project.collectionId ?? createCollectionId(project.name, project.localPath);
    const existingCollection = collections.get(collectionId);

    if (existingCollection) {
      existingCollection.projects.push(project);
      continue;
    }

    collections.set(collectionId, {
      id: collectionId,
      name: project.collectionName ?? project.workspaceName ?? project.name,
      projects: [project],
      workspaceName: project.workspaceName ?? project.name,
      workspacePath: project.workspacePath,
    });
  }

  return Array.from(collections.values()).sort((left, right) => {
    const leftOrder = left.projects[0]?.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.projects[0]?.order ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

export function getHiddenManagedProjects(selection: WorkspaceSelection | null) {
  return getMonitoredProjects(selection).filter((project) => project.hidden);
}

export function hasValidWorkspaceSelection(selection: WorkspaceSelection | null) {
  if (!selection || selection.projects.length === 0) {
    return false;
  }

  return (
    selection.projects.some((project) =>
      typeof project.localPath === "string" ? isAbsolutePath(project.localPath) : false,
    ) ||
    (typeof selection.rootPath === "string" && isAbsolutePath(selection.rootPath))
  );
}

export function buildWorkspaceSelectionFromImport({
  candidates,
  collectionName,
  rootName,
  rootPath,
  selectedProjectIds,
}: {
  candidates: MonitoredProject[];
  collectionName?: string | null;
  rootName: string;
  rootPath?: string;
  selectedProjectIds: string[];
}) {
  const selectedProjects = candidates.filter((candidate) =>
    selectedProjectIds.includes(candidate.id),
  );
  const effectiveRootPath = rootPath ?? rootName;
  const effectiveCollectionName =
    collectionName?.trim().length ? collectionName.trim() : rootName;
  const collectionId = createCollectionId(rootName, effectiveRootPath);
  const projects =
    selectedProjects.length > 0
      ? selectedProjects
      : [
          {
            id: `${rootName}/.`,
            isRoot: true,
            localPath: effectiveRootPath,
            name: rootName,
            repositoryCount: null,
          } satisfies MonitoredProject,
        ];

  return normalizeWorkspaceSelection({
    projects: projects.map((project) => ({
      ...project,
      collectionId,
      collectionName: effectiveCollectionName,
      workspaceName: rootName,
      workspacePath: effectiveRootPath,
    })),
    rootName,
    rootPath: effectiveRootPath,
  }) as WorkspaceSelection;
}

export function renameManagedProjectCollection(
  selection: WorkspaceSelection | null,
  collectionId: string,
  nextName: string,
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const trimmedName = nextName.trim();
  if (!trimmedName) {
    return normalizedSelection;
  }

  return normalizeWorkspaceSelection({
    ...normalizedSelection,
    projects: normalizedSelection.projects.map((project) =>
      project.collectionId === collectionId
        ? {
            ...project,
            collectionName: trimmedName,
          }
        : project,
    ),
  });
}

export function setManagedProjectsHidden(
  selection: WorkspaceSelection | null,
  projectIds: Iterable<string>,
  hidden: boolean,
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const projectIdSet = projectIds instanceof Set ? projectIds : new Set(projectIds);
  if (projectIdSet.size === 0) {
    return normalizedSelection;
  }

  return normalizeWorkspaceSelection({
    ...normalizedSelection,
    projects: normalizedSelection.projects.map((project) =>
      projectIdSet.has(project.id)
        ? {
            ...project,
            hidden,
          }
        : project,
    ),
  });
}

export function setManagedProjectCollectionHidden(
  selection: WorkspaceSelection | null,
  collectionId: string,
  hidden: boolean,
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const collectionProjectIds = normalizedSelection.projects
    .filter((project) => project.collectionId === collectionId)
    .map((project) => project.id);

  return setManagedProjectsHidden(normalizedSelection, collectionProjectIds, hidden);
}

export function moveManagedProjectCollection(
  selection: WorkspaceSelection | null,
  collectionId: string,
  direction: "up" | "down",
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const collections = getManagedProjectCollections(normalizedSelection);
  const currentIndex = collections.findIndex((collection) => collection.id === collectionId);
  if (currentIndex === -1) {
    return normalizedSelection;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= collections.length) {
    return normalizedSelection;
  }

  const reorderedCollections = collections.slice();
  const [collection] = reorderedCollections.splice(currentIndex, 1);
  reorderedCollections.splice(targetIndex, 0, collection);

  return mergeVisibleAndHiddenProjects(
    normalizedSelection,
    reorderedCollections.flatMap((managedCollection) => managedCollection.projects),
  );
}

export function reorderManagedProjectCollections(
  selection: WorkspaceSelection | null,
  sourceCollectionId: string,
  targetCollectionId: string,
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection || sourceCollectionId === targetCollectionId) {
    return normalizedSelection;
  }

  const collections = getManagedProjectCollections(normalizedSelection);
  const reorderedCollections = reorderListByIds(
    collections,
    sourceCollectionId,
    targetCollectionId,
  );

  return mergeVisibleAndHiddenProjects(
    normalizedSelection,
    reorderedCollections.flatMap((managedCollection) => managedCollection.projects),
  );
}

export function moveManagedProject(
  selection: WorkspaceSelection | null,
  projectId: string,
  direction: "up" | "down",
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const collections = getManagedProjectCollections(normalizedSelection);
  const collectionIndex = collections.findIndex((collection) =>
    collection.projects.some((project) => project.id === projectId),
  );
  if (collectionIndex === -1) {
    return normalizedSelection;
  }

  const collection = collections[collectionIndex];
  const projectIndex = collection.projects.findIndex((project) => project.id === projectId);
  if (projectIndex === -1) {
    return normalizedSelection;
  }

  const targetIndex = direction === "up" ? projectIndex - 1 : projectIndex + 1;
  if (targetIndex < 0 || targetIndex >= collection.projects.length) {
    return normalizedSelection;
  }

  const reorderedCollections = collections.slice();
  const reorderedProjects = collection.projects.slice();
  const [project] = reorderedProjects.splice(projectIndex, 1);
  reorderedProjects.splice(targetIndex, 0, project);
  reorderedCollections[collectionIndex] = {
    ...collection,
    projects: reorderedProjects,
  };

  return mergeVisibleAndHiddenProjects(
    normalizedSelection,
    reorderedCollections.flatMap((managedCollection) => managedCollection.projects),
  );
}

export function reorderManagedProjects(
  selection: WorkspaceSelection | null,
  sourceProjectId: string,
  targetProjectId: string,
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection || sourceProjectId === targetProjectId) {
    return normalizedSelection;
  }

  const collections = getManagedProjectCollections(normalizedSelection);
  const collectionIndex = collections.findIndex((collection) =>
    collection.projects.some(
      (project) => project.id === sourceProjectId || project.id === targetProjectId,
    ),
  );
  if (collectionIndex === -1) {
    return normalizedSelection;
  }

  const collection = collections[collectionIndex];
  if (
    !collection.projects.some((project) => project.id === sourceProjectId) ||
    !collection.projects.some((project) => project.id === targetProjectId)
  ) {
    return normalizedSelection;
  }

  const reorderedCollections = collections.slice();
  reorderedCollections[collectionIndex] = {
    ...collection,
    projects: reorderListByIds(collection.projects, sourceProjectId, targetProjectId),
  };

  return mergeVisibleAndHiddenProjects(
    normalizedSelection,
    reorderedCollections.flatMap((managedCollection) => managedCollection.projects),
  );
}

export function removeManagedProject(
  selection: WorkspaceSelection | null,
  projectId: string,
) {
  return removeManagedProjects(selection, [projectId]);
}

export function removeManagedProjects(
  selection: WorkspaceSelection | null,
  projectIds: string[],
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const projectIdsToRemove = new Set(projectIds);
  if (projectIdsToRemove.size === 0) {
    return normalizedSelection;
  }

  const remainingProjects = normalizedSelection.projects.filter(
    (project) => !projectIdsToRemove.has(project.id),
  );
  if (remainingProjects.length === 0) {
    return null;
  }

  return buildSelectionFromOrderedProjects(normalizedSelection, remainingProjects);
}

export function removeManagedProjectCollection(
  selection: WorkspaceSelection | null,
  collectionId: string,
) {
  const normalizedSelection = normalizeWorkspaceSelection(selection);
  if (!normalizedSelection) {
    return null;
  }

  const projectIds = normalizedSelection.projects
    .filter((project) => project.collectionId === collectionId)
    .map((project) => project.id);

  return removeManagedProjects(normalizedSelection, projectIds);
}
