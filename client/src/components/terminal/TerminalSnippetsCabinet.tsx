import { useState, useEffect, useMemo } from "react";
import {
  Play,
  Copy,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Terminal,
  Search,
  Check,
  X,
  PlusCircle,
  FileCode2,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { getDesktopApi } from "@/lib/desktop";
import type { WorkspaceSnapshot } from "@shared/workspace";

export interface Snippet {
  id: string;
  label: string;
  command: string;
  category: "git" | "build" | "cleanup" | "custom";
  description?: string;
  isCustom?: boolean;
}

const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: "git-status",
    label: "Check Git Status",
    command: "git status",
    category: "git",
    description: "Displays modified files and current branch status.",
  },
  {
    id: "git-checkout-b",
    label: "Create & Checkout Branch",
    command: "git checkout -b {branchName}",
    category: "git",
    description: "Creates and checks out a new branch.",
  },
  {
    id: "git-pull",
    label: "Pull from Default Branch",
    command: "git pull origin {defaultBranch}",
    category: "git",
    description: "Pulls updates from remote repository's default branch.",
  },
  {
    id: "git-push",
    label: "Push Current Branch",
    command: "git push origin {branchName}",
    category: "git",
    description: "Pushes current local branch changes to origin.",
  },
  {
    id: "git-commit",
    label: "Stage & Commit Changes",
    command: 'git add . && git commit -m "{commitMessage}"',
    category: "git",
    description: "Stages all files and commits with a custom message.",
  },
  {
    id: "npm-dev",
    label: "Start Dev Server",
    command: "npm run dev",
    category: "build",
    description: "Launches the local development server.",
  },
  {
    id: "npm-build",
    label: "Production Build",
    command: "npm run build",
    category: "build",
    description: "Builds a production-ready application bundle.",
  },
  {
    id: "npm-test",
    label: "Execute Unit Tests",
    command: "npm test",
    category: "build",
    description: "Runs all unit and integration tests.",
  },
  {
    id: "cleanup-deps",
    label: "Reinstall Dependencies",
    command: "rm -rf node_modules package-lock.json && npm install",
    category: "cleanup",
    description: "Cleans cached dependencies and does a fresh install.",
  },
  {
    id: "git-clean",
    label: "Force Git Clean",
    command: "git clean -fdx",
    category: "cleanup",
    description: "Removes all untracked files and ignored build assets.",
  },
];

interface TerminalSnippetsCabinetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePaneId: string | null;
  activePaneCwd: string | null;
  paneRuntimeStates: Record<
    string,
    {
      info: {
        cwd: string;
        id: string;
        pid: number;
        shell: string;
        label: string;
      } | null;
    }
  >;
  snapshot: WorkspaceSnapshot | null;
}

