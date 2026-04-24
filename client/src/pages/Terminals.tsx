import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  ExternalLink,
  Paintbrush,
  PlusSquare,
  Play,
  TerminalSquare,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import OpenInCodeButton from "@/components/coding-tool/OpenInCodeButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCodingTool } from "@/hooks/use-coding-tool";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { toast } from "@/hooks/use-toast";
import {
  createDefaultPane,
  TerminalGrid,
  defaultLayoutForSaved,
  layoutCapacity,
  type TerminalLayout,
  type TerminalPaneConfig,
} from "@/components/terminal/TerminalGrid";
import {
  DEV_SESSIONS_STORAGE_KEY,
  buildTerminalsPath,
  normalizeDevSessions,
  sortDevSessions,
  type DevSession,
} from "@/lib/dev-sessions";
import {
  GLOBAL_TERMINAL_WORKSPACE_SCOPE,
  buildTerminalLayoutStorageKey,
  buildTerminalPanesStorageKey,
  buildTerminalWorkspaceScopeKey,
  getExpandedTerminalLayout,
} from "@/lib/terminal-workspace";
import { navigateInApp } from "@/lib/app-navigation";
import { useAppPreferences } from "@/lib/app-preferences";
import { getDesktopApi } from "@/lib/desktop";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import {
  TERMINAL_FONT_FAMILIES,
  TERMINAL_THEMES,
  clampFontSize,
  clampScrollback,
} from "@/lib/terminal-theme";
import type {
  TerminalCursorStyle,
  TerminalFontFamilyKey,
  TerminalThemeName,
} from "@/lib/app-preferences";
import type { PtyAvailability } from "@shared/terminals";
const DEFAULT_QUICK_SHELLS: Array<{
  label: string;
  command: string;
  args?: string[];
}> = [
  { label: "OpenCode", command: "opencode", args: ["."] },
  { label: "Claude", command: "claude" },
  { label: "zsh", command: "/bin/zsh", args: ["-l"] },
  { label: "bash", command: "/bin/bash", args: ["-l"] },
];

function buildInitialPanes(options: {
  defaultCwd?: string;
  preferredTool: "opencode" | "vscode";
  selectedSession: DevSession | null;
  shouldStartInOpenCode: boolean;
}): TerminalPaneConfig[] {
  const pane = createDefaultPane(0, options.defaultCwd);

  if (options.selectedSession) {
    pane.label = options.selectedSession.label;
    pane.cwd = options.selectedSession.localPath;
  }

  if (options.shouldStartInOpenCode) {
    pane.label = "OpenCode";
    pane.command = "opencode";
    pane.args = ["."];
  }

  if (!pane.cwd && options.defaultCwd) {
    pane.cwd = options.defaultCwd;
  }

  if (!pane.label || pane.label === "Shell 1") {
    pane.label =
      options.preferredTool === "opencode" && options.shouldStartInOpenCode
        ? "OpenCode"
        : "Shell";
  }

  return [pane];
}

