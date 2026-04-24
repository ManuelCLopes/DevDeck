import { useEffect, useMemo } from "react";
import "@xterm/xterm/css/xterm.css";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { useEmbeddedTerminal } from "@/hooks/use-embedded-terminal";
import type { TerminalPreferences, TerminalThemeName } from "@/lib/app-preferences";
import { getTerminalTheme } from "@/lib/terminal-theme";
import type { TerminalPaneAccentDefinition } from "@/lib/terminal-panes";
import { cn } from "@/lib/utils";

interface EmbeddedTerminalProps {
  active?: boolean;
  accent: TerminalPaneAccentDefinition;
  className?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
  preferences: TerminalPreferences;
  themeOverride?: TerminalThemeName;
  onClose?: () => void;
  onFocusRequest?: () => void;
}

export function EmbeddedTerminal({
  active = false,
  accent,
  className,
  command,
  args,
  cwd,
  env,
  label,
  preferences,
  themeOverride,
  onClose,
  onFocusRequest,
}: EmbeddedTerminalProps) {
  const effectivePreferences = useMemo(
    () => ({
      ...preferences,
      theme: themeOverride ?? preferences.theme,
    }),
    [preferences, themeOverride],
  );
  const { registerContainer, restart, focus, status, error, info } =
    useEmbeddedTerminal({
      cwd,
      command,
      args,
      env,
      label,
      preferences: effectivePreferences,
    });
  const theme = useMemo(
    () => getTerminalTheme(effectivePreferences.theme),
    [effectivePreferences.theme],
  );
  const displayLabel = info?.label ?? label ?? "shell";
  const displayCwd = info?.cwd ?? cwd ?? info?.shell ?? null;

  useEffect(() => {
    if (active) {
      focus();
    }
  }, [active, focus]);

  const statusTone =
    status === "error"
      ? "bg-red-50 text-red-700 border-red-200"
      : status === "exited"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "ready"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-secondary text-muted-foreground border-border/60";
  const statusLabel =
    status === "error"
      ? "Error"
      : status === "exited"
        ? "Exited"
        : status === "ready"
          ? "Live"
          : status === "starting"
            ? "Starting"
            : "Idle";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white/80 shadow-sm transition-colors",
        accent.panelClassName,
        active ? `ring-1 ${accent.ringClassName}` : "ring-0",
        className,
      )}
      onPointerDownCapture={() => {
        onFocusRequest?.();
      }}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[11px]",
          accent.headerClassName,
        )}
      >
        <div
          className={cn("h-2 w-2 rounded-full", accent.dotClassName)}
          aria-hidden="true"
        />
        <span className="truncate font-medium text-foreground/85">
          {displayLabel}
        </span>
        {displayCwd ? (
          <span
            className="ml-1 truncate text-[10px] text-muted-foreground"
            title={displayCwd}
          >
            {displayCwd}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium",
            statusTone,
          )}
        >
          {statusLabel}
        </span>
        <button
          type="button"
          onClick={restart}
          className="rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
          aria-label="Restart terminal"
          title="Restart terminal"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            aria-label="Close terminal"
            title="Close terminal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </header>
      <div
        className="relative flex-1 min-h-0 min-w-0"
        style={{ backgroundColor: theme.colors.background }}
      >
        <div
          ref={registerContainer}
          className="absolute inset-0 overflow-hidden p-2"
        />
        {status === "error" ? (
          <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-white/90 p-4">
            <div className="max-w-md space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Terminal failed to start
              </div>
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-red-900/80">
                {error ??
                  "Unknown error. Try restarting the terminal or re-running npm run electron:rebuild."}
              </p>
              <button
                type="button"
                onClick={restart}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default EmbeddedTerminal;
