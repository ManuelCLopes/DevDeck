import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import GitHubConnectDialog from "@/components/settings/GitHubConnectDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import { navigateInApp } from "@/lib/app-navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type AppPreferences, useAppPreferences } from "@/lib/app-preferences";
import { getDesktopApi } from "@/lib/desktop";
import { getGitHubStatusMeta } from "@/lib/github-status";
import { formatDistanceToNow } from "date-fns";
import {
  Eye,
  EyeOff,
  Github,
  GripVertical,
  HardDrive,
  Layers3,
  RotateCcw,
  Shield,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCodingTool } from "@/hooks/use-coding-tool";
import {
  getCodingToolInstallHint,
  getCodingToolLabel,
  type CodingToolId,
} from "@/lib/coding-tool";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { useLocation } from "wouter";
import { clearCompletedOnboarding } from "@/lib/onboarding-state";
import { openAddProjectsDialog } from "@/lib/project-import-events";
import { queryClient } from "@/lib/queryClient";
import { clearWorkspaceHandle } from "@/lib/workspace-handle";
import {
  clearWorkspaceSelection,
  getManagedProjectCollections,
  getHiddenManagedProjects,
  removeManagedProject,
  removeManagedProjectCollection,
  removeManagedProjects,
  reorderManagedProjectCollections,
  reorderManagedProjects,
  renameManagedProjectCollection,
  setManagedProjectCollectionHidden,
  setManagedProjectsHidden,
  setWorkspaceSelection,
} from "@/lib/workspace-selection";
import type { WorkspaceSelection } from "@shared/workspace";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { data: snapshot, refetch } = useWorkspaceSnapshot();
  const { preferences, setPreference } = useAppPreferences();
  const [isGitHubConnectOpen, setIsGitHubConnectOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const workspaceSelection = useWorkspaceSelection();
  const managedCollections = getManagedProjectCollections(workspaceSelection);
  const hiddenProjects = getHiddenManagedProjects(workspaceSelection);
  const hiddenProjectCount = hiddenProjects.length;
  const visibleProjectCount =
    workspaceSelection?.projects.filter((project) => !project.hidden).length ?? 0;
  const hiddenCollections = getManagedProjectCollections(workspaceSelection, {
    includeHidden: true,
  })
    .map((collection) => ({
      ...collection,
      projects: collection.projects.filter((project) => project.hidden),
    }))
    .filter((collection) => collection.projects.length > 0);
  const githubStatus = snapshot?.githubStatus;
  const connected = githubStatus?.authenticated ?? false;
  const githubStatusMeta = getGitHubStatusMeta(githubStatus);
  const githubState = githubStatus?.state ?? "unsupported";
  const desktopApi = getDesktopApi();
  const { availability, preferredTool } = useCodingTool();

  const persistWorkspaceSelection = async (
    nextSelection: WorkspaceSelection | null,
  ) => {
    if (!nextSelection) {
      clearWorkspaceSelection();
      await clearWorkspaceHandle();
      void queryClient.removeQueries({ queryKey: ["workspace", "snapshot"] });
      navigateInApp("/onboarding", setLocation);
      return;
    }

    setWorkspaceSelection(nextSelection);
    void queryClient.invalidateQueries({ queryKey: ["workspace", "snapshot"] });
  };

  useEffect(() => {
    setSelectedProjectIds((currentSelection) =>
      currentSelection.filter((projectId) =>
        workspaceSelection?.projects.some((project) => project.id === projectId),
      ),
    );
  }, [workspaceSelection]);

  const handleResetOnboarding = () => {
    clearCompletedOnboarding();
    clearWorkspaceSelection();
    void clearWorkspaceHandle();
    void queryClient.removeQueries({ queryKey: ["workspace", "snapshot"] });
    navigateInApp("/onboarding", setLocation);
  };

  const handleToggleLaunchAtLogin = async (checked: boolean) => {
    setPreference("launchAtLogin", checked);
    await desktopApi?.setLaunchAtLogin?.(checked);
  };

  const handleDisconnectGitHub = async () => {
    await desktopApi?.clearGitHubToken?.();
    await refetch();
  };

  const handleRenameCollection = async (collectionId: string, nextName: string) => {
    await persistWorkspaceSelection(
      renameManagedProjectCollection(workspaceSelection, collectionId, nextName),
    );
  };

  const handleReorderCollection = async (
    sourceCollectionId: string,
    targetCollectionId: string,
  ) => {
    await persistWorkspaceSelection(
      reorderManagedProjectCollections(
        workspaceSelection,
        sourceCollectionId,
        targetCollectionId,
      ),
    );
  };

  const handleReorderProject = async (
    sourceProjectId: string,
    targetProjectId: string,
  ) => {
    await persistWorkspaceSelection(
      reorderManagedProjects(workspaceSelection, sourceProjectId, targetProjectId),
    );
  };

  const handleRemoveProject = async (projectId: string) => {
    setSelectedProjectIds((currentSelection) =>
      currentSelection.filter((selectedProjectId) => selectedProjectId !== projectId),
    );
    await persistWorkspaceSelection(removeManagedProject(workspaceSelection, projectId));
  };

  const handleToggleProjectSelection = (projectId: string, checked: boolean) => {
    setSelectedProjectIds((currentSelection) => {
      if (checked) {
        return currentSelection.includes(projectId)
          ? currentSelection
          : [...currentSelection, projectId];
      }

      return currentSelection.filter((selectedProjectId) => selectedProjectId !== projectId);
    });
  };

  const handleToggleCollectionSelection = (
    collectionId: string,
    checked: boolean,
  ) => {
    const collection = managedCollections.find(
      (managedCollection) => managedCollection.id === collectionId,
    );
    if (!collection) {
      return;
    }

    const collectionProjectIds = collection.projects.map((project) => project.id);
    setSelectedProjectIds((currentSelection) => {
      if (checked) {
        return Array.from(new Set([...currentSelection, ...collectionProjectIds]));
      }

      return currentSelection.filter(
        (selectedProjectId) => !collectionProjectIds.includes(selectedProjectId),
      );
    });
  };

  const handleRemoveSelectedProjects = async () => {
    if (selectedProjectIds.length === 0) {
      return;
    }

    await persistWorkspaceSelection(
      removeManagedProjects(workspaceSelection, selectedProjectIds),
    );
    setSelectedProjectIds([]);
  };

  const handleHideSelectedProjects = async () => {
    if (selectedProjectIds.length === 0) {
      return;
    }

    await persistWorkspaceSelection(
      setManagedProjectsHidden(workspaceSelection, selectedProjectIds, true),
    );
    setSelectedProjectIds([]);
  };

  const handleSetProjectHidden = async (projectId: string, hidden: boolean) => {
    if (hidden) {
      setSelectedProjectIds((currentSelection) =>
        currentSelection.filter((selectedProjectId) => selectedProjectId !== projectId),
      );
    }

    await persistWorkspaceSelection(
      setManagedProjectsHidden(workspaceSelection, [projectId], hidden),
    );
  };

  const handleSetCollectionHidden = async (
    collectionId: string,
    hidden: boolean,
  ) => {
    if (hidden) {
      const collection = managedCollections.find(
        (managedCollection) => managedCollection.id === collectionId,
      );
      if (collection) {
        const collectionProjectIds = new Set(collection.projects.map((project) => project.id));
        setSelectedProjectIds((currentSelection) =>
          currentSelection.filter((projectId) => !collectionProjectIds.has(projectId)),
        );
      }
    }

    await persistWorkspaceSelection(
      setManagedProjectCollectionHidden(workspaceSelection, collectionId, hidden),
    );
  };

  const handleRestoreAllHiddenProjects = async () => {
    if (hiddenProjectCount === 0) {
      return;
    }

    await persistWorkspaceSelection(
      setManagedProjectsHidden(
        workspaceSelection,
        hiddenProjects.map((project) => project.id),
        false,
      ),
    );
  };

  const handleRemoveCollection = async (collectionId: string) => {
    const collection = managedCollections.find(
      (managedCollection) => managedCollection.id === collectionId,
    );
    if (!collection) {
      return;
    }

    await persistWorkspaceSelection(
      removeManagedProjectCollection(workspaceSelection, collectionId),
    );
    const collectionProjectIds = new Set(collection.projects.map((project) => project.id));
    setSelectedProjectIds((currentSelection) =>
      currentSelection.filter((projectId) => !collectionProjectIds.has(projectId)),
    );
  };

  const lastWorkspaceSyncLabel = snapshot
    ? formatDistanceToNow(new Date(snapshot.generatedAt), { addSuffix: true })
    : "No workspace snapshot yet";
  const toggleGroups: Array<{
    items: Array<{
      desc: string;
      id: Exclude<
        keyof AppPreferences,
        | "autoRefreshEnabled"
        | "autoRefreshIntervalSeconds"
        | "preferredCodingTool"
        | "terminal"
      >;
      label: string;
    }>;
    title: string;
  }> = [
    {
      title: "Refresh & Visibility",
      items: [
        {
          desc: "Check for updates whenever the DevDeck window becomes active again.",
          id: "refreshOnWindowFocus",
          label: "Refresh on Focus",
        },
        {
          desc: "Keep stale local review branches visually flagged across the app.",
          id: "highlightStalePrs",
          label: "Highlight Stale PRs",
        },
      ],
    },
    {
      title: "Notifications",
      items: [
        {
          desc: "Show native notifications when a PR is waiting for its first review.",
          id: "notifyReviewRequired",
          label: "Notify on Review Required",
        },
        {
          desc: "Alert when a pull request receives changes requested.",
          id: "notifyChangesRequested",
          label: "Notify on Changes Requested",
        },
        {
          desc: "Alert when a pull request gets approved.",
          id: "notifyApproved",
          label: "Notify on Approval",
        },
        {
          desc: "Show native desktop notifications for default branch failures.",
          id: "alertFailingBuilds",
          label: "Alert on Failing Builds",
        },
      ],
    },
    {
      title: "Desktop Behavior",
      items: [
        {
          desc: "Hide the window instead of quitting so background refresh and alerts can keep running.",
          id: "keepRunningInBackground",
          label: "Keep Running in Background",
        },
        {
          desc: "Show a menu bar item with quick-open actions and pending review counts.",
          id: "showMenuBarIcon",
          label: "Show Menu Bar Icon",
        },
        {
          desc: "Start DevDeck automatically when you sign in to macOS.",
          id: "launchAtLogin",
          label: "Launch at Login",
        },
      ],
    },
  ];

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Preferences</h1>
          <p className="text-muted-foreground text-sm">Configure DevDeck's local directories and remote connections.</p>
        </div>

        <div className="bg-white border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border/40 bg-secondary/20 flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Local-First Trust Model</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                DevDeck runs directly on your machine. It analyzes your Git repositories locally and does not upload source code to external servers, which keeps the workflow compliance-friendly.
              </p>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Local Directory */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Repositories</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border/60 bg-white shadow-sm hover:border-black/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary/50 p-2 rounded-md border border-border">
                    <HardDrive className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Managed Repositories</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {workspaceSelection
                        ? `${visibleProjectCount} visible ${visibleProjectCount === 1 ? "repository" : "repositories"} across ${managedCollections.length} ${managedCollections.length === 1 ? "collection" : "collections"}${hiddenProjectCount > 0 ? ` · ${hiddenProjectCount} hidden` : ""}.`
                        : "Link the local clone folders where your repositories live."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hidden repositories stay monitored but disappear from the sidebar until restored.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openAddProjectsDialog}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground border border-border hover:bg-black/5 whitespace-nowrap shadow-sm transition-colors"
                >
                  Add Repositories...
                </button>
              </div>

              {workspaceSelection ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {selectedProjectIds.length > 0
                          ? `${selectedProjectIds.length} selected`
                          : "Bulk curation"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Select visible repositories across collections to hide or remove them in one step.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleHideSelectedProjects()}
                        disabled={selectedProjectIds.length === 0}
                        className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hide Selected
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveSelectedProjects()}
                        disabled={selectedProjectIds.length === 0}
                        className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove Selected
                      </button>
                    </div>
                  </div>
                  {managedCollections.map((collection) => (
                    <div
                      key={collection.id}
                      onDragOver={(event) => {
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (
                          draggedCollectionId &&
                          draggedCollectionId !== collection.id
                        ) {
                          void handleReorderCollection(
                            draggedCollectionId,
                            collection.id,
                          );
                        }
                        setDraggedCollectionId(null);
                      }}
                      className={`rounded-lg border border-border/60 bg-secondary/15 overflow-hidden ${
                        draggedCollectionId === collection.id
                          ? "ring-1 ring-primary/20"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col gap-4 border-b border-border/40 bg-white/70 px-4 py-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="pt-7">
                            <Checkbox
                              checked={
                                collection.projects.every((project) =>
                                  selectedProjectIds.includes(project.id),
                                )
                                  ? true
                                  : collection.projects.some((project) =>
                                        selectedProjectIds.includes(project.id),
                                      )
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={(checked) =>
                                handleToggleCollectionSelection(
                                  collection.id,
                                  checked === true,
                                )
                              }
                              aria-label={`Select ${collection.name}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`collection-${collection.id}`}
                              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                              Collection Name
                            </label>
                            <input
                              key={`${collection.id}:${collection.name}`}
                              id={`collection-${collection.id}`}
                              defaultValue={collection.name}
                              onBlur={(event) =>
                                void handleRenameCollection(collection.id, event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              className="mt-2 h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <p
                              className="mt-2 truncate text-xs text-muted-foreground"
                              title={collection.workspacePath ?? collection.workspaceName}
                            >
                              Source workspace: {collection.workspacePath ?? collection.workspaceName}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1">
                            <div
                              className="rounded-md border border-border bg-white p-2 text-muted-foreground shadow-sm"
                              aria-label={`Drag ${collection.name}`}
                              draggable
                              onDragEnd={() => setDraggedCollectionId(null)}
                              onDragStart={() => setDraggedCollectionId(collection.id)}
                              title="Drag to reorder collection"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleSetCollectionHidden(collection.id, true)}
                              className="rounded-md border border-border bg-white p-2 text-muted-foreground shadow-sm transition-colors hover:bg-secondary"
                              aria-label={`Hide ${collection.name}`}
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveCollection(collection.id)}
                              className="rounded-md border border-border bg-white p-2 text-muted-foreground shadow-sm transition-colors hover:bg-red-50 hover:text-red-600"
                              aria-label={`Remove ${collection.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Layers3 className="h-3.5 w-3.5" />
                          {collection.projects.length}{" "}
                          {collection.projects.length === 1 ? "repository" : "repositories"}
                        </div>
                      </div>

                      <div className="divide-y divide-border/40">
                        {collection.projects.map((project) => (
                          <div
                            key={project.localPath ?? project.id}
                            onDragOver={(event) => {
                              event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (
                                draggedProjectId &&
                                draggedProjectId !== project.id
                              ) {
                                void handleReorderProject(
                                  draggedProjectId,
                                  project.id,
                                );
                              }
                              setDraggedProjectId(null);
                            }}
                            className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                              draggedProjectId === project.id
                                ? "bg-primary/[0.04]"
                                : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <Checkbox
                                checked={selectedProjectIds.includes(project.id)}
                                onCheckedChange={(checked) =>
                                  handleToggleProjectSelection(project.id, checked === true)
                                }
                                aria-label={`Select ${project.name}`}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {project.name}
                              </p>
                              <p
                                className="truncate font-mono text-[11px] text-muted-foreground"
                                title={project.localPath ?? project.relativePath ?? project.name}
                              >
                                {project.localPath ?? project.relativePath ?? project.name}
                              </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              <div
                                className="rounded-md border border-border bg-white p-2 text-muted-foreground shadow-sm"
                                aria-label={`Drag ${project.name}`}
                                draggable
                                onDragEnd={() => setDraggedProjectId(null)}
                                onDragStart={() => setDraggedProjectId(project.id)}
                                title="Drag to reorder project"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleSetProjectHidden(project.id, true)}
                                className="rounded-md border border-border bg-white p-2 text-muted-foreground shadow-sm transition-colors hover:bg-secondary"
                                aria-label={`Hide ${project.name}`}
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemoveProject(project.id)}
                                className="rounded-md border border-border bg-white p-2 text-muted-foreground shadow-sm transition-colors hover:bg-red-50 hover:text-red-600"
                                aria-label={`Remove ${project.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {hiddenCollections.length > 0 ? (
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">Hidden Repositories</p>
                          <p className="text-xs text-muted-foreground">
                            {hiddenProjectCount} hidden {hiddenProjectCount === 1 ? "repository" : "repositories"} are still monitored but removed from the sidebar.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRestoreAllHiddenProjects()}
                          className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                        >
                          Restore All
                        </button>
                      </div>

                      {hiddenCollections.map((collection) => (
                        <div
                          key={`hidden:${collection.id}`}
                          className="rounded-lg border border-dashed border-border/60 bg-white/80 overflow-hidden"
                        >
                          <div className="flex flex-col gap-3 border-b border-border/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {collection.name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {collection.projects.length} hidden {collection.projects.length === 1 ? "repository" : "repositories"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleSetCollectionHidden(collection.id, false)}
                              className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                            >
                              Restore Collection
                            </button>
                          </div>

                          <div className="divide-y divide-border/40">
                            {collection.projects.map((project) => (
                              <div
                                key={`hidden:${project.localPath ?? project.id}`}
                                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {project.name}
                                  </p>
                                  <p
                                    className="truncate font-mono text-[11px] text-muted-foreground"
                                    title={project.localPath ?? project.relativePath ?? project.name}
                                  >
                                    {project.localPath ?? project.relativePath ?? project.name}
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleSetProjectHidden(project.id, false)}
                                    className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <Eye className="h-3.5 w-3.5" />
                                      Restore
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveProject(project.id)}
                                    className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-red-50 hover:text-red-600"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* GitHub Integration */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Remote Sync (Optional)</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border/60 bg-white shadow-sm hover:border-black/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary/50 p-2 rounded-md border border-border">
                    <Github className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      GitHub Access
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${githubStatusMeta.className}`}>
                        {githubStatusMeta.label}
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      DevDeck stores your GitHub credential locally and uses the
                      GitHub API directly for pull request, reviewer, and commit
                      status data.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {githubStatus?.message ?? "GitHub status will appear after the first workspace scan."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Viewer: {githubStatus?.viewerLogin ?? "Not authenticated"} · Connected repos: {githubStatus?.connectedRepositoryCount ?? 0}
                    </p>
                    {githubState === "unsupported" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Direct GitHub connection is available in the desktop app build.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectGitHub()}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-foreground border border-border hover:bg-secondary/50 whitespace-nowrap shadow-sm transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsGitHubConnectOpen(true)}
                      disabled={githubState === "unsupported"}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground border border-primary hover:bg-primary/90 whitespace-nowrap shadow-sm transition-colors disabled:opacity-50"
                    >
                      {githubState === "unsupported"
                        ? "Desktop Only"
                        : githubState === "error"
                          ? "Reconnect GitHub"
                          : "Connect GitHub"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border/40">
            <h2 className="text-sm font-semibold tracking-tight mb-0.5">Application Preferences</h2>
            <p className="text-xs text-muted-foreground">Customize UI behavior and local notifications.</p>
          </div>
          <div className="p-2">
            <div className="space-y-1">
              <div className="p-3 rounded-md border border-border/50 bg-secondary/20 space-y-4 mb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">Auto Refresh Workspace</p>
                    <p className="text-xs text-muted-foreground">
                      Keep local Git and GitHub metadata fresh without leaving the app open on manual refresh.
                    </p>
                  </div>
                  <Switch
                    id="autoRefreshEnabled"
                    checked={preferences.autoRefreshEnabled}
                    onCheckedChange={(checked) =>
                      setPreference("autoRefreshEnabled", checked)
                    }
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Refresh Cadence
                    </p>
                    <Select
                      value={String(preferences.autoRefreshIntervalSeconds)}
                      onValueChange={(value) =>
                        setPreference("autoRefreshIntervalSeconds", Number(value))
                      }
                      disabled={!preferences.autoRefreshEnabled}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Choose interval" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">Every 30 seconds</SelectItem>
                        <SelectItem value="60">Every minute</SelectItem>
                        <SelectItem value="120">Every 2 minutes</SelectItem>
                        <SelectItem value="300">Every 5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Last Workspace Sync
                    </p>
                    <div className="rounded-md border border-border/60 bg-white px-3 py-2 text-sm text-foreground shadow-sm">
                      {lastWorkspaceSyncLabel}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="px-3 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Coding Tool
                  </p>
                </div>
                <div className="flex flex-col gap-3 p-3 rounded-md transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <label
                      htmlFor="preferredCodingTool"
                      className="flex items-center gap-2 font-medium text-sm text-foreground cursor-pointer"
                    >
                      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                      Preferred Coding Tool
                    </label>
                    <p className="text-xs text-muted-foreground">
                      DevDeck uses this tool for all "Open in…" actions across sessions and repositories.
                    </p>
                    {(["opencode", "vscode"] as CodingToolId[]).map((tool) => {
                      const entry = availability[tool];
                      if (entry?.available) {
                        return null;
                      }

                      return (
                        <p
                          key={`hint:${tool}`}
                          className="mt-1 text-[11px] text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">{getCodingToolLabel(tool)}:</span>{" "}
                          {entry?.reason ?? getCodingToolInstallHint(tool)}
                        </p>
                      );
                    })}
                  </div>
                  <div className="flex min-w-[220px] flex-col items-end gap-1">
                    <Select
                      value={preferences.preferredCodingTool}
                      onValueChange={(value) =>
                        setPreference("preferredCodingTool", value as CodingToolId)
                      }
                    >
                      <SelectTrigger id="preferredCodingTool" className="bg-white">
                        <SelectValue placeholder="Choose tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="vscode"
                          disabled={!availability.vscode?.available}
                        >
                          VS Code
                          {!availability.vscode?.available ? " (not installed)" : ""}
                        </SelectItem>
                        <SelectItem
                          value="opencode"
                          disabled={!availability.opencode?.available}
                        >
                          OpenCode
                          {!availability.opencode?.available ? " (not installed)" : ""}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {preferences.preferredCodingTool !== preferredTool ? (
                      <p className="text-[10px] text-muted-foreground">
                        Currently falling back to{" "}
                        <span className="font-medium text-foreground">
                          {getCodingToolLabel(preferredTool)}
                        </span>{" "}
                        because your preferred tool is unavailable.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              {toggleGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-3 pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </p>
                  </div>
                  {group.items.map((setting) => (
                    <div key={setting.id} className="flex flex-col gap-3 p-3 rounded-md transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <label htmlFor={setting.id} className="font-medium text-sm text-foreground cursor-pointer">{setting.label}</label>
                        <p className="text-xs text-muted-foreground">{setting.desc}</p>
                      </div>
                      <Switch
                        id={setting.id}
                        checked={preferences[setting.id]}
                        onCheckedChange={(checked) => {
                          if (setting.id === "launchAtLogin") {
                            void handleToggleLaunchAtLogin(checked);
                            return;
                          }

                          setPreference(setting.id, checked);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
              
              <div className="pt-4 mt-2 border-t border-border/40">
                <div className="flex flex-col gap-3 p-3 rounded-md transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">Reset Onboarding</p>
                    <p className="text-xs text-muted-foreground">Show the welcome screens again.</p>
                  </div>
                  <button 
                    onClick={handleResetOnboarding}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-border hover:bg-secondary shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart Tour
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
      <GitHubConnectDialog
        open={isGitHubConnectOpen}
        onOpenChange={setIsGitHubConnectOpen}
        onConnected={() => {
          void refetch();
        }}
      />
    </AppLayout>
  );
}
