import { ChevronDown, FolderTree, Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCodingTool } from "@/hooks/use-coding-tool";
import {
  getCodingToolInstallHint,
  getCodingToolShortLabel,
  type CodingToolId,
} from "@/lib/coding-tool";

interface OpenInCodeButtonProps {
  className?: string;
  disabled?: boolean;
  iconOnly?: boolean;
  size?: ButtonProps["size"];
  targetPath: string;
  variant?: ButtonProps["variant"];
}

const TOOLS: CodingToolId[] = ["vscode", "opencode"];

function CodingToolIcon({ tool, className }: { tool: CodingToolId; className?: string }) {
  if (tool === "opencode") {
    return <Sparkles className={className} />;
  }

  return <FolderTree className={className} />;
}

export default function OpenInCodeButton({
  className,
  disabled,
  iconOnly = false,
  size = "sm",
  targetPath,
  variant = "outline",
}: OpenInCodeButtonProps) {
  const {
    availability,
    isToolAvailable,
    openPreferredTool,
    preferredTool,
    preferredToolShortLabel,
  } = useCodingTool();

  const alternateToolsAvailable = TOOLS.some(
    (tool) => tool !== preferredTool && isToolAvailable(tool),
  );

  return (
    <div className={`inline-flex items-center ${className ?? ""}`}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => void openPreferredTool(targetPath)}
        className={`gap-1.5 ${alternateToolsAvailable ? "rounded-r-none border-r-0" : ""}`}
        title={`Open in ${preferredToolShortLabel}`}
      >
        <CodingToolIcon tool={preferredTool} className="h-3.5 w-3.5" />
        {iconOnly ? null : preferredToolShortLabel}
      </Button>

      {alternateToolsAvailable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={variant}
              size={size}
              disabled={disabled}
              className="rounded-l-none px-2"
              aria-label="Choose coding tool"
              title="Choose coding tool"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Open with</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TOOLS.map((tool) => {
              const entry = availability[tool];
              const enabled = entry?.available ?? false;

              return (
                <DropdownMenuItem
                  key={tool}
                  disabled={!enabled}
                  onSelect={() => {
                    if (!enabled) {
                      return;
                    }
                    void openPreferredTool(targetPath, tool);
                  }}
                  title={enabled ? undefined : getCodingToolInstallHint(tool)}
                >
                  <CodingToolIcon tool={tool} className="mr-2 h-3.5 w-3.5" />
                  <span>{getCodingToolShortLabel(tool)}</span>
                  {tool === preferredTool ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
