import { useCallback, useEffect, useId, useState } from "react";
import {
  Columns2,
  Grid2x2,
  Rows2,
  Settings,
  Square,
} from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  getDefaultTerminalPaneAccent,
  getTerminalPaneAccentDefinition,
  TERMINAL_PANE_ACCENTS,
  type TerminalLayout,
  type TerminalPaneConfig,
} from "@/lib/terminal-panes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmbeddedTerminal } from "@/components/terminal/EmbeddedTerminal";
import type { TerminalPreferences } from "@/lib/app-preferences";
import { TERMINAL_THEMES } from "@/lib/terminal-theme";
import { cn } from "@/lib/utils";

interface TerminalGridProps {
  activePaneId?: string | null;
  layout: TerminalLayout;
  onLayoutChange: (layout: TerminalLayout) => void;
  onActivePaneIdChange?: (paneId: string | null) => void;
  panes: TerminalPaneConfig[];
  onPanesChange: (panes: TerminalPaneConfig[]) => void;
  preferences: TerminalPreferences;
  headerSlot?: React.ReactNode;
  availableShells?: Array<{ label: string; command: string; args?: string[] }>;
  defaultCwd?: string;
  showLayoutPicker?: boolean;
}

const VALID_LAYOUTS: readonly TerminalLayout[] = [
  "single",
  "columns",
  "rows",
  "grid",
];

export function defaultLayoutForSaved(value: unknown): TerminalLayout {
  if (typeof value === "string" && VALID_LAYOUTS.includes(value as TerminalLayout)) {
    return value as TerminalLayout;
  }
  return "single";
}

export function layoutCapacity(layout: TerminalLayout): number {
  switch (layout) {
    case "single":
      return 1;
    case "columns":
    case "rows":
      return 2;
    case "grid":
      return 4;
    default:
      return 1;
  }
}

function layoutLabel(layout: TerminalLayout): string {
  switch (layout) {
    case "single":
      return "Single";
    case "columns":
      return "Columns";
    case "rows":
      return "Rows";
    case "grid":
      return "2 × 2 Grid";
    default:
      return "Layout";
  }
}

function layoutIcon(layout: TerminalLayout) {
  switch (layout) {
    case "single":
      return Square;
    case "columns":
      return Columns2;
    case "rows":
      return Rows2;
    case "grid":
      return Grid2x2;
    default:
      return Square;
  }
}

function ensurePaneCount(
  panes: TerminalPaneConfig[],
  count: number,
  defaultCwd: string | undefined,
): TerminalPaneConfig[] {
  const next = panes.slice(0, count);
  while (next.length < count) {
    next.push(createDefaultPane(next.length, defaultCwd));
  }
  return next;
}

export function createDefaultPane(
  index: number,
  defaultCwd: string | undefined,
): TerminalPaneConfig {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pane-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    label: `Shell ${index + 1}`,
    cwd: defaultCwd,
    accent: getDefaultTerminalPaneAccent(index),
  };
}

