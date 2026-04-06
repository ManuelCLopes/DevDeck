import { useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { getDesktopApi } from "@/lib/desktop";
import {
  buildWorkspaceSelectionFromImport,
  getWorkspaceSelection,
  mergeWorkspaceSelection,
  setWorkspaceSelection,
  type MonitoredProject,
} from "@/lib/workspace-selection";
import {
  clearWorkspaceHandle,
  setWorkspaceHandle,
  type AppFileSystemDirectoryHandle,
  type AppFileSystemHandle,
} from "@/lib/workspace-handle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FolderGit2, HardDrive, Plus, ShieldCheck } from "lucide-react";

type FilePickerFile = File & {
  webkitRelativePath?: string;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<AppFileSystemDirectoryHandle>;
};

type FileSystemDirectoryHandle = AppFileSystemDirectoryHandle;
type FileSystemHandle = AppFileSystemHandle;
type ProjectCandidate = MonitoredProject;

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function createRepositoryCandidate(rootName: string, relativePath = ""): ProjectCandidate {
  const isRoot = relativePath.length === 0;
  const pathSegments = relativePath.split("/").filter(Boolean);

  return {
    id: `${rootName}/${relativePath || "."}`,
    isRoot,
    name: isRoot ? rootName : pathSegments[pathSegments.length - 1] ?? rootName,
    relativePath: isRoot ? undefined : relativePath,
    repositoryCount: 1,
  };
}

function createWorkspaceRootCandidate(rootName: string): ProjectCandidate {
  return {
    id: `${rootName}/.`,
    isRoot: true,
    localPath: undefined,
    name: rootName,
    repositoryCount: 0,
  };
}

async function collectRepositoryCandidates(
  directory: FileSystemDirectoryHandle,
  rootName: string,
  relativePath = "",
): Promise<ProjectCandidate[]> {
  let containsGitDirectory = false;
  const childDirectories: FileSystemDirectoryHandle[] = [];

  for await (const entry of directory.values()) {
    if (entry.kind !== "directory") {
      continue;
    }

    if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      if (entry.name === ".git") {
        containsGitDirectory = true;
      }
      continue;
    }

    childDirectories.push(entry);
  }

  if (containsGitDirectory) {
    return [createRepositoryCandidate(rootName, relativePath)];
  }

  const candidates: ProjectCandidate[] = [];
  for (const childDirectory of childDirectories) {
    const childRelativePath = relativePath
      ? `${relativePath}/${childDirectory.name}`
      : childDirectory.name;
    candidates.push(
      ...(await collectRepositoryCandidates(childDirectory, rootName, childRelativePath)),
    );
  }

  return candidates;
}

async function discoverProjectCandidates(directory: FileSystemDirectoryHandle) {
  const rootName = directory.name;
  const discoveredRepositories = await collectRepositoryCandidates(directory, rootName);
  const candidates =
    discoveredRepositories.length > 0
      ? discoveredRepositories
      : [createWorkspaceRootCandidate(rootName)];

  return {
    candidates,
    discoveredRepositoryCount: discoveredRepositories.length,
    rootName,
  };
}

function discoverProjectCandidatesFromFiles(files: FilePickerFile[]) {
  const repositoryPaths = new Set<string>();
  let rootName: string | null = null;

  for (const file of files) {
    const segments = file.webkitRelativePath?.split("/").filter(Boolean) ?? [];
    if (segments.length === 0) {
      continue;
    }

    rootName ??= segments[0];

    const gitDirectoryIndex = segments.indexOf(".git");
    if (gitDirectoryIndex >= 1) {
      const relativePath = segments.slice(1, gitDirectoryIndex).join("/");
      repositoryPaths.add(relativePath);
    }
  }

  const discoveredRepositories = rootName
    ? Array.from(repositoryPaths)
        .sort((left, right) => left.localeCompare(right))
        .map((relativePath) =>
          createRepositoryCandidate(rootName, relativePath === "." ? "" : relativePath),
        )
    : [];

  const candidates =
    rootName && discoveredRepositories.length === 0
      ? [createWorkspaceRootCandidate(rootName)]
      : discoveredRepositories;

  return {
    candidates,
    discoveredRepositoryCount: discoveredRepositories.length,
    rootName,
  };
}

function getDefaultSelectedProjectIds(candidates: ProjectCandidate[]) {
  return candidates.map((candidate) => candidate.id);
}

