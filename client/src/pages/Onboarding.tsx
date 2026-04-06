import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { navigateInApp } from "@/lib/app-navigation";
import { setCompletedOnboarding } from "@/lib/onboarding-state";
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
  setWorkspaceHandle,
  clearWorkspaceHandle,
  type AppFileSystemDirectoryHandle,
  type AppFileSystemHandle,
} from "@/lib/workspace-handle";
import WindowControls from "@/components/layout/WindowControls";
import type { GitHubRepositoryCandidate } from "@shared/workspace";
import { 
  FolderGit2, 
  ShieldCheck, 
  LayoutGrid, 
  MessageSquare, 
  Activity,
  HardDrive,
  CheckCircle2,
  Github,
  Search,
  ChevronRight,
  ChevronLeft
} from "lucide-react";

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

export default function Onboarding() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const isAppendMode = searchParams.get("mode") === "append";
  const returnTo = searchParams.get("returnTo") ?? "/";
  const [, setLocation] = useLocation();
  const desktopApi = getDesktopApi();
  const [step, setStep] = useState(isAppendMode ? 4 : 1);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingGitHubRepositories, setIsLoadingGitHubRepositories] = useState(false);
  const [githubRepositories, setGitHubRepositories] = useState<GitHubRepositoryCandidate[]>([]);
  const [githubRepositoryError, setGitHubRepositoryError] = useState<string | null>(null);
  const [githubRepositoryQuery, setGitHubRepositoryQuery] = useState("");
  const [selectedGitHubRepositorySlugs, setSelectedGitHubRepositorySlugs] = useState<string[]>([]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [selectedRootName, setSelectedRootName] = useState<string | null>(null);
  const [selectedRootPath, setSelectedRootPath] = useState<string | null>(null);
  const [discoveredRepositoryCount, setDiscoveredRepositoryCount] = useState(0);
  const [discoveredProjectCandidates, setDiscoveredProjectCandidates] = useState<ProjectCandidate[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setDiscoveredProjectCandidates(candidates);
    setSelectedProjectIds([]);
  };

  const handleNext = () => {
    if (step === 3) {
      setStep(4);
      return;
    }

    if (step !== 4) {
      setStep(prev => prev + 1);
      return;
    }

    if (!selectedDir) {
      setSelectionError("Choose a local clone folder to continue.");
      return;
    }

    if (
      selectedGitHubRepositorySlugs.length > 0 &&
      linkedProjectCandidates.length === 0
    ) {
      setSelectionError(
        "None of the selected GitHub repositories were found in this local folder yet.",
      );
      return;
    }

    if (linkedProjectCandidates.length > 1 && selectedProjectIds.length === 0) {
      setSelectionError("Choose at least one repository to monitor.");
      return;
    }

    setStep(5);
  };

  const handleComplete = () => {
    if (!selectedDir) {
      return;
    }

    const nextSelection = buildWorkspaceSelectionFromImport({
      candidates: linkedProjectCandidates,
      rootName: selectedRootName ?? selectedDir,
      rootPath: selectedRootPath ?? selectedDir ?? selectedRootName ?? undefined,
      selectedProjectIds,
    });
    setWorkspaceSelection(
      isAppendMode
        ? mergeWorkspaceSelection(getWorkspaceSelection(), nextSelection)
        : nextSelection,
    );
    void queryClient.invalidateQueries({ queryKey: ["workspace", "snapshot"] });
    setCompletedOnboarding();
    navigateInApp(returnTo, setLocation);
  };

  const selectedGitHubRepositorySet = useMemo(
    () => new Set(selectedGitHubRepositorySlugs),
    [selectedGitHubRepositorySlugs],
  );
  const selectedGitHubRepositories = useMemo(
    () =>
      githubRepositories.filter((repository) =>
        selectedGitHubRepositorySet.has(repository.slug),
      ),
    [githubRepositories, selectedGitHubRepositorySet],
  );
  const linkedProjectCandidates = useMemo(() => {
    if (selectedGitHubRepositorySet.size === 0) {
      return discoveredProjectCandidates;
    }

    return discoveredProjectCandidates.filter((candidate) =>
      candidate.githubRepositorySlug
        ? selectedGitHubRepositorySet.has(candidate.githubRepositorySlug)
        : false,
    );
  }, [discoveredProjectCandidates, selectedGitHubRepositorySet]);
  const matchedGitHubRepositorySlugSet = useMemo(
    () =>
      new Set(
        linkedProjectCandidates
          .map((candidate) => candidate.githubRepositorySlug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    [linkedProjectCandidates],
  );
  const unmatchedGitHubRepositories = useMemo(
    () =>
      selectedGitHubRepositories.filter(
        (repository) => !matchedGitHubRepositorySlugSet.has(repository.slug),
      ),
    [matchedGitHubRepositorySlugSet, selectedGitHubRepositories],
  );
  const filteredGitHubRepositories = useMemo(() => {
    const query = githubRepositoryQuery.trim().toLowerCase();
    return githubRepositories
      .slice()
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
      .filter((repository) =>
        query.length === 0
          ? true
          : [repository.name, repository.slug, repository.description ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(query),
      );
  }, [githubRepositories, githubRepositoryQuery]);

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
    setSelectedDir(null);
    setDiscoveredRepositoryCount(0);
    setDiscoveredProjectCandidates([]);
    setSelectedProjectIds([]);
    const directoryWindow = window as DirectoryPickerWindow;

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
    }

    setIsScanning(false);
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (!desktopApi) {
      return;
    }

    let cancelled = false;
    setIsLoadingGitHubRepositories(true);
    setGitHubRepositoryError(null);

    void desktopApi
      .listGitHubRepositories()
      .then((repositories) => {
        if (cancelled) {
          return;
        }

        setGitHubRepositories(repositories);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setGitHubRepositoryError(
          "DevDeck could not load your GitHub repositories right now.",
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsLoadingGitHubRepositories(false);
      });

    return () => {
      cancelled = true;
    };
  }, [desktopApi]);

  const selectedProjects = linkedProjectCandidates.filter((candidate) =>
    selectedProjectIds.includes(candidate.id),
  );
  const requiresRepositorySelection = linkedProjectCandidates.length > 1;
  const isProjectSelectionStep = step === 4 && requiresRepositorySelection;
  const selectedRepositoryCount = selectedProjects.every(
    (candidate) => candidate.repositoryCount !== null,
  )
    ? selectedProjects.reduce(
        (total, candidate) => total + (candidate.repositoryCount ?? 0),
        0,
      )
    : null;

  const toggleProjectSelection = (projectId: string) => {
    setSelectionError(null);
    setSelectedProjectIds((currentProjectIds) =>
      currentProjectIds.includes(projectId)
        ? currentProjectIds.filter((currentId) => currentId !== projectId)
        : [...currentProjectIds, projectId],
    );
  };

  const toggleGitHubRepositorySelection = (repositorySlug: string) => {
    setSelectionError(null);
    setSelectedGitHubRepositorySlugs((currentRepositorySlugs) =>
      currentRepositorySlugs.includes(repositorySlug)
        ? currentRepositorySlugs.filter((currentSlug) => currentSlug !== repositorySlug)
        : [...currentRepositorySlugs, repositorySlug],
    );
  };

  useEffect(() => {
    if (
      selectedDir &&
      discoveredRepositoryCount === 0 &&
      discoveredProjectCandidates.length > 1
    ) {
      setSelectedDir(null);
      setSelectedRootName(null);
      setSelectedRootPath(null);
      setDiscoveredProjectCandidates([]);
      setSelectedProjectIds([]);
      setSelectionError("Workspace scan data was refreshed. Choose the folder again.");
    }
  }, [discoveredProjectCandidates.length, discoveredRepositoryCount, selectedDir]);

  useEffect(() => {
    setSelectedProjectIds((currentProjectIds) => {
      if (linkedProjectCandidates.length === 0) {
        return [];
      }

      const candidateIds = new Set(linkedProjectCandidates.map((candidate) => candidate.id));
      const nextSelectedIds = currentProjectIds.filter((projectId) => candidateIds.has(projectId));

      if (nextSelectedIds.length > 0) {
        return nextSelectedIds;
      }

      return getDefaultSelectedProjectIds(linkedProjectCandidates);
    });
  }, [linkedProjectCandidates]);

  const getCandidateLabel = (candidate: ProjectCandidate) =>
    candidate.isRoot ? candidate.name : candidate.relativePath ?? candidate.name;

  return (
    <div className="flex h-screen bg-[#ececec] overflow-hidden text-[13px] font-sans items-center justify-center p-4">
      {/* Mac Window Wrapper */}
      <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] bg-white/90 backdrop-blur-3xl border border-black/10 rounded-xl shadow-2xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-500">
        
        {/* Titlebar */}
        <div className="h-[40px] titlebar-drag-region flex items-center justify-center relative border-b border-black/5 bg-white/50">
          <div className="absolute left-[18px] top-[14px]">
            <WindowControls dimmed />
          </div>
          <span className="font-semibold text-xs text-muted-foreground">Welcome to DevDeck</span>
        </div>

        {/* Content Area */}
        <div
          className={`no-drag p-10 flex-1 min-h-0 flex flex-col items-center overflow-y-auto ${
            isProjectSelectionStep ? "justify-start" : "justify-center"
          }`}
        >
          
          {step === 1 && (
            <div className="text-center max-w-md space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="w-20 h-20 bg-gradient-to-b from-primary/80 to-primary text-primary-foreground rounded-2xl mx-auto shadow-lg flex items-center justify-center border border-black/10">
                <LayoutGrid className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-3">Welcome to DevDeck</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  DevDeck is the desktop-first cockpit for software engineers. <br/>
                  Gain high-signal visibility into your repositories, manage code reviews efficiently, and connect GitHub context with your local clones.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="w-full max-w-lg animate-in fade-in slide-in-from-right-8 duration-500">
              <h2 className="text-xl font-bold text-center mb-8">Capabilities</h2>
              
              <div className="space-y-4">
                <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="bg-primary/10 p-2.5 rounded-lg h-fit">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Repository Overview</h3>
                    <p className="text-xs text-muted-foreground">A clear overview of the repositories you care about most, with GitHub signals and local context in one place.</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="bg-primary/10 p-2.5 rounded-lg h-fit">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Code Review Workflow</h3>
                    <p className="text-xs text-muted-foreground">A dedicated inbox for PRs. Instantly identify required actions, blocked items, and performance metrics.</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="bg-primary/10 p-2.5 rounded-lg h-fit">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Linked Local Context</h3>
                    <p className="text-xs text-muted-foreground">Connect the repositories you follow on GitHub to their local clones, so DevDeck can surface branch and commit context too.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="w-full max-w-2xl animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-secondary rounded-full mx-auto flex items-center justify-center mb-6">
                  <Github className="w-8 h-8 text-foreground/70" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-3">Choose Repositories</h2>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  Start from GitHub if you want. Pick the repositories you want DevDeck to follow more closely, then link their local clones in the next step.
                </p>
              </div>

              <div className="bg-secondary/20 border border-border/60 rounded-xl p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      GitHub Selection
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Optional. Skip this step if you prefer to start from local clones only.
                    </p>
                  </div>
                  {githubRepositories.length > 0 ? (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedGitHubRepositorySlugs(
                            filteredGitHubRepositories.map((repository) => repository.slug),
                          )
                        }
                        className="text-primary hover:text-primary/80 font-medium"
                      >
                        Select all visible
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedGitHubRepositorySlugs([])}
                        className="text-muted-foreground hover:text-foreground font-medium"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>

                {isLoadingGitHubRepositories ? (
                  <div className="rounded-lg border border-border/60 bg-white px-4 py-6 text-sm text-muted-foreground text-center">
                    Loading repositories from GitHub...
                  </div>
                ) : githubRepositoryError ? (
                  <div className="rounded-lg border border-chart-3/20 bg-chart-3/5 px-4 py-3 text-sm text-chart-3">
                    {githubRepositoryError}
                  </div>
                ) : githubRepositories.length === 0 ? (
                  <div className="rounded-lg border border-border/60 bg-white px-4 py-4 text-sm text-muted-foreground">
                    GitHub is not connected yet, or DevDeck could not find repositories for your account. You can continue with local clones now and connect GitHub later in Preferences.
                  </div>
                ) : (
                  <>
                    <div className="relative mb-4">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={githubRepositoryQuery}
                        onChange={(event) => setGitHubRepositoryQuery(event.target.value)}
                        placeholder="Filter GitHub repositories..."
                        className="w-full h-9 rounded-md border border-border/60 bg-white pl-8 pr-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
                      />
                    </div>

                    <div className="no-drag space-y-2 max-h-[min(42vh,360px)] overflow-y-auto pr-2 overscroll-contain">
                      {filteredGitHubRepositories.map((repository) => {
                        const isSelected = selectedGitHubRepositorySlugs.includes(repository.slug);
                        return (
                          <label
                            key={repository.id}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "border-primary/30 bg-primary/[0.04]"
                                : "border-border/60 bg-white hover:border-black/15"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleGitHubRepositorySelection(repository.slug)}
                              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {repository.slug}
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-full border border-border/60 whitespace-nowrap">
                                  {repository.isPrivate ? "private" : "public"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 break-words">
                                {repository.description?.trim().length
                                  ? repository.description
                                  : `Updated ${new Date(repository.updatedAt).toLocaleDateString()}`}
                              </p>
                            </div>
                          </label>
                        );
                      })}

                      {filteredGitHubRepositories.length === 0 ? (
                        <div className="rounded-lg border border-border/60 bg-white px-4 py-4 text-sm text-muted-foreground">
                          No GitHub repositories matched your search.
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center max-w-lg animate-in fade-in slide-in-from-right-8 duration-500 w-full">
              <div className="w-16 h-16 bg-secondary rounded-full mx-auto flex items-center justify-center mb-6">
                <HardDrive className="w-8 h-8 text-foreground/70" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">
                {selectedGitHubRepositories.length > 0 ? "Link Local Clones" : "Choose Local Clones"}
              </h2>
              <p className="text-sm text-muted-foreground mb-8">
                {selectedGitHubRepositories.length > 0
                  ? "Choose the root folder where those repositories are cloned locally. DevDeck will match them against GitHub and keep the deeper local context linked."
                  : "Choose the root folder where your repositories live. DevDeck will scan it locally and use that as the execution context for the repositories you track."}
              </p>
              
              <div className="bg-secondary/20 border border-border/60 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-2 text-xs font-medium text-chart-1 bg-chart-1/10 px-3 py-1.5 rounded-md w-fit mx-auto mb-4 border border-chart-1/20">
                  <ShieldCheck className="w-4 h-4" /> Local-First Analysis
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  DevDeck reads the folder on your machine to find linked local clones. Your source code never leaves your Mac.
                </p>
                
                <button 
                  onClick={selectDirectory}
                  disabled={isScanning}
                  className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all ${
                    selectedDir 
                      ? 'bg-secondary text-foreground border border-border' 
                      : 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  }`}
                >
                  {isScanning ? "Analyzing Local Clones..." : selectedDir ? "Change Folder..." : "Choose Folder..."}
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
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm font-mono text-foreground bg-white border border-border px-3 py-2 rounded-md shadow-sm">
                    <FolderGit2 className="w-4 h-4 text-primary" />
                    {selectedDir}
                  </div>
                )}

                {selectedDir && selectedGitHubRepositories.length > 0 ? (
                  <div className="mt-5 text-left space-y-4">
                    <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Selected on GitHub
                      </p>
                      <p className="text-sm text-foreground mt-1">
                        {selectedGitHubRepositories.length} {selectedGitHubRepositories.length === 1 ? "repository" : "repositories"} selected for deeper local analysis.
                      </p>
                    </div>

                    {linkedProjectCandidates.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Linked Local Repositories
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              DevDeck matched these selected repositories to local clones inside {selectedDir}.
                            </p>
                          </div>
                          {requiresRepositorySelection ? (
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedProjectIds(
                                    linkedProjectCandidates.map((candidate) => candidate.id),
                                  )
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
                          ) : null}
                        </div>

                        <div className="no-drag space-y-2 max-h-[min(42vh,320px)] overflow-y-auto pr-2 overscroll-contain">
                          {linkedProjectCandidates.map((candidate) => {
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
                                      {candidate.githubRepositorySlug ?? getCandidateLabel(candidate)}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-full border border-border/60 whitespace-nowrap">
                                      local clone
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1 break-all">
                                    {candidate.localPath ?? getCandidateLabel(candidate)}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-chart-3/20 bg-chart-3/5 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-chart-3">
                          No Local Match Yet
                        </p>
                        <p className="text-sm text-chart-3 mt-1">
                          DevDeck did not find any of the selected GitHub repositories inside this folder. Choose a different local clone root or go back and continue without GitHub selection.
                        </p>
                      </div>
                    )}

                    {unmatchedGitHubRepositories.length > 0 ? (
                      <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Not Linked Yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          These selected repositories are not cloned inside this folder yet.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {unmatchedGitHubRepositories.map((repository) => (
                            <span
                              key={repository.slug}
                              className="inline-flex items-center rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground"
                            >
                              {repository.slug}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : selectedDir && linkedProjectCandidates.length > 0 ? (
                  <div className="mt-5 text-left">
                    {requiresRepositorySelection ? (
                      <>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Choose Repositories
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              DevDeck found multiple repositories inside {selectedDir}. Choose the ones you want to monitor.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProjectIds(
                                  linkedProjectCandidates.map((candidate) => candidate.id),
                                )
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
                          {linkedProjectCandidates.map((candidate) => {
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
                                      {getCandidateLabel(candidate)}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-full border border-border/60 whitespace-nowrap">
                                      repo
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {candidate.isRoot
                                      ? "This folder is itself a Git repository."
                                      : "Repository discovered inside the selected folder."}
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
                          DevDeck found one repository and will monitor <strong>{getCandidateLabel(selectedProjects[0])}</strong>.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          No Git Repository Found
                        </p>
                        <p className="text-sm text-foreground mt-1">
                          DevDeck did not detect a Git repository inside this folder yet, so it will monitor the selected folder directly.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                {selectionError && (
                  <p className="mt-4 text-xs text-chart-3">{selectionError}</p>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center max-w-md animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-chart-1/10 rounded-full mx-auto flex items-center justify-center mb-6 border border-chart-1/20">
                <CheckCircle2 className="w-10 h-10 text-chart-1" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">You're All Set!</h2>
              <p className="text-sm text-muted-foreground mb-8">
                {selectedGitHubRepositories.length > 0 && selectedProjects.length > 0 ? (
                  <>
                    DevDeck linked {selectedProjects.length} {selectedProjects.length === 1 ? "repository" : "repositories"} from GitHub to local clones inside <strong>{selectedDir}</strong>.
                    {unmatchedGitHubRepositories.length > 0 ? (
                      <>
                        {" "}There {unmatchedGitHubRepositories.length === 1 ? "is" : "are"} still {unmatchedGitHubRepositories.length} selected {unmatchedGitHubRepositories.length === 1 ? "repository" : "repositories"} without a local clone in that folder.
                      </>
                    ) : null}
                    <br/>
                    You can adjust linked repositories later from Preferences.
                  </>
                ) : linkedProjectCandidates.length > 1 ? (
                  <>
                    DevDeck will monitor {selectedProjects.length} {selectedProjects.length === 1 ? "repository" : "repositories"} inside <strong>{selectedDir}</strong>.
                    {selectedRepositoryCount !== null && (
                      <>
                        {" "}We detected {selectedRepositoryCount} Git {selectedRepositoryCount === 1 ? "repository" : "repositories"} across your selection.
                      </>
                    )}
                    <br/>
                    You can change this selection later from Preferences.
                  </>
                ) : discoveredRepositoryCount === 1 && selectedProjects[0] ? (
                  <>
                    DevDeck found 1 Git repository in <strong>{selectedDir}</strong>: <strong>{getCandidateLabel(selectedProjects[0])}</strong>. <br/>
                    We&apos;ll continue monitoring it locally in the background.
                  </>
                ) : (
                  <>
                    DevDeck connected to <strong>{selectedDir}</strong>. <br/>
                    We&apos;ll continue using that folder as the local execution context in the background.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-5 border-t border-black/5 bg-secondary/30 flex justify-between items-center relative">
          {/* Progress Dots */}
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div 
                key={i} 
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-border'
                }`} 
              />
            ))}
          </div>

          {step > 1 && step < 5 ? (
            <button 
              onClick={() => setStep(step - 1)}
              disabled={isScanning}
              className="px-4 py-2 rounded-md text-sm font-medium hover:bg-black/5 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}

          {step < 5 ? (
            <button 
              onClick={handleNext}
              disabled={
                isScanning ||
                (step === 4 &&
                  (!selectedDir ||
                    (selectedGitHubRepositorySlugs.length > 0 &&
                      linkedProjectCandidates.length === 0) ||
                    (linkedProjectCandidates.length > 1 && selectedProjectIds.length === 0)))
              }
              className="px-5 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              onClick={handleComplete}
              className="px-6 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2 ml-auto"
            >
              Launch DevDeck
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