export function TerminalGrid({
  activePaneId: controlledActivePaneId,
  layout,
  onLayoutChange,
  onActivePaneIdChange,
  panes,
  onPanesChange,
  preferences,
  headerSlot,
  availableShells,
  defaultCwd,
  showLayoutPicker = true,
}: TerminalGridProps) {
  const [internalActivePaneId, setInternalActivePaneId] = useState<string | null>(
    panes[0]?.id ?? null,
  );
  const activePaneId = controlledActivePaneId ?? internalActivePaneId;
  const normalizedPanes = ensurePaneCount(
    panes,
    layoutCapacity(layout),
    defaultCwd,
  );

  const setActivePaneId = useCallback(
    (paneId: string | null) => {
      if (controlledActivePaneId === undefined) {
        setInternalActivePaneId(paneId);
      }

      onActivePaneIdChange?.(paneId);
    },
    [controlledActivePaneId, onActivePaneIdChange],
  );

  // If the active pane was removed (e.g. layout shrank), snap to the first.
  useEffect(() => {
    if (
      activePaneId !== null &&
      !normalizedPanes.some((pane) => pane.id === activePaneId)
    ) {
      setActivePaneId(normalizedPanes[0]?.id ?? null);
    }
  }, [activePaneId, normalizedPanes]);

  // Keep persisted pane list in sync with the layout's capacity. Runs in
  // effect-space so parents don't re-render mid-render.
  useEffect(() => {
    if (normalizedPanes.length !== panes.length) {
      onPanesChange(normalizedPanes);
    }
  }, [normalizedPanes, onPanesChange, panes.length]);

  const handleUpdatePane = useCallback(
    (paneId: string, updates: Partial<TerminalPaneConfig>) => {
      onPanesChange(
        normalizedPanes.map((pane) =>
          pane.id === paneId ? { ...pane, ...updates } : pane,
        ),
      );
    },
    [normalizedPanes, onPanesChange],
  );

  const handleShrinkLayout = useCallback(() => {
    if (layout === "single") {
      return;
    }

    const nextLayout: TerminalLayout = layout === "grid" ? "columns" : "single";
    onLayoutChange(nextLayout);
  }, [layout, onLayoutChange]);

  const renderPane = (pane: TerminalPaneConfig) => (
    <div className="h-full min-h-0 min-w-0">
      <TerminalPane
        active={pane.id === activePaneId}
        pane={pane}
        preferences={preferences}
        onUpdate={(updates) => handleUpdatePane(pane.id, updates)}
        onFocus={() => setActivePaneId(pane.id)}
        onClose={normalizedPanes.length > 1 ? handleShrinkLayout : undefined}
        availableShells={availableShells}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {showLayoutPicker || headerSlot ? (
        <div className="flex items-center gap-2 pb-2">
          {showLayoutPicker ? (
            <LayoutPicker layout={layout} onChange={onLayoutChange} />
          ) : null}
          {headerSlot}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 min-w-0">
        {layout === "single" ? (
          <div className="h-full min-h-0 min-w-0">{renderPane(normalizedPanes[0])}</div>
        ) : layout === "columns" ? (
          <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 min-w-0 gap-1">
            <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
              {renderPane(normalizedPanes[0])}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
              {renderPane(normalizedPanes[1])}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : layout === "rows" ? (
          <ResizablePanelGroup direction="vertical" className="h-full min-h-0 min-w-0 gap-1">
            <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
              {renderPane(normalizedPanes[0])}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
              {renderPane(normalizedPanes[1])}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ResizablePanelGroup direction="vertical" className="h-full min-h-0 min-w-0 gap-1">
            <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
              <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 min-w-0 gap-1">
                <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
                  {renderPane(normalizedPanes[0])}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
                  {renderPane(normalizedPanes[1])}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
              <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 min-w-0 gap-1">
                <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
                  {renderPane(normalizedPanes[2])}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={15} className="min-h-0 min-w-0">
                  {renderPane(normalizedPanes[3])}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

interface LayoutPickerProps {
  layout: TerminalLayout;
  onChange: (layout: TerminalLayout) => void;
}

export function LayoutPicker({ layout, onChange }: LayoutPickerProps) {
  const options: TerminalLayout[] = ["single", "columns", "rows", "grid"];
  const LayoutIcon = layoutIcon(layout);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-[12px]"
          aria-label="Change terminal layout"
        >
          <LayoutIcon className="h-3.5 w-3.5" />
          {layoutLabel(layout)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {options.map((option) => {
          const Icon = layoutIcon(option);
          return (
            <DropdownMenuItem
              key={option}
              onSelect={() => onChange(option)}
              className={cn(
                "gap-2 text-[12px]",
                option === layout && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {layoutLabel(option)}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {layoutCapacity(option)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TerminalPaneProps {
  active: boolean;
  pane: TerminalPaneConfig;
  preferences: TerminalPreferences;
  onUpdate: (updates: Partial<TerminalPaneConfig>) => void;
  onFocus: () => void;
  onClose?: () => void;
  availableShells?: Array<{ label: string; command: string; args?: string[] }>;
}

function TerminalPane({
  active,
  pane,
  preferences,
  onUpdate,
  onFocus,
  onClose,
  availableShells,
}: TerminalPaneProps) {
  const configPanelId = useId();
  const [showConfig, setShowConfig] = useState(false);
  const accent = getTerminalPaneAccentDefinition(pane.accent);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-2"
      onPointerDownCapture={onFocus}
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              active ? "bg-primary" : "bg-muted-foreground/30",
            )}
          />
          <span className="truncate font-medium text-foreground/85">
            {pane.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowConfig((value) => !value)}
          className={cn(
            "rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground",
            showConfig && "bg-black/5 text-foreground",
          )}
          aria-expanded={showConfig}
          aria-controls={configPanelId}
          aria-label="Configure pane"
          title="Configure pane"
        >
          <Settings className="h-3 w-3" />
        </button>
      </div>
      {showConfig ? (
        <div
          id={configPanelId}
          className="rounded-md border border-border/60 bg-secondary/50 p-2 text-[11px]"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Label</span>
              <input
                value={pane.label}
                onChange={(event) => onUpdate({ label: event.target.value })}
                className="rounded-md border border-border/60 bg-white px-2 py-1 text-[12px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Working directory</span>
              <input
                value={pane.cwd ?? ""}
                placeholder="Defaults to home"
                onChange={(event) =>
                  onUpdate({
                    cwd:
                      event.target.value.trim().length === 0
                        ? undefined
                        : event.target.value,
                  })
                }
                className="rounded-md border border-border/60 bg-white px-2 py-1 text-[12px] font-mono"
              />
            </label>
            <label className="col-span-full flex flex-col gap-1">
              <span className="text-muted-foreground">Command</span>
              <input
                value={pane.command ?? ""}
                placeholder="Defaults to login shell"
                onChange={(event) => {
                  const value = event.target.value.trim();
                  onUpdate({
                    command: value.length === 0 ? undefined : value,
                  });
                }}
                className="rounded-md border border-border/60 bg-white px-2 py-1 text-[12px] font-mono"
              />
            </label>
            <div className="col-span-full flex flex-col gap-1">
              <span className="text-muted-foreground">Accent</span>
              <div className="flex flex-wrap gap-1.5">
                {TERMINAL_PANE_ACCENTS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onUpdate({ accent: option.key })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors",
                      pane.accent === option.key
                        ? `${option.panelClassName} ${option.headerClassName}`
                        : "border-border/60 bg-white text-foreground/75 hover:bg-secondary",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", option.dotClassName)} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-full flex flex-col gap-1">
              <span className="text-muted-foreground">Theme</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdate({ theme: undefined })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors",
                    !pane.theme
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-white text-foreground/75 hover:bg-secondary",
                  )}
                >
                  Global
                </button>
                {TERMINAL_THEMES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onUpdate({ theme: option.key })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors",
                      pane.theme === option.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-white text-foreground/75 hover:bg-secondary",
                    )}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full border border-black/10"
                      style={{ backgroundColor: option.colors.background }}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {availableShells && availableShells.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Quick launch
              </span>
              {availableShells.map((shell) => (
                <button
                  key={shell.label}
                  type="button"
                  onClick={() =>
                    onUpdate({
                      command: shell.command,
                      args: shell.args,
                      label: shell.label,
                    })
                  }
                  className="rounded-full border border-border/60 bg-white px-2 py-0.5 text-[10px] font-medium text-foreground/80 hover:bg-secondary"
                >
                  {shell.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 min-w-0">
        <EmbeddedTerminal
          active={active}
          accent={accent}
          cwd={pane.cwd}
          command={pane.command}
          args={pane.args}
          env={pane.env}
          label={pane.label}
          preferences={preferences}
          themeOverride={pane.theme}
          onClose={onClose}
          onFocusRequest={onFocus}
        />
      </div>
    </div>
  );
}