interface AddProjectsDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export default function AddProjectsDialog({
  onOpenChange,
  open,
}: AddProjectsDialogProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [selectedRootName, setSelectedRootName] = useState<string | null>(null);
  const [selectedRootPath, setSelectedRootPath] = useState<string | null>(null);
  const [discoveredRepositoryCount, setDiscoveredRepositoryCount] = useState(0);
  const [projectCandidates, setProjectCandidates] = useState<ProjectCandidate[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setIsScanning(false);
    setSelectedDir(null);
    setSelectedRootName(null);
    setSelectedRootPath(null);
    setDiscoveredRepositoryCount(0);
    setProjectCandidates([]);
    setCollectionName("");
    setSelectionError(null);
    setSelectedProjectIds([]);
  };

  const applyWorkspaceDiscovery = ({
    candidates,
    discoveredRepositoryCount,
    rootName,
    rootPath,
  }: {
    candidates: ProjectCandidate[];
    discoveredRepositoryCount: number;
    rootName: string;
    rootPath?: string;
  }) => {
    setSelectionError(null);
    setSelectedRootName(rootName);
    setSelectedRootPath(rootPath ?? null);
    setSelectedDir(rootPath ?? rootName);
    setDiscoveredRepositoryCount(discoveredRepositoryCount);
    setProjectCandidates(candidates);
    setCollectionName(rootName);
    setSelectedProjectIds(getDefaultSelectedProjectIds(candidates));
  };

  const handleDirectoryFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []) as FilePickerFile[];
    const { candidates, discoveredRepositoryCount, rootName } =
      discoverProjectCandidatesFromFiles(files);

    if (!rootName) {
      setSelectionError("No folder was selected.");
      return;
    }

    void clearWorkspaceHandle();
    applyWorkspaceDiscovery({ candidates, discoveredRepositoryCount, rootName });
    event.target.value = "";
  };

  const selectDirectory = async () => {
    setSelectionError(null);
    setIsScanning(true);
    const directoryWindow = window as DirectoryPickerWindow;
    const desktopApi = getDesktopApi();

    if (desktopApi) {
      try {
        const result = await desktopApi.pickWorkspaceDirectory();
        if (!result) {
          return;
        }

        void clearWorkspaceHandle();
        applyWorkspaceDiscovery(result);
        return;
      } catch {
        setSelectionError(
          "DevDeck could not finish scanning that folder. Try a narrower workspace root.",
        );
      } finally {
        setIsScanning(false);
      }
      return;
    }

    if (typeof directoryWindow.showDirectoryPicker === "function") {
      try {
        const directory = await directoryWindow.showDirectoryPicker();
        const { candidates, discoveredRepositoryCount, rootName } =
          await discoverProjectCandidates(directory);
        await setWorkspaceHandle(directory);
        applyWorkspaceDiscovery({ candidates, discoveredRepositoryCount, rootName });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSelectionError("Folder access was blocked. Try again or use the browser fallback.");
      } finally {
        setIsScanning(false);
      }
      return;
    }

    setIsScanning(false);
    fileInputRef.current?.click();
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectionError(null);
    setSelectedProjectIds((currentProjectIds) =>
      currentProjectIds.includes(projectId)
        ? currentProjectIds.filter((currentId) => currentId !== projectId)
        : [...currentProjectIds, projectId],
    );
  };

  const handleImport = () => {
    if (!selectedDir) {
      setSelectionError("Choose a local clone folder to continue.");
      return;
    }

    if (discoveredRepositoryCount > 1 && selectedProjectIds.length === 0) {
      setSelectionError("Choose at least one repository to add.");
      return;
    }

    const nextSelection = buildWorkspaceSelectionFromImport({
      candidates: projectCandidates,
      collectionName,
      rootName: selectedRootName ?? selectedDir,
      rootPath: selectedRootPath ?? selectedDir ?? selectedRootName ?? undefined,
      selectedProjectIds,
    });

    setWorkspaceSelection(
      mergeWorkspaceSelection(getWorkspaceSelection(), nextSelection),
    );
    void queryClient.invalidateQueries({ queryKey: ["workspace", "snapshot"] });
    onOpenChange(false);
    resetState();
  };

  const selectedProjects = projectCandidates.filter((candidate) =>
    selectedProjectIds.includes(candidate.id),
  );
  const requiresRepositorySelection = discoveredRepositoryCount > 1;
  const selectedRepositoryCount = selectedProjects.every(
    (candidate) => candidate.repositoryCount !== null,
  )
    ? selectedProjects.reduce(
        (total, candidate) => total + (candidate.repositoryCount ?? 0),
        0,
      )
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetState();
        }
      }}
    >
      <DialogContent className="no-drag max-w-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-2xl border-black/10">
        <DialogHeader className="px-6 pt-6 pb-0 text-left">
          <DialogTitle className="text-xl">Add Repositories</DialogTitle>
          <DialogDescription>
            Import more repositories into your current DevDeck workspace without leaving the page.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5 max-h-[min(80vh,760px)] overflow-y-auto">
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-chart-1 bg-chart-1/10 px-3 py-1.5 rounded-md w-fit mb-4 border border-chart-1/20">
              <ShieldCheck className="w-4 h-4" />
              Local-First Analysis
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              DevDeck scans the selected folder locally and lets you append the repositories you want to track.
            </p>

            <button
              type="button"
              onClick={selectDirectory}
              disabled={isScanning}
              className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all ${
                selectedDir
                  ? "bg-secondary text-foreground border border-border"
                  : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              }`}
            >
              {isScanning
                ? "Analyzing Workspace..."
                : selectedDir
                  ? "Change Directory..."
                  : "Choose Directory..."}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleDirectoryFilesSelected}
              {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            />

            {selectedDir && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm font-mono text-foreground bg-white border border-border px-3 py-2 rounded-md shadow-sm">
                  <FolderGit2 className="w-4 h-4 text-primary" />
                  {selectedDir}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="add-projects-collection"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Collection
                  </label>
                  <Input
                    id="add-projects-collection"
                    value={collectionName}
                    onChange={(event) => setCollectionName(event.target.value)}
                    placeholder="Personal Repositories"
                    className="bg-white"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use collections to group related repositories together in the sidebar and settings.
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedDir && projectCandidates.length > 0 && (
            <div className="space-y-4">
              {requiresRepositorySelection ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Choose Repositories
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        DevDeck found multiple repositories inside {selectedDir}. Choose the ones you want to add.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedProjectIds(projectCandidates.map((candidate) => candidate.id))
                        }
                        className="text-primary hover:text-primary/80 font-medium"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProjectIds([])}
                        className="text-muted-foreground hover:text-foreground font-medium"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="no-drag space-y-2 max-h-[min(42vh,320px)] overflow-y-auto pr-2 overscroll-contain">
                    {projectCandidates.map((candidate) => {
                      const isSelected = selectedProjectIds.includes(candidate.id);
                      return (
                        <label
                          key={candidate.id}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-colors ${
                            isSelected
                              ? "border-primary/30 bg-primary/[0.04]"
                              : "border-border/60 bg-white hover:border-black/15"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProjectSelection(candidate.id)}
                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-foreground truncate">
                                {candidate.name}
                              </span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-full border border-border/60 whitespace-nowrap">
                                repo
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {candidate.isRoot
                                ? "This folder is itself a Git repository."
                                : candidate.relativePath ?? "Repository discovered inside the selected workspace."}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : discoveredRepositoryCount === 1 && selectedProjects[0] ? (
                <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Repository Detected
                  </p>
                  <p className="text-sm text-foreground mt-1">
                    DevDeck found one repository and will add <strong>{selectedProjects[0].name}</strong>.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    No Git Repository Found
                  </p>
                  <p className="text-sm text-foreground mt-1">
                    DevDeck did not detect a Git repository inside this folder yet, so it will add the selected workspace directly.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="bg-white p-2 rounded-lg border border-border/60 shadow-sm">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {selectedProjects.length > 0
                        ? `DevDeck will add ${selectedProjects.length} ${selectedProjects.length === 1 ? "repository" : "repositories"}`
                        : "DevDeck is ready to add your selection"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedRepositoryCount !== null
                        ? `We detected ${selectedRepositoryCount} Git ${selectedRepositoryCount === 1 ? "repository" : "repositories"} across your selection.`
                        : "Choose the repositories you want to append to the current workspace."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectionError && (
            <div className="rounded-lg border border-chart-3/20 bg-chart-3/5 px-4 py-3 text-sm text-chart-3">
              {selectionError}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4 bg-white/80">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-2 rounded-md text-sm font-medium border border-border bg-white hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
          >
            <HardDrive className="w-4 h-4" />
            Add Repositories
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
