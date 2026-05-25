import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Brain,
  ShieldAlert,
  FileCode,
  ThumbsUp,
  Check,
  Copy,
  Send,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Flame,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { getDesktopApi } from "@/lib/desktop";
import type { WorkspacePullRequestItem } from "@shared/workspace";

export interface AIConfig {
  provider: "ollama" | "gemini" | "anthropic";
  ollamaHost?: string;
  ollamaModel?: string;
  geminiKey?: string;
  anthropicKey?: string;
}

interface AICopilotDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullRequest: WorkspacePullRequestItem | null;
}

export default function AICopilotDrawer({
  open,
  onOpenChange,
  pullRequest,
}: AICopilotDrawerProps) {
  const { toast } = useToast();
  const desktopApi = getDesktopApi();

  // AI settings synced to local storage
  const [config, setConfig] = useState<AIConfig>(() => {
    try {
      const stored = localStorage.getItem("devdeck:ai-settings");
      return stored
        ? JSON.parse(stored)
        : {
            provider: "ollama",
            ollamaHost: "http://localhost:11434",
            ollamaModel: "llama3",
            geminiKey: "",
            anthropicKey: "",
          };
    } catch {
      return {
        provider: "ollama",
        ollamaHost: "http://localhost:11434",
        ollamaModel: "llama3",
        geminiKey: "",
        anthropicKey: "",
      };
    }
  });

  useEffect(() => {
    localStorage.setItem("devdeck:ai-settings", JSON.stringify(config));
  }, [config]);

  // UI state
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<"changelog" | "security" | "draft-response" | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  // Load Git Diff when PR changes or drawer opens
  useEffect(() => {
    if (!open || !pullRequest || !pullRequest.repositorySlug) {
      setDiff(null);
      setAiResult(null);
      setAiError(null);
      setActiveAction(null);
      return;
    }

    const loadDiff = async () => {
      setDiffLoading(true);
      setDiffError(null);
      try {
        if (!desktopApi?.getPullRequestDiff) {
          throw new Error("Desktop bridge is unavailable or missing diff endpoint.");
        }

        const rawDiff = await desktopApi.getPullRequestDiff({
          repositorySlug: pullRequest.repositorySlug,
          pullRequestNumber: pullRequest.number,
        });
        
        setDiff(rawDiff);
      } catch (error) {
        console.error("Failed to retrieve PR diff:", error);
        setDiffError(error instanceof Error ? error.message : "GitHub diff request failed.");
      } finally {
        setDiffLoading(false);
      }
    };

    void loadDiff();
  }, [open, pullRequest]);

  // Request completion from local main thread AI service
  const triggerAIAnalysis = async (action: "changelog" | "security" | "draft-response") => {
    if (!diff) {
      toast({
        title: "Diff missing",
        description: "Pull request changes are not fully loaded yet.",
        variant: "destructive",
      });
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setActiveAction(action);

    try {
      if (!desktopApi?.generateAICompletion) {
        throw new Error("AI bridge endpoint is missing in this DevDeck client.");
      }

      const result = await desktopApi.generateAICompletion({
        diff,
        action,
        config,
      });

      setAiResult(result);
    } catch (error) {
      console.error("AI Completion failed:", error);
      setAiError(error instanceof Error ? error.message : "Inference connection timed out.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!aiResult) return;
    try {
      await navigator.clipboard.writeText(aiResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "AI analysis markdown copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not access clipboard.",
        variant: "destructive",
      });
    }
  };

  // Publish AI output directly back to GitHub
  const handlePostToGitHub = async () => {
    if (!aiResult || !pullRequest || !pullRequest.repositorySlug || !desktopApi) return;
    
    setPostingComment(true);
    try {
      await desktopApi.addPullRequestComment({
        body: aiResult,
        pullRequestNumber: pullRequest.number,
        repositorySlug: pullRequest.repositorySlug,
      });

      toast({
        title: "Review published",
        description: `Successfully posted review output directly to GitHub #${pullRequest.number}!`,
      });
    } catch (error) {
      toast({
        title: "Publish failed",
        description: error instanceof Error ? error.message : "GitHub comment posting failed.",
        variant: "destructive",
      });
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:w-[480px] max-w-full flex flex-col p-0 bg-white/95 dark:bg-[#121214]/95 border-l border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-lg z-[105]">
        <SheetHeader className="p-6 pb-4 border-b border-black/5 dark:border-white/5 space-y-1">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
              <span>AI Pull Request Co-Pilot</span>
            </SheetTitle>
            <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Beta
            </span>
          </div>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            Analyze diff files, discover vulnerability hot-spots, draft peer responses, and publish automatically.
          </SheetDescription>
        </SheetHeader>

        {/* PR Target metadata */}
        {pullRequest && (
          <div className="px-6 py-2.5 bg-neutral-100/50 dark:bg-neutral-900/50 border-b border-black/5 dark:border-white/5 flex items-center justify-between text-[11px]">
            <span className="font-mono text-muted-foreground font-semibold truncate max-w-[200px]">
              {pullRequest.repo} · #{pullRequest.number}
            </span>
            <span className="font-mono bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded-full font-bold">
              {config.provider.toUpperCase()}
            </span>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* AI Settings Section */}
          <div className="border-b border-black/5 dark:border-white/5">
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30 text-xs font-semibold text-foreground/80 transition-all"
            >
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <span>Configure Co-Pilot LLM Provider</span>
              </div>
              {isConfigOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {isConfigOpen && (
              <div className="px-6 pb-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
                {/* Select Provider */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold uppercase">AI Provider</Label>
                  <Select
                    value={config.provider}
                    onValueChange={(val: "ollama" | "gemini" | "anthropic") =>
                      setConfig((prev: AIConfig) => ({ ...prev, provider: val }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs rounded-md border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20">
                      <SelectValue placeholder="Select LLM" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1a1a1c] border border-black/10 dark:border-white/10">
                      <SelectItem value="ollama" className="text-xs">Ollama (Offline/Local)</SelectItem>
                      <SelectItem value="gemini" className="text-xs">Google Gemini Flash (Cloud)</SelectItem>
                      <SelectItem value="anthropic" className="text-xs">Anthropic Claude (Cloud)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Ollama options */}
                {config.provider === "ollama" && (
                  <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Ollama Host</Label>
                      <Input
                        value={config.ollamaHost || ""}
                        onChange={(e) => setConfig((prev: AIConfig) => ({ ...prev, ollamaHost: e.target.value }))}
                        placeholder="http://localhost:11434"
                        className="h-8 text-xs rounded-md border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Model Name</Label>
                      <Input
                        value={config.ollamaModel || ""}
                        onChange={(e) => setConfig((prev: AIConfig) => ({ ...prev, ollamaModel: e.target.value }))}
                        placeholder="llama3"
                        className="h-8 text-xs rounded-md border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20"
                      />
                    </div>
                  </div>
                )}

                {/* Gemini option */}
                {config.provider === "gemini" && (
                  <div className="space-y-1 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Gemini API Key</Label>
                      <button
                        onClick={() => setShowKeys(!showKeys)}
                        className="text-[9.5px] text-primary hover:underline font-medium"
                      >
                        {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                    <Input
                      type={showKeys ? "text" : "password"}
                      value={config.geminiKey || ""}
                      onChange={(e) => setConfig((prev: AIConfig) => ({ ...prev, geminiKey: e.target.value }))}
                      placeholder="AIzaSy..."
                      className="h-8 text-xs rounded-md border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20"
                    />
                  </div>
                )}

                {/* Anthropic option */}
                {config.provider === "anthropic" && (
                  <div className="space-y-1 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Claude API Key</Label>
                      <button
                        onClick={() => setShowKeys(!showKeys)}
                        className="text-[9.5px] text-primary hover:underline font-medium"
                      >
                        {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                    <Input
                      type={showKeys ? "text" : "password"}
                      value={config.anthropicKey || ""}
                      onChange={(e) => setConfig((prev: AIConfig) => ({ ...prev, anthropicKey: e.target.value }))}
                      placeholder="sk-ant-..."
                      className="h-8 text-xs rounded-md border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-6 flex-1 flex flex-col space-y-5 min-h-0">
            {/* Diff Loading Shimmer */}
            {diffLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-black/10 dark:border-white/10 rounded-xl bg-neutral-50/20 dark:bg-neutral-900/10">
                <RefreshCw className="h-8 w-8 text-primary animate-spin mb-3" />
                <p className="text-xs font-semibold text-foreground">Downloading Pull Request Diffs...</p>
                <p className="text-[11px] text-muted-foreground max-w-[200px] mt-1">
                  Querying the GitHub REST API to isolate changed lines.
                </p>
              </div>
            )}

            {/* Diff Error Display */}
            {diffError && (
              <div className="border border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50/30 dark:bg-rose-950/10 p-4 flex flex-col text-left gap-3">
                <div className="flex items-start gap-2.5 text-rose-800 dark:text-rose-400">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold">Failed to load diff files</h4>
                    <p className="text-[11px] leading-relaxed pt-0.5">{diffError}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Double check your GitHub token connection in preferences and ensure you have internet connectivity.
                </p>
              </div>
            )}

            {/* Loaded Diff -> Show Action Grid */}
            {diff && !diffLoading && (
              <div className="space-y-4">
                <span className="text-[10px] font-bold text-foreground block tracking-wider uppercase">
                  AI Review Actions
                </span>

                <div className="grid grid-cols-3 gap-2.5">
                  {/* Changelog Card */}
                  <button
                    onClick={() => triggerAIAnalysis("changelog")}
                    disabled={aiLoading}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      activeAction === "changelog"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-black/5 dark:border-white/5 bg-white/70 dark:bg-[#1b1b1e]/70 hover:border-black/15 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/40 text-foreground"
                    }`}
                  >
                    <FileCode className="h-5.5 w-5.5 mb-1.5 text-sky-500" />
                    <span className="text-[10px] font-extrabold tracking-tight">Generate Changelog</span>
                  </button>

                  {/* Security Card */}
                  <button
                    onClick={() => triggerAIAnalysis("security")}
                    disabled={aiLoading}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      activeAction === "security"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-black/5 dark:border-white/5 bg-white/70 dark:bg-[#1b1b1e]/70 hover:border-black/15 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/40 text-foreground"
                    }`}
                  >
                    <ShieldAlert className="h-5.5 w-5.5 mb-1.5 text-rose-500 animate-pulse" />
                    <span className="text-[10px] font-extrabold tracking-tight">Security Review</span>
                  </button>

                  {/* Draft Feedback Card */}
                  <button
                    onClick={() => triggerAIAnalysis("draft-response")}
                    disabled={aiLoading}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      activeAction === "draft-response"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-black/5 dark:border-white/5 bg-white/70 dark:bg-[#1b1b1e]/70 hover:border-black/15 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/40 text-foreground"
                    }`}
                  >
                    <ThumbsUp className="h-5.5 w-5.5 mb-1.5 text-emerald-500" />
                    <span className="text-[10px] font-extrabold tracking-tight">Draft Response</span>
                  </button>
                </div>
              </div>
            )}

            {/* Completion Result Container */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Spinner while model executes */}
              {aiLoading && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <div className="relative mb-4">
                    <Brain className="h-10 w-10 text-primary animate-pulse" />
                    <Flame className="h-4 w-4 text-orange-500 absolute -top-1 -right-1 animate-bounce" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">
                    {activeAction === "changelog"
                      ? "Synthesizing Diff Changelog..."
                      : activeAction === "security"
                      ? "Auditing Security Vulnerabilities..."
                      : "Drafting Review Peer Response..."}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground max-w-[240px] mt-1.5 leading-relaxed">
                    Executing logic on {config.provider.toUpperCase()} provider. Large diff structures may require a few seconds.
                  </p>
                </div>
              )}

              {/* Completion Error */}
              {aiError && (
                <div className="border border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50/30 dark:bg-rose-950/10 p-4 flex flex-col text-left gap-2.5">
                  <div className="flex items-start gap-2.5 text-rose-800 dark:text-rose-400">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold">LLM Execution Failure</h4>
                      <p className="text-[11px] leading-relaxed pt-0.5">{aiError}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    {config.provider === "ollama"
                      ? "Verify Ollama is running locally on your computer (run 'ollama list' in terminal) and the model name exists."
                      : "Check that your cloud key preferences are populated and the API limits are respected."}
                  </p>
                </div>
              )}

              {/* Success Result Container */}
              {aiResult && !aiLoading && (
                <div className="flex-1 flex flex-col min-h-0 border border-black/5 dark:border-white/5 rounded-xl bg-white/70 dark:bg-[#18181a]/70 shadow-xs overflow-hidden">
                  {/* Result Header actions */}
                  <div className="px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-neutral-100/30 dark:bg-neutral-900/30">
                    <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
                      Analysis Report
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyToClipboard}
                        className="h-6.5 px-2 text-[10px] font-semibold border border-black/5 dark:border-white/5 bg-white dark:bg-neutral-800 rounded-md flex items-center gap-1 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all text-muted-foreground"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        <span>{copied ? "Copied" : "Copy"}</span>
                      </button>
                      
                      {activeAction !== "security" && (
                        <button
                          onClick={handlePostToGitHub}
                          disabled={postingComment}
                          className="h-6.5 px-2 text-[10px] font-bold bg-primary text-primary-foreground rounded-md flex items-center gap-1 hover:bg-primary/95 transition-all"
                        >
                          <Send className="h-3 w-3 fill-current" />
                          <span>{postingComment ? "Posting..." : "Post to PR"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Render Custom Markdown Scroll */}
                  <ScrollArea className="flex-1 p-4">
                    <div className="text-left pb-6">
                      <MarkdownContent content={aiResult} />
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Custom Premium Markdown Component to completely bypass peer-dependency bugs
function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const renderedElements: React.ReactNode[] = [];

  lines.forEach((line, idx) => {
    // Code block detection
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        renderedElements.push(
          <pre
            key={`code-${idx}`}
            className="my-3.5 p-3.5 bg-neutral-950 text-neutral-100 rounded-xl font-mono text-[10.5px] leading-relaxed border border-black/10 overflow-x-auto whitespace-pre-wrap break-all shadow-inner text-left select-text"
          >
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    const trimmed = line.trim();

    // Markdown Headers
    if (trimmed.startsWith("#")) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const text = trimmed.replace(/^#+\s*/, "");
      const headerText = replaceBoldItalic(text);

      if (level === 1) {
        renderedElements.push(
          <h1 key={`h1-${idx}`} className="text-sm font-extrabold text-foreground mt-4 mb-2 tracking-tight">
            {headerText}
          </h1>
        );
      } else if (level === 2) {
        renderedElements.push(
          <h2 key={`h2-${idx}`} className="text-xs font-bold text-foreground mt-3.5 mb-2 pb-1 border-b border-black/5 dark:border-white/5 tracking-tight">
            {headerText}
          </h2>
        );
      } else {
        renderedElements.push(
          <h3 key={`h3-${idx}`} className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-3 mb-1">
            {headerText}
          </h3>
        );
      }
      return;
    }

    // Markdown Bullet lists
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const text = trimmed.slice(2);
      renderedElements.push(
        <li key={`li-${idx}`} className="ml-4 list-disc text-[11px] text-muted-foreground leading-normal mb-1.5">
          {replaceBoldItalic(text)}
        </li>
      );
      return;
    }

    // Numbered lists
    if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, "");
      renderedElements.push(
        <li key={`ol-${idx}`} className="ml-4 list-decimal text-[11px] text-muted-foreground leading-normal mb-1.5">
          {replaceBoldItalic(text)}
        </li>
      );
      return;
    }

    // Blank line
    if (!trimmed) {
      renderedElements.push(<div key={`br-${idx}`} className="h-2.5" />);
      return;
    }

    // Paragraph
    renderedElements.push(
      <p key={`p-${idx}`} className="text-[11px] text-muted-foreground leading-relaxed mb-2">
        {replaceBoldItalic(trimmed)}
      </p>
    );
  });

  return <div className="space-y-0.5">{renderedElements}</div>;
}

// Utility to replace bold formatting segments
function replaceBoldItalic(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    const italicParts = part.split(/(\*[^*]+\*)/g);
    return italicParts.map((subPart, subIdx) => {
      if (subPart.startsWith("*") && subPart.endsWith("*")) {
        return (
          <em key={`${idx}-${subIdx}`} className="italic text-foreground/90 font-medium">
            {subPart.slice(1, -1)}
          </em>
        );
      }
      return subPart;
    });
  });
}
