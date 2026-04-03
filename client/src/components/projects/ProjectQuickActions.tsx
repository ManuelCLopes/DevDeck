import type { MouseEvent } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import { useProjectActions } from "@/hooks/use-project-actions";
import vsCodeLogo from "@/assets/vscode.svg";

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
  const { openInCode, removeProject, revealInFinder } = useProjectActions();
  const buttonClassName = compact
    ? "flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-white/90 text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
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
      className={`no-drag flex items-center overflow-hidden transition-[max-width,opacity,transform] duration-200 ${
        compact
          ? "max-w-0 gap-1 opacity-0 -translate-x-1 pointer-events-none group-hover:max-w-32 group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto focus-within:max-w-32 focus-within:opacity-100 focus-within:translate-x-0 focus-within:pointer-events-auto"
          : "max-w-0 gap-1 opacity-0 translate-x-1 pointer-events-none group-hover:max-w-72 group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto focus-within:max-w-72 focus-within:opacity-100 focus-within:translate-x-0 focus-within:pointer-events-auto"
      } ${className}`}
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
        {compact ? (
          <img
            src={vsCodeLogo}
            alt=""
            aria-hidden="true"
            className="h-3.5 w-3.5 object-contain"
          />
        ) : (
          "Code"
        )}
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