export default function Terminals() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { preferences, setPreference } = useAppPreferences();
  const { availability: codingToolAvailability, preferredTool } = useCodingTool();
  const { data: snapshot } = useWorkspaceSnapshot();
  const desktopApi = getDesktopApi();
  const [ptyAvailability, setPtyAvailability] = useState<PtyAvailability | null>(null);
  const [sessions] = usePersistentState<DevSession[]>(DEV_SESSIONS_STORAGE_KEY, [], {
    deserialize: (value) => normalizeDevSessions(JSON.parse(value)),
  });
  const terminalPreferences = preferences.terminal;
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedSessionId = searchParams.get("session");
  const activeSessions = useMemo(
    () => sortDevSessions(sessions).filter((session) => session.status === "active"),
    [sessions],
  );
  const selectedSession =
    activeSessions.find((session) => session.id === requestedSessionId) ?? null;
  const linkedPullRequest = selectedSession?.linkedPullRequestId
    ? snapshot?.pullRequests.find(
        (pullRequest) => pullRequest.id === selectedSession.linkedPullRequestId,
      ) ?? null
    : null;
  const sessionMissing = Boolean(requestedSessionId && !selectedSession);
  const storageScopeKey = buildTerminalWorkspaceScopeKey(selectedSession?.id);

  useEffect(() => {
    if (!desktopApi?.terminal) {
      setPtyAvailability({
        available: false,
        reason:
          "Embedded terminals require the DevDeck desktop app. Run `npm run dev` with Electron to use this page.",
        platform: null,
        defaultShell: null,
        homeDir: null,
      });
      return;
    }

    void desktopApi.terminal
      .available()
      .then((value) => setPtyAvailability(value))
      .catch((error) =>
        setPtyAvailability({
          available: false,
          reason: error instanceof Error ? error.message : String(error),
          platform: null,
          defaultShell: null,
          homeDir: null,
        }),
      );
  }, [desktopApi]);

  const defaultCwd = selectedSession?.localPath ?? ptyAvailability?.homeDir ?? undefined;
  const initialPanes = useMemo(
    () =>
      buildInitialPanes({
        defaultCwd,
        preferredTool,
        selectedSession,
        shouldStartInOpenCode:
          Boolean(selectedSession) &&
          preferredTool === "opencode" &&
          codingToolAvailability.opencode.available,
      }),
    [codingToolAvailability.opencode.available, defaultCwd, preferredTool, selectedSession],
  );
  const ptyBlocked = Boolean(ptyAvailability && !ptyAvailability.available);

  const handleSessionChange = (value: string) => {
    navigateInApp(
      value === GLOBAL_TERMINAL_WORKSPACE_SCOPE ? "/terminals" : buildTerminalsPath(value),
      setLocation,
    );
  };

  const openLinkedPullRequest = async () => {
    if (!linkedPullRequest) {
      return;
    }

    if (desktopApi) {
      await desktopApi.openExternal(linkedPullRequest.url);
      return;
    }

    window.open(linkedPullRequest.url, "_blank", "noopener,noreferrer");
  };

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <TerminalSquare className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">Terminals</h1>
                <p className="text-[11px] text-muted-foreground">
                  {selectedSession
                    ? "This terminal workspace is pinned to one active session and remembers its own pane layout."
                    : "Up to four embedded PTY sessions — resize, relaunch, and personalize."}
                </p>
              </div>
            </div>

            {selectedSession ? (
              <div className="rounded-xl border border-border/60 bg-white/75 p-3 shadow-sm backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                    Session context
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      navigateInApp(
                        `/?project=${encodeURIComponent(selectedSession.projectId)}`,
                        setLocation,
                      )
                    }
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getProjectTagClassName(selectedSession.projectName)}`}
                  >
                    {selectedSession.projectName}
                  </button>
                  {linkedPullRequest ? (
                    <button
                      type="button"
                      onClick={() => void openLinkedPullRequest()}
                      className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                    >
                      PR #{linkedPullRequest.number}
                    </button>
                  ) : null}
                  <span className="rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {selectedSession.sessionBranchName}
                  </span>
                  {selectedSession.kind === "worktree" ? (
                    <span className="rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      Worktree
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <OpenInCodeButton targetPath={selectedSession.localPath} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigateInApp("/sessions", setLocation)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Back to Sessions
                  </Button>
                </div>
              </div>
            ) : null}

            {sessionMissing ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                The requested session is no longer active. Showing the shared terminal workspace instead.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {activeSessions.length > 0 ? (
              <Select
                value={selectedSession?.id ?? GLOBAL_TERMINAL_WORKSPACE_SCOPE}
                onValueChange={handleSessionChange}
              >
                <SelectTrigger className="h-9 w-[240px] bg-white text-[12px]">
                  <SelectValue placeholder="Choose session context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_TERMINAL_WORKSPACE_SCOPE}>
                    Shared terminal workspace
                  </SelectItem>
                  {activeSessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <TerminalPersonalization
              value={terminalPreferences}
              onFontSizeChange={(fontSize) =>
                setPreference("terminal", {
                  ...terminalPreferences,
                  fontSize: clampFontSize(fontSize),
                })
              }
              onFontFamilyChange={(fontFamily) =>
                setPreference("terminal", { ...terminalPreferences, fontFamily })
              }
              onThemeChange={(theme) =>
                setPreference("terminal", { ...terminalPreferences, theme })
              }
              onCursorStyleChange={(cursorStyle) =>
                setPreference("terminal", { ...terminalPreferences, cursorStyle })
              }
              onCursorBlinkChange={(cursorBlink) =>
                setPreference("terminal", { ...terminalPreferences, cursorBlink })
              }
              onScrollbackChange={(scrollback) =>
                setPreference("terminal", {
                  ...terminalPreferences,
                  scrollback: clampScrollback(scrollback),
                })
              }
            />
          </div>
        </header>

        {ptyBlocked ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Embedded terminals aren't available
              </div>
              <p className="text-[12px] leading-relaxed">
                {ptyAvailability?.reason ??
                  "The node-pty native binding couldn't be loaded."}
              </p>
              <p className="text-[11px] text-amber-900/80">
                After installing dependencies, rebuild the native module for
                Electron:
              </p>
              <pre className="rounded-md border border-amber-200 bg-white/80 p-2 font-mono text-[11px] text-amber-900">
                npm install{"\n"}npm run electron:rebuild
              </pre>
            </div>
          </div>
        ) : (
          <TerminalWorkspace
            key={storageScopeKey}
            availableShells={DEFAULT_QUICK_SHELLS}
            defaultCwd={defaultCwd}
            initialPanes={initialPanes}
            preferences={terminalPreferences}
            scopeKey={storageScopeKey}
            sessionLabel={selectedSession?.label ?? null}
          />
        )}
      </div>
    </AppLayout>
  );
}

interface TerminalWorkspaceProps {
  availableShells: Array<{ label: string; command: string; args?: string[] }>;
  defaultCwd?: string;
  initialPanes: TerminalPaneConfig[];
  preferences: import("@/lib/app-preferences").TerminalPreferences;
  scopeKey: string;
  sessionLabel: string | null;
}

function TerminalWorkspace({
  availableShells,
  defaultCwd,
  initialPanes,
  preferences,
  scopeKey,
  sessionLabel,
}: TerminalWorkspaceProps) {
  const [activePaneId, setActivePaneId] = useState<string | null>(
    initialPanes[0]?.id ?? null,
  );
  const [layout, setLayout] = usePersistentState<TerminalLayout>(
    buildTerminalLayoutStorageKey(scopeKey),
    "single",
    {
      deserialize: (value) => defaultLayoutForSaved(JSON.parse(value)),
    },
  );
  const [panes, setPanes] = usePersistentState<TerminalPaneConfig[]>(
    buildTerminalPanesStorageKey(scopeKey),
    initialPanes,
  );

  useEffect(() => {
    setActivePaneId(initialPanes[0]?.id ?? null);
  }, [scopeKey, initialPanes]);

  const replaceActivePaneWithShell = (shell: {
    label: string;
    command: string;
    args?: string[];
  }) => {
    const targetPaneId = activePaneId ?? panes[0]?.id ?? initialPanes[0]?.id ?? null;
    if (!targetPaneId) {
      return;
    }

    setPanes((currentPanes) =>
      currentPanes.map((pane) =>
        pane.id === targetPaneId
          ? {
              ...pane,
              label: shell.label,
              command: shell.command,
              args: shell.args,
              cwd: pane.cwd ?? defaultCwd,
            }
          : pane,
      ),
    );
  };

  const addPaneWithShell = (shell: {
    label: string;
    command: string;
    args?: string[];
  }) => {
    const currentCapacity = layoutCapacity(layout);
    if (layout === "grid" && panes.length >= currentCapacity) {
      toast({
        title: "Terminal grid is full",
        description: "Use an existing pane or change the layout before adding another tool.",
      });
      return;
    }

    const nextLayout = getExpandedTerminalLayout(layout);
    const nextPane = {
      ...createDefaultPane(panes.length, defaultCwd),
      label: shell.label,
      command: shell.command,
      args: shell.args,
      cwd: defaultCwd,
    } satisfies TerminalPaneConfig;

    setLayout(nextLayout);
    setPanes((currentPanes) => [...currentPanes, nextPane]);
    setActivePaneId(nextPane.id);
  };

  const headerSlot = sessionLabel ? (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        {sessionLabel}
      </div>
      <QuickShellActions
        availableShells={availableShells}
        onAddPane={addPaneWithShell}
        onReplacePane={replaceActivePaneWithShell}
      />
    </div>
  ) : (
    <QuickShellActions
      availableShells={availableShells}
      onAddPane={addPaneWithShell}
      onReplacePane={replaceActivePaneWithShell}
    />
  );

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <TerminalGrid
        layout={layout}
        onLayoutChange={setLayout}
        panes={panes}
        onPanesChange={setPanes}
        preferences={preferences}
        availableShells={availableShells}
        defaultCwd={defaultCwd}
        headerSlot={headerSlot}
        activePaneId={activePaneId}
        onActivePaneIdChange={setActivePaneId}
      />
    </div>
  );
}

interface QuickShellActionsProps {
  availableShells: Array<{ label: string; command: string; args?: string[] }>;
  onAddPane: (shell: {
    label: string;
    command: string;
    args?: string[];
  }) => void;
  onReplacePane: (shell: {
    label: string;
    command: string;
    args?: string[];
  }) => void;
}

function QuickShellActions({
  availableShells,
  onAddPane,
  onReplacePane,
}: QuickShellActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-[12px]">
            <Play className="h-3.5 w-3.5" />
            Launch in Active Pane
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {availableShells.map((shell) => (
            <DropdownMenuItem
              key={`replace-${shell.label}`}
              onSelect={() => onReplacePane(shell)}
            >
              {shell.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-[12px]">
            <PlusSquare className="h-3.5 w-3.5" />
            Split with…
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {availableShells.map((shell) => (
            <DropdownMenuItem
              key={`add-${shell.label}`}
              onSelect={() => onAddPane(shell)}
            >
              {shell.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface TerminalPersonalizationProps {
  value: import("@/lib/app-preferences").TerminalPreferences;
  onFontSizeChange: (fontSize: number) => void;
  onFontFamilyChange: (fontFamily: TerminalFontFamilyKey) => void;
  onThemeChange: (theme: TerminalThemeName) => void;
  onCursorStyleChange: (cursorStyle: TerminalCursorStyle) => void;
  onCursorBlinkChange: (cursorBlink: boolean) => void;
  onScrollbackChange: (scrollback: number) => void;
}

function TerminalPersonalization(props: TerminalPersonalizationProps) {
  const {
    value,
    onFontSizeChange,
    onFontFamilyChange,
    onThemeChange,
    onCursorStyleChange,
    onCursorBlinkChange,
    onScrollbackChange,
  } = props;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-[12px]">
          <Paintbrush className="h-3.5 w-3.5" />
          Personalize
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 text-[12px]">
        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Theme</Label>
          <Select
            value={value.theme}
            onValueChange={(next) => onThemeChange(next as TerminalThemeName)}
          >
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_THEMES.map((theme) => (
                <SelectItem key={theme.key} value={theme.key}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-black/10"
                      style={{ backgroundColor: theme.colors.background }}
                    />
                    <span>{theme.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Font family</Label>
          <Select
            value={value.fontFamily}
            onValueChange={(next) =>
              onFontFamilyChange(next as TerminalFontFamilyKey)
            }
          >
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_FAMILIES.map((font) => (
                <SelectItem key={font.key} value={font.key}>
                  <span style={{ fontFamily: font.stack }}>{font.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Font size</Label>
            <span className="text-[11px] text-muted-foreground">
              {value.fontSize}px
            </span>
          </div>
          <Slider
            min={10}
            max={22}
            step={1}
            value={[value.fontSize]}
            onValueChange={(values) => onFontSizeChange(values[0] ?? 13)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Cursor</Label>
          <div className="flex items-center gap-2">
            {(
              ["block", "bar", "underline"] as const satisfies readonly TerminalCursorStyle[]
            ).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onCursorStyleChange(style)}
                className={
                  "flex-1 rounded-md border px-2 py-1 text-[11px] font-medium capitalize " +
                  (value.cursorStyle === style
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-white text-foreground/80 hover:bg-secondary")
                }
              >
                {style}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">
              Blink cursor
            </Label>
            <Switch
              checked={value.cursorBlink}
              onCheckedChange={onCursorBlinkChange}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Scrollback</Label>
            <span className="text-[11px] text-muted-foreground">
              {value.scrollback.toLocaleString()} lines
            </span>
          </div>
          <Slider
            min={500}
            max={20_000}
            step={500}
            value={[value.scrollback]}
            onValueChange={(values) => onScrollbackChange(values[0] ?? 5000)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
