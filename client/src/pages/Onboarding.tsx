import { useEffect, useRef, useState } from "react";
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
import { 
  FolderGit2, 
  ShieldCheck, 
  LayoutGrid, 
  MessageSquare, 
  Activity,
  HardDrive,
  CheckCircle2,
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
  const [step, setStep] = useState(isAppendMode ? 3 : 1);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [selectedRootName, setSelectedRootName] = useState<string | null>(null);
  const [selectedRootPath, setSelectedRootPath] = useState<string | null>(null);
  const [discoveredRepositoryCount, setDiscoveredRepositoryCount] = useState(0);
  const [projectCandidates, setProjectCandidates] = useState<ProjectCandidate[]>([]);
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
    setProjectCandidates(candidates);
    setSelectedProjectIds(getDefaultSelectedProjectIds(candidates));
  };

  const handleNext = () => {
    if (step !== 3) {
      setStep(prev => prev + 1);
      return;
    }

    if (!selectedDir) {
      setSelectionError("Choose a workspace folder to continue.");
      return;
    }

    if (discoveredRepositoryCount > 1 && selectedProjectIds.length === 0) {
      setSelectionError("Choose at least one repository to monitor.");
      return;
    }

    setStep(4);
  };

  const handleComplete = () => {
    if (!selectedDir) {
      return;
    }

    const nextSelection = buildWorkspaceSelectionFromImport({
      candidates: projectCandidates,
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
    setProjectCandidates([]);
    setSelectedProjectIds([]);
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

  const selectedProjects = projectCandidates.filter((candidate) =>
    selectedProjectIds.includes(candidate.id),
  );
  const requiresRepositorySelection = discoveredRepositoryCount > 1;
  const isProjectSelectionStep = step === 3 && requiresRepositorySelection;
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

  useEffect(() => {
    if (selectedDir && discoveredRepositoryCount === 0 && projectCandidates.length > 1) {
      setSelectedDir(null);
      setSelectedRootName(null);
      setSelectedRootPath(null);
      setProjectCandidates([]);
      setSelectedProjectIds([]);
      setSelectionError("Workspace scan data was refreshed. Choose the folder again.");
    }
  }, [discoveredRepositoryCount, projectCandidates.length, selectedDir]);

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
                  Gain high-signal visibility into your projects, manage code reviews efficiently, and track local repository health.
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
                    <h3 className="font-semibold text-sm mb-1">Project Overview</h3>
                    <p className="text-xs text-muted-foreground">A clear overview of all your local repositories. Monitor PR counts, issue queues, and build statuses effortlessly.</p>
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
                    <h3 className="font-semibold text-sm mb-1">Targeted Activity</h3>
                    <p className="text-xs text-muted-foreground">Reduce notification noise. A focused stream for mentions, build failures, and approvals that impact your current work.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center max-w-lg animate-in fade-in slide-in-from-right-8 duration-500 w-full">
              <div className="w-16 h-16 bg-secondary rounded-full mx-auto flex items-center justify-center mb-6">
                <HardDrive className="w-8 h-8 text-foreground/70" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">Select Workspace</h2>
              <p className="text-sm text-muted-foreground mb-8">
                Choose the root folder where your code lives. DevDeck will automatically scan for Git repositories inside it.
              </p>
              
              <div className="bg-secondary/20 border border-border/60 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-2 text-xs font-medium text-chart-1 bg-chart-1/10 px-3 py-1.5 rounded-md w-fit mx-auto mb-4 border border-chart-1/20">
                  <ShieldCheck className="w-4 h-4" /> Local-First Analysis
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  We process data locally on your machine. Your source code never leaves your Mac. Zero telemetry, maximum privacy.
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
                  {isScanning ? "Analyzing Workspace..." : selectedDir ? "Change Directory..." : "Choose Directory..."}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={handleDirectoryFilesSelected}
                  // Browser fallback when showDirectoryPicker is unavailable.
                  {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                />

                {selectedDir && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm font-mono text-foreground bg-white border border-border px-3 py-2 rounded-md shadow-sm">
                    <FolderGit2 className="w-4 h-4 text-primary" />
                    {selectedDir}
                  </div>
                )}

                {selectedDir && projectCandidates.length > 0 && (
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
                                      {getCandidateLabel(candidate)}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-full border border-border/60 whitespace-nowrap">
                                      repo
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {candidate.isRoot
                                      ? "This folder is itself a Git repository."
                                      : "Repository discovered inside the selected workspace."}
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
                          DevDeck did not detect a Git repository inside this folder yet, so it will monitor the selected workspace directly.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectionError && (
                  <p className="mt-4 text-xs text-chart-3">{selectionError}</p>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center max-w-md animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-chart-1/10 rounded-full mx-auto flex items-center justify-center mb-6 border border-chart-1/20">
                <CheckCircle2 className="w-10 h-10 text-chart-1" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">You're All Set!</h2>
              <p className="text-sm text-muted-foreground mb-8">
                {discoveredRepositoryCount > 1 ? (
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
                    We&apos;ll continue monitoring this folder locally in the background.
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
            {[1, 2, 3, 4].map(i => (
              <div 
                key={i} 
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-border'
                }`} 
              />
            ))}
          </div>

          {step > 1 && step < 4 ? (
            <button 
              onClick={() => setStep(step - 1)}
              disabled={isScanning}
              className="px-4 py-2 rounded-md text-sm font-medium hover:bg-black/5 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}

          {step < 4 ? (
            <button 
              onClick={handleNext}
              disabled={
                isScanning ||
                (step === 3 &&
                  (!selectedDir ||
                    (discoveredRepositoryCount > 1 && selectedProjectIds.length === 0)))
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
