import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  ExternalLink,
  Paintbrush,
  PlusSquare,
  TerminalSquare,
  X,
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
  LayoutPicker,
  TerminalGrid,
  defaultLayoutForSaved,
  layoutCapacity,
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
  normalizeTerminalPanes,
  sanitizeUnavailableTerminalPanes,
} from "@/lib/terminal-workspace";
import type { TerminalLayout, TerminalPaneConfig } from "@/lib/terminal-panes";
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
];

function buildInitialPanes(options: {
  defaultCwd?: string;
  opencodeSessionId?: string | null;
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
    pane.args = buildOpenCodeSessionArgs(options.opencodeSessionId);
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

function buildOpenCodeSessionArgs(sessionId?: string | null) {
  if (sessionId) {
    return ["--session", sessionId];
  }

  return ["."];
}

export default function Terminals() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { preferences, setPreference } = useAppPreferences();
  const { availability: codingToolAvailability, preferredTool } = useCodingTool();
  const { data: snapshot } = useWorkspaceSnapshot();
  const desktopApi = getDesktopApi();
  const [ptyAvailability, setPtyAvailability] = useState<PtyAvailability | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, true>>({});
  const [sessions] = usePersistentState<DevSession[]>(DEV_SESSIONS_STORAGE_KEY, [], {
    deserialize: (value) => normalizeDevSessions(JSON.parse(value)),
  });
  const terminalPreferences = preferences.terminal;
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedSessionId = searchParams.get("session");
  const requestedLaunch = searchParams.get("launch");
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
  const [layout, setLayout] = usePersistentState<TerminalLayout>(
    buildTerminalLayoutStorageKey(storageScopeKey),
    "single",
    {
      deserialize: (value) => defaultLayoutForSaved(JSON.parse(value)),
    },
  );
  const [panes, setPanes] = usePersistentState<TerminalPaneConfig[]>(
    buildTerminalPanesStorageKey(storageScopeKey),
    initialPanesPlaceholder(),
    {
      deserialize: (value) => normalizeTerminalPanes(JSON.parse(value)),
    },
  );

  useEffect(() => {
    if (!desktopApi?.terminal) {
      setPtyAvailability({
        available: false,
        availableCommands: [],
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
          availableCommands: [],
          reason: error instanceof Error ? error.message : String(error),
          platform: null,
          defaultShell: null,
          homeDir: null,
        }),
      );
  }, [desktopApi]);

  const defaultCwd = selectedSession?.localPath ?? ptyAvailability?.homeDir ?? undefined;
  const availableShells = useMemo(
    () =>
      DEFAULT_QUICK_SHELLS.filter(
        (shell) =>
          (shell.command !== "opencode" || codingToolAvailability.opencode.available) &&
          (ptyAvailability?.availableCommands.length
            ? ptyAvailability.availableCommands.includes(shell.command)
            : true),
      ),
    [codingToolAvailability.opencode.available, ptyAvailability?.availableCommands],
  );
  const initialPanes = useMemo(
    () =>
      buildInitialPanes({
        defaultCwd,
        opencodeSessionId: selectedSession?.id,
        preferredTool,
        selectedSession,
        shouldStartInOpenCode:
          Boolean(selectedSession) &&
          preferredTool === "opencode" &&
          codingToolAvailability.opencode.available,
      }),
    [codingToolAvailability.opencode.available, defaultCwd, preferredTool, selectedSession],
  );
  const ptyAvailabilityPending = ptyAvailability === null;
  const ptyBlocked = Boolean(ptyAvailability && !ptyAvailability.available);
  const sanitizedPanes = useMemo(
    () =>
      sanitizeUnavailableTerminalPanes(
        normalizeTerminalPanes(panes).length > 0 ? normalizeTerminalPanes(panes) : initialPanes,
        {
          availableCommands: ptyAvailability?.availableCommands ?? [],
          opencodeAvailable: codingToolAvailability.opencode.available,
        },
      ),
    [
      codingToolAvailability.opencode.available,
      initialPanes,
      panes,
      ptyAvailability?.availableCommands,
    ],
  );
  const openCodeFallbackWarningKey =
    selectedSession &&
    requestedLaunch === "opencode" &&
    !codingToolAvailability.opencode.available
      ? `opencode-fallback:${selectedSession.id}`
      : null;

  useEffect(() => {
    if (sanitizedPanes.length === 0) {
      return;
    }

    setPanes((currentPanes) =>
      areTerminalPanesEqual(normalizeTerminalPanes(currentPanes), sanitizedPanes)
        ? currentPanes
        : sanitizedPanes,
    );
  }, [sanitizedPanes, setPanes]);

  const handleSessionChange = (value: string) => {
    navigateInApp(
      value === GLOBAL_TERMINAL_WORKSPACE_SCOPE
        ? "/terminals"
        : buildTerminalsPath(value, { launch: "opencode" }),
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

  const addPaneWithShell = (shell: {
    label: string;
    command: string;
    args?: string[];
  }) => {
    const currentCapacity = layoutCapacity(layout);
    if (layout === "grid" && sanitizedPanes.length >= currentCapacity) {
      toast({
        title: "Terminal grid is full",
        description: "Use an existing pane or change the layout before adding another tool.",
      });
      return;
    }

    const nextLayout = getExpandedTerminalLayout(layout);
    const nextPane: TerminalPaneConfig = {
      ...createDefaultPane(sanitizedPanes.length, defaultCwd),
      label: shell.label,
      command: shell.command,
      args: shell.args,
      cwd: defaultCwd,
    };

    setLayout(nextLayout);
    setPanes((currentPanes) => [...currentPanes, nextPane]);
  };

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <header className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
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
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:min-w-[360px] xl:justify-end">
              {activeSessions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={selectedSession?.id ?? GLOBAL_TERMINAL_WORKSPACE_SCOPE}
                    onValueChange={handleSessionChange}
                  >
                    <SelectTrigger className="h-9 w-[280px] bg-white text-[12px]">
                      <SelectValue placeholder="Choose OpenCode session" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GLOBAL_TERMINAL_WORKSPACE_SCOPE}>
                        Shared terminals workspace
                      </SelectItem>
                      {activeSessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <TerminalPersonalization
                iconOnly
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
          </div>

          {selectedSession ? (
            <div className="w-full rounded-xl border border-border/60 bg-white/75 p-4 shadow-sm backdrop-blur-md">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-medium uppercase tracking-wide text-muted-foreground">
                      OpenCode Session
                    </span>
                    <span className="font-mono text-foreground">
                      {selectedSession.id}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                    <span className="rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {selectedSession.sessionBranchName}
                    </span>
                    {selectedSession.kind === "worktree" ? (
                      <span className="rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        Review worktree
                      </span>
                    ) : null}
                    {linkedPullRequest ? (
                      <button
                        type="button"
                        onClick={() => void openLinkedPullRequest()}
                        className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                      >
                        PR #{linkedPullRequest.number}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <LayoutPicker layout={layout} onChange={setLayout} />
                  <QuickShellActions
                    availableShells={availableShells}
                    onAddPane={addPaneWithShell}
                  />
                  <OpenInCodeButton targetPath={selectedSession.localPath} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigateInApp("/sessions", setLocation)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Back to OpenCode Sessions
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {sessionMissing ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              The requested OpenCode session is no longer active. Showing the shared terminals workspace instead.
            </div>
          ) : null}

          {selectedSession &&
          requestedLaunch === "opencode" &&
          !codingToolAvailability.opencode.available &&
          openCodeFallbackWarningKey &&
          !dismissedWarnings[openCodeFallbackWarningKey] ? (
            <div className="flex w-full items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <div className="flex min-w-0 items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  OpenCode CLI is not available on this machine, so DevDeck opened a shell in this session folder instead.
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDismissedWarnings((currentWarnings) => ({
                    ...currentWarnings,
                    [openCodeFallbackWarningKey]: true,
                  }))
                }
                className="shrink-0 rounded p-1 text-amber-900/70 hover:bg-amber-100 hover:text-amber-950"
                aria-label="Dismiss warning"
                title="Dismiss warning"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </header>

        {ptyAvailabilityPending ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-lg border border-border/60 bg-white/75 px-4 py-3 text-[12px] text-muted-foreground shadow-sm">
              Checking embedded terminal support…
            </div>
          </div>
        ) : ptyBlocked ? (
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
          <div className="flex flex-1 min-h-[420px] min-w-0 flex-col">
            <TerminalWorkspace
              key={storageScopeKey}
              availableShells={availableShells}
              availableCommands={ptyAvailability?.availableCommands ?? []}
              defaultCwd={defaultCwd}
              initialPanes={initialPanes}
              layout={layout}
              opencodeAvailable={codingToolAvailability.opencode.available}
              panes={sanitizedPanes.length > 0 ? sanitizedPanes : initialPanes}
              preferences={terminalPreferences}
              requestedLaunch={requestedLaunch}
              requestedSessionId={selectedSession?.id ?? null}
              selectedSession={selectedSession}
              setLayout={setLayout}
              setPanes={setPanes}
              scopeKey={storageScopeKey}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

interface TerminalWorkspaceProps {
  availableCommands: string[];
  availableShells: Array<{ label: string; command: string; args?: string[] }>;
  defaultCwd?: string;
  initialPanes: TerminalPaneConfig[];
  layout: TerminalLayout;
  opencodeAvailable: boolean;
  panes: TerminalPaneConfig[];
  preferences: import("@/lib/app-preferences").TerminalPreferences;
  requestedLaunch: string | null;
  requestedSessionId: string | null;
  selectedSession: DevSession | null;
  setLayout: (layout: TerminalLayout) => void;
  setPanes: React.Dispatch<React.SetStateAction<TerminalPaneConfig[]>>;
  scopeKey: string;
}

function TerminalWorkspace({
  availableCommands,
  availableShells,
  defaultCwd,
  initialPanes,
  layout,
  opencodeAvailable,
  panes,
  preferences,
  requestedLaunch,
  requestedSessionId,
  selectedSession,
  setLayout,
  setPanes,
  scopeKey,
}: TerminalWorkspaceProps) {
  const appliedLaunchRef = useRef<string | null>(null);
  const [activePaneId, setActivePaneId] = useState<string | null>(
    initialPanes[0]?.id ?? null,
  );

  useEffect(() => {
    setActivePaneId(initialPanes[0]?.id ?? null);
  }, [scopeKey, initialPanes]);

  useEffect(() => {
    const launchKey =
      requestedLaunch === "opencode" && opencodeAvailable
        ? `${scopeKey}:opencode`
        : null;

    if (!launchKey) {
      appliedLaunchRef.current = null;
      return;
    }

    if (appliedLaunchRef.current === launchKey) {
      return;
    }

    appliedLaunchRef.current = launchKey;
    let nextActivePaneId: string | null = null;
    setPanes((currentPanes) => {
      const normalizedPanes = normalizeTerminalPanes(currentPanes);
      const recoveredPanes =
        normalizedPanes.length > 0 ? normalizedPanes : initialPanes;
      const targetPane =
        recoveredPanes.find((pane) => pane.id === activePaneId) ?? recoveredPanes[0];

      if (!targetPane) {
        return recoveredPanes;
      }

      nextActivePaneId = targetPane.id;

      return recoveredPanes.map((pane) =>
        pane.id === targetPane.id
          ? {
              ...pane,
              args: buildOpenCodeSessionArgs(requestedSessionId),
              command: "opencode",
              cwd: pane.cwd ?? defaultCwd,
              label: "OpenCode",
            }
          : pane,
      );
    });
    if (nextActivePaneId) {
      setActivePaneId(nextActivePaneId);
    }
  }, [
    activePaneId,
    defaultCwd,
    initialPanes,
    opencodeAvailable,
    requestedLaunch,
    requestedSessionId,
    scopeKey,
    setPanes,
  ]);

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
    const nextPane: TerminalPaneConfig = {
      ...createDefaultPane(panes.length, defaultCwd),
      label: shell.label,
      command: shell.command,
      args: shell.args,
      cwd: defaultCwd,
    };

    setLayout(nextLayout);
    setPanes((currentPanes) => [...normalizeTerminalPanes(currentPanes), nextPane]);
  };

  return (
    <div className="flex h-full min-h-[420px] min-w-0 flex-1 flex-col">
      <TerminalGrid
        layout={layout}
        onLayoutChange={setLayout}
        panes={panes}
        onPanesChange={setPanes}
        preferences={preferences}
        availableShells={availableShells}
        defaultCwd={defaultCwd}
        showLayoutPicker={!selectedSession}
        headerSlot={
          selectedSession ? null : (
            <QuickShellActions
              availableShells={availableShells}
              onAddPane={addPaneWithShell}
            />
          )
        }
        activePaneId={activePaneId}
        onActivePaneIdChange={setActivePaneId}
      />
    </div>
  );
}

function initialPanesPlaceholder() {
  return [] as TerminalPaneConfig[];
}

function areTerminalPanesEqual(
  left: TerminalPaneConfig[],
  right: TerminalPaneConfig[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((pane, index) => {
    const candidate = right[index];
    return (
      pane.id === candidate.id &&
      pane.label === candidate.label &&
      pane.command === candidate.command &&
      pane.cwd === candidate.cwd &&
      pane.accent === candidate.accent &&
      pane.theme === candidate.theme &&
      JSON.stringify(pane.args ?? []) === JSON.stringify(candidate.args ?? []) &&
      JSON.stringify(pane.env ?? {}) === JSON.stringify(candidate.env ?? {})
    );
  });
}

interface QuickShellActionsProps {
  availableShells: Array<{ label: string; command: string; args?: string[] }>;
  onAddPane: (shell: {
    label: string;
    command: string;
    args?: string[];
  }) => void;
}

function QuickShellActions({
  availableShells,
  onAddPane,
}: QuickShellActionsProps) {
  const singleShell = availableShells.length === 1 ? availableShells[0] : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {singleShell ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-[12px]"
          onClick={() => onAddPane(singleShell)}
        >
          <PlusSquare className="h-3.5 w-3.5" />
          Split Pane
        </Button>
      ) : (
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
      )}
    </div>
  );
}

interface TerminalPersonalizationProps {
  iconOnly?: boolean;
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
    iconOnly = false,
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
        <Button
          variant="outline"
          size="sm"
          className={iconOnly ? "h-9 w-9 px-0" : "gap-2 text-[12px]"}
          aria-label="Personalize terminals"
          title="Personalize terminals"
        >
          <Paintbrush className="h-3.5 w-3.5" />
          {iconOnly ? null : "Personalize"}
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
