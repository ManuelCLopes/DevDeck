import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, FileCode, ArrowRight, Play } from "lucide-react";
import { getDesktopApi } from "@/lib/desktop";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ConflictedSegment {
  id: string;
  ourContent: string;
  theirContent: string;
  ourBranch: string;
  theirBranch: string;
}

interface ConflictedFile {
  filePath: string;
  fileName: string;
  conflicts: ConflictedSegment[];
  rawContent: string;
}

interface MergeConflictCanvasProps {
  repositoryPath: string;
  onResolved?: () => void;
}

export default function MergeConflictCanvas({ repositoryPath, onResolved }: MergeConflictCanvasProps) {
  const [conflictedFiles, setConflictedFiles] = useState<ConflictedFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, "our" | "their" | "both" | "none">>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { toast } = useToast();
  const desktopApi = getDesktopApi();

  useEffect(() => {
    let active = true;
    async function loadConflicts() {
      if (!desktopApi) return;
      setLoading(true);
      try {
        const data = await desktopApi.getMergeConflicts({ repositoryPath });
        if (active) {
          setConflictedFiles(data);
          if (data.length > 0) {
            setSelectedFileIndex(0);
            
            // Initialize default selections to "our"
            const initialSelections: Record<string, "our" | "their" | "both" | "none"> = {};
            data[0].conflicts.forEach((c) => {
              initialSelections[c.id] = "our";
            });
            setSelections(initialSelections);
          } else {
            setSelectedFileIndex(null);
          }
        }
      } catch (err) {
        console.error("Failed to load merge conflicts:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void loadConflicts();
    return () => {
      active = false;
    };
  }, [repositoryPath, refreshTrigger, desktopApi]);

  const activeFile = selectedFileIndex !== null ? conflictedFiles[selectedFileIndex] ?? null : null;

  const handleSelectFile = (index: number) => {
    setSelectedFileIndex(index);
    const file = conflictedFiles[index];
    const newSelections: Record<string, "our" | "their" | "both" | "none"> = {};
    file.conflicts.forEach((c) => {
      newSelections[c.id] = selections[c.id] || "our";
    });
    setSelections(newSelections);
  };

  const handleSetSelection = (conflictId: string, choice: "our" | "their" | "both") => {
    setSelections((prev) => ({
      ...prev,
      [conflictId]: choice,
    }));
  };

  const handleResolveFile = async () => {
    if (!desktopApi || !activeFile) return;
    setSubmitting(true);
    try {
      await desktopApi.resolveMergeConflict({
        repositoryPath,
        filePath: activeFile.filePath,
        selections,
      });

      toast({
        title: "Conflict Resolved",
        description: `Successfully resolved and staged ${activeFile.fileName} in Git.`,
      });

      // Refresh list
      setRefreshTrigger((prev) => prev + 1);
      if (onResolved) {
        onResolved();
      }
    } catch (err) {
      toast({
        title: "Resolution Failed",
        description: err instanceof Error ? err.message : "Failed to resolve conflict file",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
        <RefreshCwSpinner />
        Auditing local repository merge status...
      </div>
    );
  }

  if (conflictedFiles.length === 0) {
    return (
      <div className="border border-black/10 dark:border-white/10 rounded-xl p-8 bg-emerald-500/5 dark:bg-emerald-500/[0.02] text-center flex flex-col items-center justify-center space-y-3">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">Clean Git Status</p>
          <p className="text-[11px] text-muted-foreground max-w-[280px]">
            No merge conflicts detected in this repository. All active files are safely integrated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden bg-white/50 dark:bg-[#151517]/50 backdrop-blur-md shadow-lg flex h-[620px] min-h-0">
      {/* Sidebar List of Conflicted Files */}
      <div className="w-60 border-r border-black/5 dark:border-white/5 bg-neutral-100/30 dark:bg-neutral-900/30 flex flex-col shrink-0">
        <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
          <span className="text-xs font-bold text-foreground">Unresolved Conflict Cards</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2.5 space-y-1">
            {conflictedFiles.map((file, idx) => {
              const isSelected = idx === selectedFileIndex;
              return (
                <div
                  key={file.filePath}
                  onClick={() => handleSelectFile(idx)}
                  className={`px-3 py-2.5 rounded-lg text-left cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-primary/5 dark:bg-primary/[0.03] border-primary text-primary font-semibold"
                      : "bg-transparent border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-900 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] truncate flex-1 font-mono">{file.fileName}</span>
                  </div>
                  <span className="text-[9px] block mt-1.5 opacity-80 uppercase font-extrabold tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full w-max">
                    {file.conflicts.length} conflict{file.conflicts.length > 1 ? "s" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Resolution Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeFile ? (
          <>
            {/* Header info */}
            <div className="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0 bg-neutral-100/20 dark:bg-neutral-900/20">
              <div>
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 font-mono">
                  <span>File:</span>
                  <span className="text-primary font-extrabold">{activeFile.filePath}</span>
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Choose which changes to keep for each code segment, then click Resolve & Stage.
                </p>
              </div>
              <Button
                size="sm"
                disabled={submitting}
                onClick={handleResolveFile}
                className="h-8 text-[11px] font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 transition-all shadow-xs shrink-0"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Resolve & Stage File</span>
              </Button>
            </div>

            {/* Conflicts Blocks Scroll Area */}
            <ScrollArea className="flex-1 min-h-0 bg-neutral-50/20 dark:bg-black/10">
              <div className="p-5 space-y-6">
                {activeFile.conflicts.map((conflict, index) => {
                  const choice = selections[conflict.id] ?? "our";
                  
                  return (
                    <div
                      key={conflict.id}
                      className="border border-black/5 dark:border-white/5 rounded-xl bg-white dark:bg-[#1a1a1c] shadow-md overflow-hidden flex flex-col"
                    >
                      {/* Segment Index Header */}
                      <div className="px-4 py-2 bg-neutral-100/50 dark:bg-neutral-900/50 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-foreground tracking-wider uppercase">
                          Segment #{index + 1}
                        </span>
                        
                        {/* Selector Controls */}
                        <div className="flex items-center gap-1 bg-neutral-200/40 dark:bg-neutral-800/40 p-0.5 rounded-lg border border-black/5 dark:border-white/5">
                          <button
                            onClick={() => handleSetSelection(conflict.id, "our")}
                            className={`text-[9.5px] font-bold px-2 py-1 rounded-md transition-all ${
                              choice === "our"
                                ? "bg-emerald-500 text-white shadow-xs font-extrabold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Keep Ours ({conflict.ourBranch.slice(0, 8)})
                          </button>
                          <button
                            onClick={() => handleSetSelection(conflict.id, "their")}
                            className={`text-[9.5px] font-bold px-2 py-1 rounded-md transition-all ${
                              choice === "their"
                                ? "bg-sky-500 text-white shadow-xs font-extrabold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Keep Theirs ({conflict.theirBranch.slice(0, 8)})
                          </button>
                          <button
                            onClick={() => handleSetSelection(conflict.id, "both")}
                            className={`text-[9.5px] font-bold px-2 py-1 rounded-md transition-all ${
                              choice === "both"
                                ? "bg-purple-500 text-white shadow-xs font-extrabold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Keep Both
                          </button>
                        </div>
                      </div>

                      {/* Side-by-side content block */}
                      <div className="grid grid-cols-2 min-h-24">
                        {/* Ours Block */}
                        <div className={`p-4 border-r border-black/5 dark:border-white/5 flex flex-col ${
                          choice === "our" || choice === "both"
                            ? "bg-emerald-500/[0.03] dark:bg-emerald-500/[0.01]"
                            : "opacity-40"
                        }`}>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
                            Ours: {conflict.ourBranch}
                          </span>
                          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-neutral-50 dark:bg-neutral-900 p-2.5 rounded-lg border border-black/5 dark:border-white/5 flex-1 select-text">
                            {conflict.ourContent || <span className="italic text-muted-foreground/50">&lt;Empty Block&gt;</span>}
                          </pre>
                        </div>

                        {/* Theirs Block */}
                        <div className={`p-4 flex flex-col ${
                          choice === "their" || choice === "both"
                            ? "bg-sky-500/[0.03] dark:bg-sky-500/[0.01]"
                            : "opacity-40"
                        }`}>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2">
                            Theirs: {conflict.theirBranch}
                          </span>
                          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-neutral-50 dark:bg-neutral-900 p-2.5 rounded-lg border border-black/5 dark:border-white/5 flex-1 select-text">
                            {conflict.theirContent || <span className="italic text-muted-foreground/50">&lt;Empty Block&gt;</span>}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            Pick a conflicted file to resolve.
          </div>
        )}
      </div>
    </div>
  );
}

function RefreshCwSpinner() {
  return (
    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
