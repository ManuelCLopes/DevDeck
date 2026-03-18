import type { MouseEvent } from "react";
import { Copy, FolderOpen, Trash2 } from "lucide-react";
import { useProjectActions } from "@/hooks/use-project-actions";

interface ProjectQuickActionsProps {
  className?: string;
  compact?: boolean;
  projectId: string;
  projectName: string;
  projectPath: string;
}

export default function ProjectQuickActions({
  className = "",
  compact = false,
  projectId,
  projectName,
  projectPath,
}: ProjectQuickActionsProps) {
  const { copyPath, openInCode, removeProject, revealInFinder } = useProjectActions();
  const buttonClassName = compact
    ? "rounded-md border border-border/60 bg-white/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
    : "rounded-md border border-border/60 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground";

  const handleAction =
    (action: () => Promise<void>) =>
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void action();
    };

  return (
    <div
      className={`no-drag flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${className}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={handleAction(() => openInCode(projectPath))}
        className={buttonClassName}
        aria-label={`Open ${projectName} in VS Code`}
        title="Open in VS Code"
      >
        {compact ? "VS" : "Code"}
      </button>
      <button
        type="button"
        onClick={handleAction(() => revealInFinder(projectPath))}
        className={buttonClassName}
        aria-label={`Reveal ${projectName} in Finder`}
        title="Reveal in Finder"
      >
        {compact ? <FolderOpen className="h-3.5 w-3.5" /> : "Finder"}
      </button>
      <button
        type="button"
        onClick={handleAction(() => copyPath(projectPath))}
        className={buttonClassName}
        aria-label={`Copy ${projectName} path`}
        title="Copy path"
      >
        {compact ? <Copy className="h-3.5 w-3.5" /> : "Copy"}
      </button>
      <button
        type="button"
        onClick={handleAction(() => removeProject(projectId))}
        className={`${buttonClassName} hover:bg-red-50 hover:text-red-600`}
        aria-label={`Remove ${projectName}`}
        title="Remove project"
      >
        {compact ? <Trash2 className="h-3.5 w-3.5" /> : "Remove"}
      </button>
    </div>
  );
}
