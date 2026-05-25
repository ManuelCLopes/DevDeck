import { useEffect, useState } from "react";
import type { WorkspaceProject } from "@shared/workspace";
import type { DevSessionOperationalSnapshot } from "@shared/sessions";
import { getDesktopApi } from "@/lib/desktop";
import { useCodingTool } from "@/hooks/use-coding-tool";
import { useToast } from "@/hooks/use-toast";
import vsCodeLogo from "@/assets/vscode.svg";
import openCodeLogo from "@/assets/opencode.svg";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderOpen,
  GitBranch,
  HardDrive,
  Plus,
  RefreshCw,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import * as Tooltip from "@radix-ui/react-tooltip";

interface WorktreeInfo {
  path: string;
  sha: string;
  branch: string | null;
  isMain: boolean;
}

interface WorktreeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: WorkspaceProject;
}

export default function WorktreeManager({
  open,
  onOpenChange,
  project,
}: WorktreeManagerProps) {
  const desktopApi = getDesktopApi();
  const codingTool = useCodingTool();
  const { toast } = useToast();

  const preferredToolLogo = codingTool.preferredTool === "opencode" ? openCodeLogo : vsCodeLogo;

  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [inspectingStates, setInspectingStates] = useState<
    Record<string, DevSessionOperationalSnapshot>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  // Form states for creating a new worktree
  const [newBranchName, setNewBranchName] = useState("");
  const [baseRef, setBaseRef] = useState(project.defaultBranch || "main");

  const loadWorktrees = async () => {
    if (!desktopApi) return;
    setIsLoading(true);
    try {
      const list = await desktopApi.listGitWorktrees(project.localPath);
      setWorktrees(list);

      // Perform inspections on discovered worktrees asynchronously
      const inspectRequests = list.map((wt) => ({
        localPath: wt.path,
        repositoryPath: project.localPath,
        sessionId: wt.path, // Use path as sessionId
      }));

      const states = await desktopApi.inspectDevSessions(inspectRequests);
      const statesMap: Record<string, DevSessionOperationalSnapshot> = {};
      states.forEach((state) => {
        statesMap[state.sessionId] = state;
      });
      setInspectingStates(statesMap);
    } catch (error) {
      console.error("Failed to load worktrees:", error);
      toast({
        title: "Failed to list worktrees",
        description: error instanceof Error ? error.message : "Internal error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadWorktrees();
      // Generate default branch recommendation
      setNewBranchName(`feature/worktree-${Math.random().toString(36).substring(2, 6)}`);
      setBaseRef(project.defaultBranch || "main");
    }
  }, [open, project]);

  const handleCreateWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desktopApi || !newBranchName.trim()) return;

    setIsCreating(true);
    try {
      const result = await desktopApi.createGitWorktreeSession({
        baseRef: baseRef.trim(),
        branchName: newBranchName.trim(),
        repositoryPath: project.localPath,
      });

      toast({
        title: "Worktree created",
        description: `Successfully mounted worktree to ${result.branchName}.`,
      });
      
      setNewBranchName("");
      void loadWorktrees();
    } catch (error) {
      console.error("Failed to create worktree:", error);
      toast({
        title: "Failed to create worktree",
        description: error instanceof Error ? error.message : "Internal error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWorktree = async (worktreePath: string, branchName: string) => {
    if (!desktopApi) return;

    // Check if dirty before pruning
    const inspect = inspectingStates[worktreePath];
    if (inspect?.hasUncommittedChanges) {
      const confirmPrune = window.confirm(
        `Warning: The worktree for "${branchName}" has uncommitted changes. Deleting it will permanently discard these changes. Are you sure you want to proceed?`
      );
      if (!confirmPrune) return;
    }

    setIsDeleting((prev) => ({ ...prev, [worktreePath]: true }));
    try {
      await desktopApi.removeGitWorktreeSession({
        repositoryPath: project.localPath,
        worktreePath,
      });

      toast({
        title: "Worktree removed",
        description: `Worktree for "${branchName}" has been successfully pruned.`,
      });

      void loadWorktrees();
    } catch (error) {
      console.error("Failed to remove worktree:", error);
      toast({
        title: "Failed to remove worktree",
        description: error instanceof Error ? error.message : "Internal error",
        variant: "destructive",
      });
    } finally {
      setIsDeleting((prev) => ({ ...prev, [worktreePath]: false }));
    }
  };

  const openInCode = async (path: string) => {
    await codingTool.openPreferredTool(path);
  };

  const openInTerminal = async (path: string) => {
    await desktopApi?.openInTerminal(path);
  };

  const revealInFinder = async (path: string) => {
    await desktopApi?.showItemInFinder(path);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg flex flex-col h-full bg-[#fbfbfb] dark:bg-[#161617] border-l dark:border-white/10 p-6 overflow-hidden">
        <SheetHeader className="pb-4 border-b border-border/40">
          <SheetTitle className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="h-4.5 w-4.5 text-primary" />
            <span>Manage Worktrees</span>
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            View, launch, or prune active git worktree paths linked to{" "}
            <strong>{project.name}</strong>.
          </SheetDescription>
        </SheetHeader>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-6 pt-4 min-h-0 pr-1 select-text">
          
          {/* Active Worktrees List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Active Worktrees</span>
              <button
                type="button"
                onClick={() => void loadWorktrees()}
                disabled={isLoading}
                className="text-primary hover:text-primary-hover flex items-center gap-1.5"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs bg-white/40 dark:bg-white/5 border border-dashed rounded-lg">
                <Spinner className="h-4 w-4" />
                <span>Loading git worktree environments...</span>
              </div>
            ) : worktrees.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs bg-white/40 dark:bg-white/5 border border-dashed rounded-lg">
                No active worktrees found.
              </div>
            ) : (
              <div className="space-y-2.5">
                {worktrees.map((wt) => {
                  const inspect = inspectingStates[wt.path];
                  const isDirty = inspect?.hasUncommittedChanges;
                  const branchName = wt.branch || "detached";
                  
                  return (
                    <div
                      key={wt.path}
                      className={`p-3 rounded-lg border shadow-xs transition-colors flex flex-col gap-2.5 bg-white dark:bg-[#1e1e1f] ${
                        wt.isMain
                          ? "border-primary/20 dark:border-primary/30 shadow-inner-xs"
                          : "border-border/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-[13px] text-foreground font-mono truncate max-w-[200px]">
                              {branchName}
                            </span>
                            {wt.isMain && (
                              <span className="px-1.5 py-0.5 rounded-sm bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold tracking-wide uppercase leading-none">
                                Main
                              </span>
                            )}
                            {isDirty && (
                              <span className="px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 text-[9px] font-bold tracking-wide uppercase leading-none">
                                Dirty
                              </span>
                            )}
                          </div>
                          
                          <p className="text-[10px] text-muted-foreground font-mono truncate mt-1 flex items-center gap-1">
                            <HardDrive className="h-2.5 w-2.5" />
                            {wt.path}
                          </p>
                          
                          {inspect?.lastCommitSubject && (
                            <p className="text-[10.5px] text-muted-foreground line-clamp-1 leading-normal mt-1 pl-1 border-l-2 border-primary/20 italic">
                              {inspect.lastCommitSubject}
                            </p>
                          )}
                        </div>

                        {/* Actions drawer */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 rounded-md"
                                  onClick={() => void openInCode(wt.path)}
                                  title={`Open in ${codingTool.preferredToolLabel}`}
                                >
                                  <img
                                    src={preferredToolLogo}
                                    alt=""
                                    className="h-3.5 w-3.5 object-contain"
                                  />
                                </Button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content className="bg-foreground text-background text-[11px] px-2 py-1 rounded shadow-md" sideOffset={5}>
                                  Open in {codingTool.preferredToolLabel}
                                  <Tooltip.Arrow className="fill-foreground" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>

                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 rounded-md text-foreground"
                                  onClick={() => void openInTerminal(wt.path)}
                                  title="Open in Terminal"
                                >
                                  <TerminalSquare className="h-3.5 w-3.5" />
                                </Button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content className="bg-foreground text-background text-[11px] px-2 py-1 rounded shadow-md" sideOffset={5}>
                                  Open in Terminal
                                  <Tooltip.Arrow className="fill-foreground" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>

                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 rounded-md text-foreground"
                                  onClick={() => void revealInFinder(wt.path)}
                                  title="Reveal in Finder"
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                </Button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content className="bg-foreground text-background text-[11px] px-2 py-1 rounded shadow-md" sideOffset={5}>
                                  Reveal in Finder
                                  <Tooltip.Arrow className="fill-foreground" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>

                          {!wt.isMain && (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 rounded-md hover:bg-red-50 hover:text-red-600"
                                    onClick={() => void handleDeleteWorktree(wt.path, branchName)}
                                    disabled={isDeleting[wt.path]}
                                    title="Prune worktree"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="bg-foreground text-background text-[11px] px-2 py-1 rounded shadow-md" sideOffset={5}>
                                    Delete worktree
                                    <Tooltip.Arrow className="fill-foreground" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-px bg-border/40 w-full" />

          {/* Create Worktree Session Form */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Launch Sibling Worktree
            </h3>
            
            <form onSubmit={handleCreateWorktree} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="branch-name" className="text-[11.5px] font-medium text-foreground">
                  New Worktree Branch Name
                </Label>
                <div className="relative">
                  <GitBranch className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="branch-name"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="e.g. feature/auth-fixes"
                    className="h-9 pl-9 text-xs rounded-lg border-border/60 bg-white"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="base-ref" className="text-[11.5px] font-medium text-foreground">
                  Base Ref / Source Branch
                </Label>
                <div className="relative">
                  <GitBranch className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="base-ref"
                    value={baseRef}
                    onChange={(e) => setBaseRef(e.target.value)}
                    placeholder="e.g. main or feature-branch"
                    className="h-9 pl-9 text-xs rounded-lg border-border/60 bg-white font-mono"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isCreating || !newBranchName.trim()}
                className="w-full h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold mt-2"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Mounting worktree session...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Launch Worktree Session</span>
                  </>
                )}
              </Button>
            </form>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