export default function TerminalSnippetsCabinet({
  open,
  onOpenChange,
  activePaneId,
  activePaneCwd,
  paneRuntimeStates,
  snapshot,
}: TerminalSnippetsCabinetProps) {
  const { toast } = useToast();
  const desktopApi = getDesktopApi();

  // Local storage custom snippets sync
  const [customSnippets, setCustomSnippets] = useState<Snippet[]>(() => {
    try {
      const stored = localStorage.getItem("devdeck:custom-snippets");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("devdeck:custom-snippets", JSON.stringify(customSnippets));
  }, [customSnippets]);

  // Combine default and custom snippets
  const allSnippets = useMemo(() => {
    return [...DEFAULT_SNIPPETS, ...customSnippets];
  }, [customSnippets]);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // Snippet editor/creator modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [editorLabel, setEditorLabel] = useState("");
  const [editorCommand, setEditorCommand] = useState("");
  const [editorCategory, setEditorCategory] = useState<"git" | "build" | "cleanup" | "custom">("custom");
  const [editorDescription, setEditorDescription] = useState("");

  // Auto-resolved variables from active terminal pane
  const resolvedAutoVars = useMemo(() => {
    const matchingProject = activePaneCwd && snapshot?.projects
      ? snapshot.projects.find(
          (p) =>
            activePaneCwd === p.localPath ||
            activePaneCwd.startsWith(p.localPath + "/")
        )
      : null;

    return {
      cwd: activePaneCwd || "",
      branchName: matchingProject?.currentBranch || "main",
      defaultBranch: matchingProject?.defaultBranch || "main",
    };
  }, [activePaneCwd, snapshot]);

  // Handle active pane state changes
  const activePtyId = activePaneId ? paneRuntimeStates[activePaneId]?.info?.id : null;
  const activePaneLabel = activePaneId ? paneRuntimeStates[activePaneId]?.info?.label || "Active Terminal" : "";

  // Extract variables needing user inputs
  const currentSnippet = useMemo(() => {
    return allSnippets.find((s) => s.id === selectedSnippetId) || null;
  }, [selectedSnippetId, allSnippets]);

  const requiredVariables = useMemo(() => {
    if (!currentSnippet) return [];
    const matches = currentSnippet.command.match(/\{([a-zA-Z0-9_]+)\}/g);
    if (!matches) return [];
    
    const uniqueMatches = Array.from(new Set(matches.map((m) => m.slice(1, -1))));
    // Filter out auto-resolved variables like branchName, defaultBranch, and cwd
    return uniqueMatches.filter(
      (v) => v !== "branchName" && v !== "defaultBranch" && v !== "cwd"
    );
  }, [currentSnippet]);

  // Handle snippet selection
  useEffect(() => {
    if (currentSnippet) {
      const initialParams: Record<string, string> = {};
      requiredVariables.forEach((v) => {
        initialParams[v] = parameters[v] || "";
      });
      setParameters(initialParams);
    }
  }, [selectedSnippetId, requiredVariables, currentSnippet]);

  // Compile active snippet command
  const compiledCommand = useMemo(() => {
    if (!currentSnippet) return "";
    let cmd = currentSnippet.command;

    // Replace auto-resolved parameters
    cmd = cmd.replace(/{branchName}/g, resolvedAutoVars.branchName);
    cmd = cmd.replace(/{defaultBranch}/g, resolvedAutoVars.defaultBranch);
    cmd = cmd.replace(/{cwd}/g, resolvedAutoVars.cwd);

    // Replace user custom parameters
    Object.entries(parameters).forEach(([key, val]) => {
      cmd = cmd.replace(new RegExp(`{${key}}`, "g"), val || `{${key}}`);
    });

    return cmd;
  }, [currentSnippet, parameters, resolvedAutoVars]);

  // Filter snippets list
  const filteredSnippets = useMemo(() => {
    return allSnippets.filter((snippet) => {
      const matchesSearch =
        snippet.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snippet.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (snippet.description &&
          snippet.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesTab = activeTab === "all" || snippet.category === activeTab;

      return matchesSearch && matchesTab;
    });
  }, [allSnippets, searchQuery, activeTab]);

  // Write compiled command directly into active PTY stream
  const executeSnippet = async () => {
    if (!desktopApi) {
      toast({
        title: "Desktop API unavailable",
        description: "Terminal PTY automation is only supported in the desktop workspace wrapper.",
        variant: "destructive",
      });
      return;
    }

    if (!activePtyId) {
      toast({
        title: "No active terminal",
        description: "Please open and focus a terminal pane before running command automation.",
        variant: "destructive",
      });
      return;
    }

    // Verify all custom parameters are filled
    const missing = requiredVariables.filter((v) => !parameters[v]?.trim());
    if (missing.length > 0) {
      toast({
        title: "Parameter required",
        description: `Please specify a value for: ${missing.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Append a newline character to automatically execute the command in the shell PTY
      await desktopApi.terminal.write({
        id: activePtyId,
        data: compiledCommand + "\r",
      });

      toast({
        title: "Snippet injected",
        description: `Injected command into terminal session "${activePaneLabel}".`,
      });

      // Keep drawer open but collapse selection if desired
      setSelectedSnippetId(null);
    } catch (error) {
      toast({
        title: "Execution failed",
        description: error instanceof Error ? error.message : "PTY write failed",
        variant: "destructive",
      });
    }
  };

  const handleCopyToClipboard = async (commandText: string, snippetId: string) => {
    try {
      await navigator.clipboard.writeText(commandText);
      setCopiedSnippetId(snippetId);
      setTimeout(() => setCopiedSnippetId(null), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Snippet command copied to your system clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not access system clipboard.",
        variant: "destructive",
      });
    }
  };

  // Open custom snippet creator
  const handleOpenCreator = () => {
    setEditingSnippet(null);
    setEditorLabel("");
    setEditorCommand("");
    setEditorCategory("custom");
    setEditorDescription("");
    setIsEditorOpen(true);
  };

  // Open custom snippet editor
  const handleOpenEditor = (snippet: Snippet, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSnippet(snippet);
    setEditorLabel(snippet.label);
    setEditorCommand(snippet.command);
    setEditorCategory(snippet.category);
    setEditorDescription(snippet.description || "");
    setIsEditorOpen(true);
  };

  // Save Snippet Action
  const handleSaveSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorLabel.trim() || !editorCommand.trim()) {
      toast({
        title: "Form incomplete",
        description: "Please specify both a valid title and a command structure.",
        variant: "destructive",
      });
      return;
    }

    if (editingSnippet) {
      // Edit mode
      setCustomSnippets((prev) =>
        prev.map((s) =>
          s.id === editingSnippet.id
            ? {
                ...s,
                label: editorLabel.trim(),
                command: editorCommand.trim(),
                category: editorCategory,
                description: editorDescription.trim(),
              }
            : s
        )
      );
      toast({
        title: "Snippet updated",
        description: `Successfully updated snippet "${editorLabel}".`,
      });
    } else {
      // New mode
      const newSnippet: Snippet = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        label: editorLabel.trim(),
        command: editorCommand.trim(),
        category: editorCategory,
        description: editorDescription.trim(),
        isCustom: true,
      };
      setCustomSnippets((prev) => [...prev, newSnippet]);
      toast({
        title: "Snippet created",
        description: `Created new custom automation "${editorLabel}".`,
      });
    }

    setIsEditorOpen(false);
  };

  // Delete Custom Snippet
  const handleDeleteSnippet = (snippetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmDelete = window.confirm("Are you sure you want to delete this custom snippet?");
    if (!confirmDelete) return;

    setCustomSnippets((prev) => prev.filter((s) => s.id !== snippetId));
    if (selectedSnippetId === snippetId) {
      setSelectedSnippetId(null);
    }
    toast({
      title: "Snippet removed",
      description: "Successfully deleted custom automation.",
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[420px] sm:w-[460px] max-w-full flex flex-col p-0 bg-white/95 dark:bg-[#121214]/95 border-l border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-lg">
          <SheetHeader className="p-6 pb-4 border-b border-black/5 dark:border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                <span>Snippets Cabinet</span>
              </SheetTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenCreator}
                className="h-8 px-2.5 text-[11px] font-semibold gap-1.5 rounded-lg border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground transition-all shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Snippet</span>
              </Button>
            </div>
            <SheetDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              Store custom workflows and inject commands directly into active terminals with dynamic variables.
            </SheetDescription>
          </SheetHeader>

          {/* Quick Terminal PTY Info Capsule */}
          <div className="px-6 py-2.5 bg-neutral-100/50 dark:bg-neutral-900/50 border-b border-black/5 dark:border-white/5 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Terminal className="h-3.5 w-3.5" />
              <span>Target Shell:</span>
            </div>
            {activePaneId ? (
              <span className="font-mono bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
                {activePaneLabel}
              </span>
            ) : (
              <span className="font-mono bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full font-semibold">
                No Terminal Focused
              </span>
            )}
          </div>

          {/* Search Box */}
          <div className="px-6 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search snippets or commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-lg border-black/10 dark:border-white/10 bg-white/50 dark:bg-[#1b1b1f]/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 hover:text-foreground text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Categories Tab Group */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0 pt-4"
          >
            <div className="px-6 pb-2">
              <TabsList className="grid grid-cols-5 w-full h-8.5 rounded-lg p-0.5 bg-neutral-100 dark:bg-neutral-900 border border-black/5 dark:border-white/5">
                <TabsTrigger
                  value="all"
                  className="text-[10px] font-semibold py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-[#1c1c1e] data-[state=active]:shadow-xs transition-all"
                >
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="git"
                  className="text-[10px] font-semibold py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-[#1c1c1e] data-[state=active]:shadow-xs transition-all"
                >
                  Git
                </TabsTrigger>
                <TabsTrigger
                  value="build"
                  className="text-[10px] font-semibold py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-[#1c1c1e] data-[state=active]:shadow-xs transition-all"
                >
                  Build
                </TabsTrigger>
                <TabsTrigger
                  value="cleanup"
                  className="text-[10px] font-semibold py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-[#1c1c1e] data-[state=active]:shadow-xs transition-all"
                >
                  Clean
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className="text-[10px] font-semibold py-1 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-[#1c1c1e] data-[state=active]:shadow-xs transition-all"
                >
                  Custom
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Cabinet Content Scroll Area */}
            <ScrollArea className="flex-1 px-6 pb-6">
              <div className="space-y-2.5 py-2">
                {filteredSnippets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-black/10 dark:border-white/10 rounded-xl bg-neutral-50/20 dark:bg-neutral-900/10">
                    <FileCode2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-xs font-semibold text-foreground">No matching snippets</p>
                    <p className="text-[11px] text-muted-foreground max-w-[200px] mt-1">
                      Try adjusting search filters or create a new custom shortcut.
                    </p>
                  </div>
                ) : (
                  filteredSnippets.map((snippet) => {
                    const isSelected = selectedSnippetId === snippet.id;
                    const requiresInput =
                      snippet.command.includes("{") &&
                      (snippet.command.includes("{commitMessage}") ||
                        snippet.command.includes("{packageName}") ||
                        !snippet.command.includes("{branchName}") ||
                        !snippet.command.includes("{defaultBranch}") ||
                        !snippet.command.includes("{cwd}")); // custom placeholder heuristic

                    return (
                      <div
                        key={snippet.id}
                        onClick={() => setSelectedSnippetId(isSelected ? null : snippet.id)}
                        className={`group border rounded-xl p-3.5 transition-all cursor-pointer flex flex-col text-left ${
                          isSelected
                            ? "border-primary bg-primary/5 dark:bg-primary/[0.03] shadow-xs"
                            : "border-black/5 dark:border-white/5 bg-white/70 dark:bg-[#1b1b1e]/70 hover:border-black/15 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-foreground">
                                {snippet.label}
                              </span>
                              <span
                                className={`text-[9px] font-extrabold tracking-wider uppercase px-1.5 py-0.5 rounded-full ${
                                  snippet.category === "git"
                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                                    : snippet.category === "build"
                                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                    : snippet.category === "cleanup"
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                }`}
                              >
                                {snippet.category}
                              </span>
                              {snippet.isCustom && (
                                <span className="text-[9px] font-extrabold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400">
                                  User
                                </span>
                              )}
                            </div>
                            {snippet.description && (
                              <p className="text-[11px] text-muted-foreground leading-normal pt-0.5">
                                {snippet.description}
                              </p>
                            )}
                          </div>

                          {/* Quick Card Action Buttons */}
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                            {snippet.isCustom && (
                              <>
                                <button
                                  onClick={(e) => handleOpenEditor(snippet, e)}
                                  className="h-6 w-6 rounded-md border border-black/5 dark:border-white/5 bg-white dark:bg-neutral-800 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all"
                                  title="Edit Snippet"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={(e) => handleDeleteSnippet(snippet.id, e)}
                                  className="h-6 w-6 rounded-md border border-black/5 dark:border-white/5 bg-white dark:bg-neutral-800 flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                  title="Delete Snippet"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCopyToClipboard(snippet.command, snippet.id);
                              }}
                              className="h-6 w-6 rounded-md border border-black/5 dark:border-white/5 bg-white dark:bg-neutral-800 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all"
                              title="Copy Command Template"
                            >
                              {copiedSnippetId === snippet.id ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Static Single line preview when collapsed */}
                        {!isSelected && (
                          <div className="mt-2 text-[10px] font-mono bg-neutral-50 dark:bg-neutral-900/60 p-2 rounded-lg border border-black/[0.03] dark:border-white/[0.03] text-muted-foreground truncate max-w-full">
                            {snippet.command}
                          </div>
                        )}

                        {/* Parameter Form & Execution details (Expanded Card) */}
                        {isSelected && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3.5 pt-3.5 border-t border-black/5 dark:border-white/5 space-y-3 cursor-default"
                          >
                            {/* Inputs for custom variables */}
                            {requiredVariables.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-[10px] font-bold text-foreground block tracking-wider uppercase">
                                  Shortcut Parameters
                                </span>
                                <div className="grid grid-cols-1 gap-2.5">
                                  {requiredVariables.map((variable) => (
                                    <div key={variable} className="space-y-1">
                                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase">
                                        {variable.replace(/([A-Z])/g, " $1")}
                                      </Label>
                                      <Input
                                        placeholder={`Enter ${variable}...`}
                                        value={parameters[variable] || ""}
                                        onChange={(e) =>
                                          setParameters((prev) => ({
                                            ...prev,
                                            [variable]: e.target.value,
                                          }))
                                        }
                                        className="h-8 text-xs rounded-md border-black/10 dark:border-white/10 bg-white dark:bg-[#202022] focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Compiled Live Preview box */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-foreground block tracking-wider uppercase">
                                  Compiled Command Execution
                                </span>
                                <button
                                  onClick={() => void handleCopyToClipboard(compiledCommand, snippet.id)}
                                  className="text-[10px] text-primary hover:underline font-medium"
                                >
                                  {copiedSnippetId === snippet.id ? "Copied!" : "Copy Command"}
                                </button>
                              </div>
                              <pre className="text-[10.5px] font-mono leading-normal bg-neutral-950 text-neutral-100 p-3 rounded-lg border border-black/10 overflow-x-auto select-text whitespace-pre-wrap break-all shadow-inner">
                                <span className="text-emerald-500 select-none mr-2 font-bold">$</span>
                                {compiledCommand}
                              </pre>
                            </div>

                            {/* Execution buttons */}
                            <div className="flex gap-2 justify-end pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-[11px] rounded-lg text-muted-foreground border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground transition-all"
                                onClick={() => setSelectedSnippetId(null)}
                              >
                                Collapse
                              </Button>
                              <Button
                                size="sm"
                                disabled={!activePtyId}
                                className="h-8 px-3 text-[11px] rounded-lg gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold transition-all shadow-xs"
                                onClick={executeSnippet}
                              >
                                <Play className="h-3 w-3 fill-current" />
                                <span>Run Command</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Snippet Creator / Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[110] bg-black/60 dark:bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleSaveSnippet}
            className="w-full max-w-md border border-black/10 dark:border-white/10 rounded-xl bg-white dark:bg-[#1a1a1c] p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
              <h3 className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                <PlusCircle className="h-4.5 w-4.5 text-primary" />
                <span>{editingSnippet ? "Edit Snippet" : "Create Custom Snippet"}</span>
              </h3>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditorOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Snippet Title */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold uppercase">Snippet Label</Label>
                <Input
                  placeholder="e.g. Run Linter"
                  value={editorLabel}
                  onChange={(e) => setEditorLabel(e.target.value)}
                  className="h-9 text-xs rounded-lg border-black/10 dark:border-white/10 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 bg-white/50 dark:bg-black/20"
                />
              </div>

              {/* Command text with instruction for placehoders */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground font-semibold uppercase">Command Structure</Label>
                  <span className="text-[9px] text-primary/80 font-medium">Use variables like {'{branchName}'}</span>
                </div>
                <Textarea
                  placeholder="e.g. npm run lint -- --branch {branchName} or npm run custom {packageName}"
                  value={editorCommand}
                  onChange={(e) => setEditorCommand(e.target.value)}
                  className="min-h-20 text-xs font-mono rounded-lg border-black/10 dark:border-white/10 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 bg-white/50 dark:bg-black/20 leading-normal"
                />
                <p className="text-[9.5px] text-muted-foreground/80 leading-normal mt-1">
                  Supported automated tags: <code className="font-mono text-[9px] bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded font-bold">{"{branchName}"}</code>, <code className="font-mono text-[9px] bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded font-bold">{"{defaultBranch}"}</code>, and <code className="font-mono text-[9px] bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded font-bold">{"{cwd}"}</code>. Any other tags will render as custom parameters.
                </p>
              </div>

              {/* Category */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold uppercase">Category</Label>
                <Select
                  value={editorCategory}
                  onValueChange={(val: "git" | "build" | "cleanup" | "custom") =>
                    setEditorCategory(val)
                  }
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 focus:ring-1 focus:ring-primary focus:ring-offset-0">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#1a1a1c] border border-black/10 dark:border-white/10">
                    <SelectItem value="git" className="text-xs">Git Automation</SelectItem>
                    <SelectItem value="build" className="text-xs">Build & Test</SelectItem>
                    <SelectItem value="cleanup" className="text-xs">System Cleanup</SelectItem>
                    <SelectItem value="custom" className="text-xs">Custom Script</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold uppercase">Description (Optional)</Label>
                <Input
                  placeholder="e.g. Scans source code files for static errors."
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  className="h-9 text-xs rounded-lg border-black/10 dark:border-white/10 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 bg-white/50 dark:bg-black/20"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-black/5 dark:border-white/5">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 text-xs rounded-lg text-muted-foreground border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground transition-all"
                onClick={() => setIsEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 px-4 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold transition-all"
              >
                {editingSnippet ? "Save Changes" : "Create Snippet"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
