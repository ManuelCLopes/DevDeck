import * as Tooltip from "@radix-ui/react-tooltip";
import { SquareTerminal } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { buildTerminalsPath, type DevSession } from "@/lib/dev-sessions";

interface SessionLaunchButtonProps {
  className?: string;
  createPath: string;
  existingSession?: DevSession | null;
  iconOnly?: boolean;
  onBeforeNavigate?: () => void;
  onNavigate: (path: string) => void;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export default function SessionLaunchButton({
  className,
  createPath,
  existingSession = null,
  iconOnly = false,
  onBeforeNavigate,
  onNavigate,
  size = "icon",
  variant = "outline",
}: SessionLaunchButtonProps) {
  const actionLabel = existingSession ? "Open OpenCode" : "Start OpenCode";

  const handleClick = async () => {
    if (existingSession) {
      onBeforeNavigate?.();
      onNavigate(buildTerminalsPath(existingSession.id));
      return;
    }

    onBeforeNavigate?.();
    onNavigate(existingSession ? "/sessions" : createPath);
  };

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            type="button"
            className={className}
            onClick={() => void handleClick()}
            size={size}
            title={actionLabel}
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
            {actionLabel}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
