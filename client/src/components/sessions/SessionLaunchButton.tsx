import * as Tooltip from "@radix-ui/react-tooltip";
import { SquareTerminal } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useCodingTool } from "@/hooks/use-coding-tool";
import { getCodingToolInstallHint } from "@/lib/coding-tool";

interface SessionLaunchButtonProps {
  className?: string;
  createPath: string;
  existingSession?: unknown;
  iconOnly?: boolean;
  onBeforeNavigate?: () => void;
  onNavigate: (path: string) => void;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export default function SessionLaunchButton({
  className,
  createPath,
  existingSession: _existingSession,
  iconOnly = false,
  onBeforeNavigate,
  onNavigate,
  size = "icon",
  variant = "outline",
}: SessionLaunchButtonProps) {
  const { availability } = useCodingTool();
  const opencodeAvailable = availability.opencode.available;
  const actionLabel = "Open OpenCode";
  const unavailableReason =
    availability.opencode.reason ?? getCodingToolInstallHint("opencode");

  const handleClick = async () => {
    if (!opencodeAvailable) {
      return;
    }

    onBeforeNavigate?.();
    onNavigate(createPath);
  };

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            type="button"
            className={className}
            disabled={!opencodeAvailable}
            onClick={() => void handleClick()}
            size={size}
            title={opencodeAvailable ? actionLabel : unavailableReason}
            variant={variant}
          >
            <SquareTerminal className="h-3.5 w-3.5" />
            {iconOnly ? null : actionLabel}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded bg-foreground px-2 py-1 text-[11px] text-background shadow-md"
            sideOffset={5}
          >
            {opencodeAvailable ? actionLabel : unavailableReason}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
