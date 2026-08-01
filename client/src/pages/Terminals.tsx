import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  Bot,
  Maximize2,
  Minimize2,
  ExternalLink,
  Paintbrush,
  PlusSquare,
  TerminalSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Check,
  Archive,
  RefreshCw,
  Play,
  Sparkles,
  Power,
  Globe,
  FolderGit2,
  GitBranch,
  Compass,
  Code,
  Copy,
  Workflow,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import TerminalSnippetsCabinet from "@/components/terminal/TerminalSnippetsCabinet";
import OpenInCodeButton from "@/components/coding-tool/OpenInCodeButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useAgentHarness } from "@/hooks/use-agent-harness";
import { useAgentRunsState } from "@/hooks/use-agent-telemetry";
import { useOpenCodeSessions } from "@/hooks/use-opencode-sessions";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { toast } from "@/hooks/use-toast";
import {
  createDefaultPane,
  LayoutPicker,
  TerminalGrid,
  type TerminalPaneRuntimeState,
  defaultLayoutForSaved,
  layoutCapacity,
} from "@/components/terminal/TerminalGrid";
import {
  buildTerminalsPath,
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
import {
  buildAgentLaunchTaskTemplates,
  parseLaunchTokenBudget,
  recommendAgentForLaunch,
} from "@/lib/agent-launch";
import {
  buildAgentLaunchSummary,
  buildAgentRunEnvironment,
  createAgentRunId,
  DEFAULT_AGENT_RUN_HISTORY_LIMIT,
  normalizeAgentRuns,
  sortAgentRuns,
} from "@/lib/agent-runs";
import { buildAgentRunTracePath } from "@/lib/task-trace";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import { cn } from "@/lib/utils";
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
import type { OpenCodeSessionView } from "@/hooks/use-opencode-sessions";
import type {
  AgentDefinition,
  AgentRun,
  WorkflowDefinition,
} from "@shared/agents";
import type { PtyAvailability } from "@shared/terminals";
import type { WorkspaceProject } from "@shared/workspace";
const DEFAULT_QUICK_SHELLS: Array<{
  label: string;
  command: string;
  args?: string[];
}> = [
  { label: "OpenCode", command: "opencode", args: ["."] },
  { label: "Claude", command: "claude" },
  { label: "zsh", command: "/bin/zsh", args: ["-l"] },
];
const DEVDECK_OPENCODE_SESSION_ID_ENV = "DEVDECK_OPENCODE_SESSION_ID";
const DEVDECK_AGENT_LAUNCH_SUMMARY_ENV = "DEVDECK_AGENT_LAUNCH_SUMMARY";
const ARCHIVED_OPENCODE_SESSIONS_STORAGE_KEY = "devdeck:archived-opencode-session-ids";

function buildInitialPanes(options: {
  defaultCwd?: string;
  opencodeSessionId?: string | null;
  preferredTool: "opencode" | "vscode";
  selectedSession: OpenCodeSessionView | null;
  shouldStartInOpenCode: boolean;
}): TerminalPaneConfig[] {
  const pane = createDefaultPane(0, options.defaultCwd);

  if (options.selectedSession) {
    pane.label = options.selectedSession.title;
    pane.cwd = options.selectedSession.projectPath ?? options.defaultCwd;
  }

  if (options.shouldStartInOpenCode) {
    pane.label = options.selectedSession ? `OpenCode (${options.selectedSession.title})` : "OpenCode";
    pane.command = "opencode";
    pane.args = buildOpenCodeSessionArgs(options.opencodeSessionId);
  }

  if (!pane.cwd && options.defaultCwd) {
    pane.cwd = options.defaultCwd;
  }

  if (!pane.label || pane.label === "Shell 1") {
    pane.label = options.shouldStartInOpenCode
      ? (options.selectedSession ? `OpenCode (${options.selectedSession.title})` : "OpenCode")
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

function orderAgentsForProject(
  agents: AgentDefinition[],
  project: WorkspaceProject | null,
) {
  if (!project) {
    return agents;
  }

  const exactAgents = agents.filter((agent) => agent.projectId === project.id);
  const workspaceAgents = agents.filter((agent) => agent.projectId === null);
  const fallbackAgents = agents.filter(
    (agent) => agent.projectId !== project.id && agent.projectId !== null,
  );

  return [...exactAgents, ...workspaceAgents, ...fallbackAgents];
}

function orderWorkflowsForProject(
  workflows: WorkflowDefinition[],
  project: WorkspaceProject | null,
) {
  if (!project) {
    return workflows;
  }

  const exactWorkflows = workflows.filter((workflow) => workflow.projectId === project.id);
  const workspaceWorkflows = workflows.filter((workflow) => workflow.projectId === null);
  const fallbackWorkflows = workflows.filter(
    (workflow) => workflow.projectId !== project.id && workflow.projectId !== null,
  );

  return [...exactWorkflows, ...workspaceWorkflows, ...fallbackWorkflows];
}

export default function Terminals() {
  const [location, setLocation] = useLocation();
  const routeSearch = useSearch();
  const { preferences, setPreference } = useAppPreferences();
  const { availability: codingToolAvailability, preferredTool, isLoading: codingToolLoading } = useCodingTool();
  const { isLoading: opencodeSessionsLoading, sessions: opencodeSessions, refresh: refreshSessions } =
    useOpenCodeSessions();
  const { data: agentHarness } = useAgentHarness();
  const { data: snapshot } = useWorkspaceSnapshot();
  const desktopApi = getDesktopApi();
  const [ptyAvailability, setPtyAvailability] = useState<PtyAvailability | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, true>>({});
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [paneRuntimeStates, setPaneRuntimeStates] = useState<
    Record<string, TerminalPaneRuntimeState>
  >({});
  const [pendingLayoutChange, setPendingLayoutChange] = useState<{
    nextLayout: TerminalLayout;
    panes: Array<{ id: string; label: string }>;
  } | null>(null);
  const [archivedSessionIds, setArchivedSessionIds] = usePersistentState<string[]>(
    ARCHIVED_OPENCODE_SESSIONS_STORAGE_KEY,
    [],
  );
  const [sidebarOpen, setSidebarOpen] = usePersistentState<boolean>(
    "devdeck:terminals:sidebar-open",
    true,
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [selectedRepoForLaunch, setSelectedRepoForLaunch] = useState<WorkspaceProject | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("none");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("none");
  const [launchTaskTitle, setLaunchTaskTitle] = useState("");
  const [launchTokenBudget, setLaunchTokenBudget] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [, setAgentRuns] = useAgentRunsState();

  const terminalPreferences = preferences.terminal;
  const search = useMemo(() => {
    const hashSearch = window.location.hash.includes("?")
      ? window.location.hash.split("?").slice(1).join("?")
      : "";
    const windowSearch = window.location.search.replace(/^\?/, "");
    return hashSearch || routeSearch || windowSearch;
  }, [location, routeSearch]);
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedProjectId = searchParams.get("project");
  const requestedSessionId = searchParams.get("session");
  const requestedLaunch = searchParams.get("launch");
  const archivedSessionIdSet = useMemo(
    () => new Set(archivedSessionIds),
    [archivedSessionIds],
  );
  const activeSessions = useMemo(
    () => opencodeSessions.filter((session) => !archivedSessionIdSet.has(session.id)),
    [archivedSessionIdSet, opencodeSessions],
  );
  const selectedSession =
    opencodeSessions.find((session) => session.id === requestedSessionId) ?? null;
  const trackedProjects = snapshot?.projects ?? [];
  const launchAgents = useMemo(
    () => orderAgentsForProject(agentHarness?.agents ?? [], selectedRepoForLaunch),
    [agentHarness?.agents, selectedRepoForLaunch],
  );
  const launchWorkflows = useMemo(
    () =>
      orderWorkflowsForProject(
        agentHarness?.workflows ?? [],
        selectedRepoForLaunch,
      ),
    [agentHarness?.workflows, selectedRepoForLaunch],
  );
  const selectedAgent =
    launchAgents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedWorkflow =
    launchWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;
  const recommendedAgent = useMemo(
    () =>
      recommendAgentForLaunch(launchAgents, {
        project: selectedRepoForLaunch
          ? {
              id: selectedRepoForLaunch.id,
              name: selectedRepoForLaunch.name,
            }
          : null,
        taskTitle: launchTaskTitle,
        workflow: selectedWorkflow,
      }),
    [
      launchAgents,
      launchTaskTitle,
      selectedRepoForLaunch?.id,
      selectedRepoForLaunch?.name,
      selectedWorkflow,
    ],
  );
  const resolvedLaunchTokenBudget =
    parseLaunchTokenBudget(launchTokenBudget) ?? selectedAgent?.tokenBudget ?? null;
  const selectedAgentIsRecommended = Boolean(
    selectedAgent && recommendedAgent.agent?.id === selectedAgent.id,
  );
  const agentRecommendationText = selectedAgentIsRecommended
    ? recommendedAgent.reason
    : recommendedAgent.agent
      ? `Recommended: ${recommendedAgent.agent.name}. ${recommendedAgent.reason}`
      : recommendedAgent.reason;
  const launchTaskTemplates = useMemo(
    () =>
      selectedRepoForLaunch
        ? buildAgentLaunchTaskTemplates({
            agent: selectedAgent,
            projectName: selectedRepoForLaunch.name,
            workflow: selectedWorkflow,
          })
        : [],
    [selectedAgent, selectedRepoForLaunch, selectedWorkflow],
  );
  const requestedProject =
    trackedProjects.find((project) => project.id === requestedProjectId) ?? null;
  const isRepositoryLaunchRequest =
    requestedLaunch === "opencode" && Boolean(requestedProject);
  const sessionMissing = Boolean(
    requestedSessionId && !selectedSession && !opencodeSessionsLoading,
  );
  const storageScopeKey = GLOBAL_TERMINAL_WORKSPACE_SCOPE;
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

  const copyCommandToClipboard = async (command: string) => {
    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(command);
    } else {
      await navigator.clipboard.writeText(command);
    }
    toast({
      title: "Command copied!",
      description: "Paste it in your system terminal to install OpenCode.",
    });
  };

  const handleArchiveSession = (sessionId: string) => {
    setArchivedSessionIds((current) => [...current, sessionId]);
    if (requestedSessionId === sessionId) {
      handleSessionChange(GLOBAL_TERMINAL_WORKSPACE_SCOPE);
    }
    toast({
      title: "Session archived",
      description: "You can restore sessions from the system settings if needed.",
    });
  };

  const handleRename = async (sessionId: string) => {
    const title = editingSessionTitle.trim();
    if (!title) {
      toast({
        title: "Rename failed",
        description: "Session title cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    try {
      await desktopApi?.renameOpenCodeSession(sessionId, title);
      toast({
        title: "Session renamed",
        description: `Successfully renamed to "${title}"`,
      });
      setEditingSessionId(null);
      void refreshSessions();
    } catch (e) {
      toast({
        title: "Rename failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRelaunch = (session: OpenCodeSessionView) => {
    handleSessionChange(session.id);
    toast({
      title: "Relaunching context",
      description: `Switching to session ${session.title}`,
    });
  };

  useEffect(() => {
    if (!selectedRepoForLaunch) {
      return;
    }

    if (launchAgents.length === 0) {
      if (selectedAgentId !== "none") {
        setSelectedAgentId("none");
      }
      return;
    }

    if (!launchAgents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(recommendedAgent.agent?.id ?? launchAgents[0]?.id ?? "none");
    }
  }, [launchAgents, recommendedAgent.agent?.id, selectedAgentId, selectedRepoForLaunch]);

  useEffect(() => {
    if (!selectedRepoForLaunch) {
      return;
    }

    if (launchWorkflows.length === 0) {
      if (selectedWorkflowId !== "none") {
        setSelectedWorkflowId("none");
      }
      return;
    }

    if (!launchWorkflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(launchWorkflows[0]?.id ?? "none");
    }
  }, [launchWorkflows, selectedRepoForLaunch, selectedWorkflowId]);

  useEffect(() => {
    if (requestedLaunch !== "opencode" || !requestedProject) {
      return;
    }

    if (selectedRepoForLaunch?.id === requestedProject.id) {
      return;
    }

    setSelectedRepoForLaunch(requestedProject);
    setNewBranchName(`feature/opencode-${Math.random().toString(36).substring(2, 6)}`);
    setBaseRef(requestedProject.defaultBranch || "main");
    setSelectedAgentId("none");
    setSelectedWorkflowId("none");
    setLaunchTaskTitle("");
    setLaunchTokenBudget("");
  }, [requestedLaunch, requestedProject, selectedRepoForLaunch?.id]);

  useEffect(() => {
    if (!selectedRepoForLaunch) {
      return;
    }

    setLaunchTokenBudget(
      selectedAgent?.tokenBudget ? String(selectedAgent.tokenBudget) : "",
    );
  }, [selectedAgent?.id, selectedAgent?.tokenBudget, selectedRepoForLaunch]);

  const clearSelectedLaunchRepository = useCallback(() => {
    setSelectedRepoForLaunch(null);
    setNewBranchName("");
    setBaseRef("");
    setSelectedAgentId("none");
    setSelectedWorkflowId("none");
    setLaunchTaskTitle("");
    setLaunchTokenBudget("");

    if (requestedLaunch === "opencode" && requestedProjectId) {
      navigateInApp("/terminals", setLocation);
    }
  }, [requestedLaunch, requestedProjectId, setLocation]);

  const handleWorkflowSelection = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);

    const workflow = launchWorkflows.find((candidate) => candidate.id === workflowId);
    const workflowAgentId = workflow?.steps
      .map((step) => step.agentId)
      .find(
        (agentId): agentId is string =>
          Boolean(agentId) && launchAgents.some((agent) => agent.id === agentId),
      );

    if (workflowAgentId) {
      setSelectedAgentId(workflowAgentId);
    }
  };

  const handleLaunchSession = async () => {
    if (!selectedRepoForLaunch || !desktopApi?.createGitWorktreeSession) return;
    
    const branchToUse = newBranchName.trim() || `opencode-dev-${Math.random().toString(36).substring(2, 7)}`;
    const baseToUse = baseRef || selectedRepoForLaunch.defaultBranch || "HEAD";
    const agentForRun = selectedAgentId === "none" ? null : selectedAgent;
    const workflowForRun =
      selectedWorkflowId === "none" ? null : selectedWorkflow;
    const taskTitle =
      launchTaskTitle.trim() ||
      `${agentForRun?.name ?? "OpenCode"} on ${branchToUse}`;
    const tokenBudgetForRun =
      parseLaunchTokenBudget(launchTokenBudget) ?? agentForRun?.tokenBudget ?? null;
    
    setIsCreatingSession(true);
    try {
      toast({
        title: "Creating worktree...",
        description: `Spawning session for branch ${branchToUse} off ${baseToUse}`,
      });
      
      const result = await desktopApi.createGitWorktreeSession({
        repositoryPath: selectedRepoForLaunch.localPath,
        branchName: branchToUse,
        baseRef: baseToUse,
      });

      toast({
        title: "Worktree created!",
        description: `Staging OpenCode terminal shell at ${result.branchName}`,
      });

      const runId = createAgentRunId();
      const basePane = createDefaultPane(panes.length, result.localPath);
      const agentRun: AgentRun = {
        agentId: agentForRun?.id ?? null,
        branchName: result.branchName,
        endedAt: null,
        id: runId,
        opencodeSessionId: null,
        projectId: selectedRepoForLaunch.id,
        startedAt: new Date().toISOString(),
        status: "active",
        taskTitle,
        terminalPaneId: basePane.id,
        tokenBudget: tokenBudgetForRun,
        workflowRunId: workflowForRun?.id ?? null,
        worktreePath: result.localPath,
      };
      const tracePath = buildAgentRunTracePath(result.localPath, runId);
      const launchSummary = buildAgentLaunchSummary({
        agent: agentForRun,
        agentRunId: runId,
        branchName: result.branchName,
        projectName: selectedRepoForLaunch.name,
        taskTitle,
        tracePath,
        tokenBudget: tokenBudgetForRun,
        workflow: workflowForRun,
      });

      clearSelectedLaunchRepository();

      const newPane: TerminalPaneConfig = {
        ...basePane,
        label: agentForRun
          ? `OpenCode (${agentForRun.name})`
          : `OpenCode (${result.branchName})`,
        command: "opencode",
        args: ["."],
        cwd: result.localPath,
        env: {
          ...buildAgentRunEnvironment({
            agent: agentForRun,
            run: agentRun,
            tracePath,
            workflow: workflowForRun,
          }),
          [DEVDECK_AGENT_LAUNCH_SUMMARY_ENV]: launchSummary,
        },
      };

      setAgentRuns((currentRuns) =>
        sortAgentRuns([...normalizeAgentRuns(currentRuns), agentRun]).slice(
          0,
          DEFAULT_AGENT_RUN_HISTORY_LIMIT,
        ),
      );
      setPanes((currentPanes) => [...normalizeTerminalPanes(currentPanes), newPane]);
      setActivePaneId(newPane.id);
      setLayout("single");

      setTimeout(() => {
        if (refreshSessions) {
          void refreshSessions();
        }
      }, 2500);

      toast({
        title: "Agent run started",
        description: `${taskTitle} is linked to ${agentForRun?.name ?? "an unassigned OpenCode run"}.`,
      });

    } catch (e) {
      toast({
        title: "Workspace creation failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setIsCreatingSession(false);
    }
  };

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

  const defaultCwd =
    selectedSession?.projectPath ??
    requestedProject?.localPath ??
    ptyAvailability?.homeDir ??
    undefined;
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
      isRepositoryLaunchRequest
        ? []
        : buildInitialPanes({
            defaultCwd,
            opencodeSessionId: selectedSession?.id,
            preferredTool,
            selectedSession,
            shouldStartInOpenCode:
              Boolean(selectedSession) &&
              (preferredTool === "opencode" || requestedLaunch === "opencode") &&
              codingToolAvailability.opencode.available,
          }),
    [
      codingToolAvailability.opencode.available,
      defaultCwd,
      isRepositoryLaunchRequest,
      preferredTool,
      requestedLaunch,
      selectedSession,
    ],
  );

  useEffect(() => {
    setActivePaneId((currentId) => currentId ?? initialPanes[0]?.id ?? null);
  }, [storageScopeKey, initialPanes]);

  const ptyAvailabilityPending = ptyAvailability === null;
  const ptyBlocked = Boolean(ptyAvailability && !ptyAvailability.available);
  const shouldShowRepositoryLauncher =
    selectedSession === null && Boolean(selectedRepoForLaunch);
  const sanitizedPanes = useMemo(() => {
    if (ptyAvailabilityPending || codingToolLoading) {
      return normalizeTerminalPanes(panes).length > 0 ? normalizeTerminalPanes(panes) : initialPanes;
    }

    return sanitizeUnavailableTerminalPanes(
      normalizeTerminalPanes(panes).length > 0 ? normalizeTerminalPanes(panes) : initialPanes,
      {
        availableCommands: ptyAvailability?.availableCommands ?? [],
        opencodeAvailable: codingToolAvailability.opencode.available,
      },
    );
  }, [
    ptyAvailabilityPending,
    codingToolLoading,
    codingToolAvailability.opencode.available,
    initialPanes,
    panes,
    ptyAvailability?.availableCommands,
  ]);

  const isSessionRunningInAnyPane = useCallback(
    (sessionId: string) => {
      return sanitizedPanes.some(
        (pane) =>
          pane.command === "opencode" &&
          (pane.args?.includes(sessionId) ||
            pane.env?.[DEVDECK_OPENCODE_SESSION_ID_ENV] === sessionId),
      );
    },
    [sanitizedPanes],
  );
  const openCodeFallbackWarningKey =
    selectedSession &&
    requestedLaunch === "opencode" &&
    !codingToolAvailability.opencode.available
      ? `opencode-fallback:${selectedSession.id}`
      : null;

  useEffect(() => {
    if (!isFocusMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsFocusMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocusMode]);

  useEffect(() => {
    setPaneRuntimeStates({});
  }, [storageScopeKey]);



  const handleSessionChange = (value: string) => {
    navigateInApp(
      value === GLOBAL_TERMINAL_WORKSPACE_SCOPE
        ? "/terminals"
        : buildTerminalsPath(value, { launch: "opencode" }),
      setLocation,
    );
  };

  const addPaneWithShell = (shell: {
    label: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }) => {
    if (shell.command === "opencode" && selectedSession) {
      shell = {
        ...shell,
        label: `OpenCode (${selectedSession.title})`,
        args: buildOpenCodeSessionArgs(selectedSession.id),
        env: {
          [DEVDECK_OPENCODE_SESSION_ID_ENV]: selectedSession.id,
        },
      };
    }

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
      env: "env" in shell ? shell.env : undefined,
      cwd: selectedSession?.projectPath ?? defaultCwd,
    };

    setLayout(nextLayout);
    setPanes((currentPanes) => [...currentPanes, nextPane]);
  };

  const handlePaneRuntimeStateChange = useCallback(
    (paneId: string, state: TerminalPaneRuntimeState) => {
      setPaneRuntimeStates((currentStates) => {
        const previousState = currentStates[paneId];
        if (areTerminalPaneRuntimeStatesEqual(previousState, state)) {
          return currentStates;
        }

        return {
          ...currentStates,
          [paneId]: state,
        };
      });
    },
    [],
  );

  const requestLayoutChange = (nextLayout: TerminalLayout) => {
    if (nextLayout === layout) {
      return;
    }

    const currentCapacity = layoutCapacity(layout);
    const nextCapacity = layoutCapacity(nextLayout);
    if (nextCapacity >= currentCapacity) {
      setLayout(nextLayout);
      return;
    }

    const currentPanes =
      normalizeTerminalPanes(sanitizedPanes).length > 0
        ? normalizeTerminalPanes(sanitizedPanes)
        : initialPanes;
    const panesAtRisk = currentPanes
      .slice(nextCapacity)
      .filter((pane) => {
        const runtime = paneRuntimeStates[pane.id];
        return runtime?.status === "ready" || runtime?.status === "starting";
      })
      .map((pane) => ({ id: pane.id, label: pane.label }));

    if (panesAtRisk.length === 0) {
      setLayout(nextLayout);
      return;
    }

    setPendingLayoutChange({ nextLayout, panes: panesAtRisk });
  };

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        {!isFocusMode ? (
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
              <LayoutPicker layout={layout} onChange={requestLayoutChange} />
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "h-9 w-9",
                  snippetsOpen && "border-primary text-primary bg-primary/5 dark:bg-primary/[0.03]"
                )}
                onClick={() => setSnippetsOpen(true)}
                title="Open Snippets Shelf"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setIsFocusMode(true)}
                aria-label="Enter terminal focus mode"
                title="Enter focus mode"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

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
        ) : null}

        {ptyAvailabilityPending && !shouldShowRepositoryLauncher ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-lg border border-border/60 bg-white/75 px-4 py-3 text-[12px] text-muted-foreground shadow-sm">
              Checking embedded terminal support…
            </div>
          </div>
        ) : ptyBlocked && !shouldShowRepositoryLauncher ? (
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
          <div className="flex flex-1 min-h-0 min-w-0 gap-4">
            {/* 1. Collapsible Sidebar */}
            {!isFocusMode && (
              <aside className={cn(
                "shrink-0 flex flex-col rounded-xl border border-black/10 dark:border-white/10 bg-white/75 dark:bg-[#1a1a1c]/75 backdrop-blur-md shadow-sm overflow-hidden transition-all duration-200",
                sidebarOpen ? "w-80" : "w-12"
              )}>
                {sidebarOpen ? (
                  <>
                    {/* Header */}
                    <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          codingToolAvailability.opencode.available 
                            ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                            : "bg-amber-500"
                        )} />
                        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">OpenCode Hub</span>
                      </div>
                      
                      {/* Refresh Button */}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          void refreshSessions();
                          toast({ title: "Refreshing sessions...", description: "Querying active OpenCode daemon." });
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {/* OpenCode Diagnostic / Installer Card */}
                      {!codingToolAvailability.opencode.available && (
                        <div className="rounded-lg border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-[11px] text-amber-900 dark:text-amber-300 space-y-3 shadow-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-[12px]">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <span>OpenCode CLI Offline</span>
                          </div>
                          <p className="leading-relaxed text-muted-foreground">
                            To enable session automation, repository worktrees, and full diagnostic tracing, make sure the OpenCode CLI is installed and running.
                          </p>
                          
                          <div className="space-y-1.5">
                            <span className="font-medium text-amber-950 dark:text-amber-200">Installation Command:</span>
                            <div className="relative group/copy">
                              <pre className="rounded bg-white/70 dark:bg-[#111]/70 border border-amber-200/50 dark:border-amber-950/50 p-2 font-mono text-[9.5px] overflow-x-auto text-amber-950 dark:text-amber-200 leading-normal select-all">
                                curl -fsSL https://opencode.ai/install.sh | sh
                              </pre>
                              <button
                                onClick={() => void copyCommandToClipboard("curl -fsSL https://opencode.ai/install.sh | sh")}
                                className="absolute right-2 top-2 p-1 rounded bg-amber-200/60 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 opacity-80 hover:opacity-100 transition-opacity"
                                title="Copy command"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sessions Inventory */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                          Active Sessions
                        </span>
                        
                        {/* Shared Terminal Workspace Link */}
                        <button
                          onClick={() => handleSessionChange(GLOBAL_TERMINAL_WORKSPACE_SCOPE)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all duration-150",
                            selectedSession === null
                              ? "bg-primary/5 border-primary/20 dark:bg-primary/10 dark:border-primary/30 text-primary font-medium shadow-xs"
                              : "bg-white/50 dark:bg-[#202022]/40 border-black/5 dark:border-white/5 text-foreground hover:bg-secondary/80"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
                            <span>Shared terminals workspace</span>
                          </div>
                        </button>

                        {/* Active Sessions List */}
                        {activeSessions.length === 0 ? (
                          <div className="py-6 text-center text-muted-foreground text-[11px] bg-secondary/20 dark:bg-secondary/5 rounded-lg border border-dashed border-border/40">
                            No active OpenCode sessions. Use the launcher grid to start one.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {activeSessions.map((session) => {
                              const isSelected = selectedSession?.id === session.id;
                              const isEditing = editingSessionId === session.id;

                              return (
                                <div
                                  key={session.id}
                                  className={cn(
                                    "group relative w-full p-2.5 rounded-lg border text-xs flex flex-col transition-all duration-150",
                                    isSelected
                                      ? "bg-primary/5 border-primary/20 dark:bg-primary/10 dark:border-primary/30 text-foreground font-medium shadow-xs"
                                      : "bg-white/50 dark:bg-[#202022]/40 border-black/5 dark:border-white/5 text-foreground/90 hover:bg-secondary/80 hover:border-black/10 dark:hover:border-white/10"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className={cn(
                                        "h-1.5 w-1.5 rounded-full shrink-0 mt-1.5",
                                        isSessionRunningInAnyPane(session.id)
                                          ? "bg-emerald-500 animate-pulse"
                                          : "bg-muted-foreground/45"
                                      )} />
                                      
                                      {isEditing ? (
                                        <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            type="text"
                                            value={editingSessionTitle}
                                            onChange={(e) => setEditingSessionTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") void handleRename(session.id);
                                              else if (e.key === "Escape") setEditingSessionId(null);
                                            }}
                                            className="h-6 w-full text-xs bg-white dark:bg-background border border-primary/30 rounded px-1.5 focus:outline-none"
                                            autoFocus
                                          />
                                          <button 
                                            onClick={() => void handleRename(session.id)}
                                            className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                          <button 
                                            onClick={() => setEditingSessionId(null)}
                                            className="p-1 text-destructive hover:bg-destructive/5 rounded"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => handleSessionChange(session.id)}
                                          className="font-medium text-left truncate hover:text-primary transition-colors flex-1"
                                        >
                                          {session.title}
                                        </button>
                                      )}
                                    </div>

                                    {!isEditing && (
                                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                                        <button
                                          onClick={() => {
                                            setEditingSessionId(session.id);
                                            setEditingSessionTitle(session.title);
                                          }}
                                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
                                          title="Rename Session"
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => handleRelaunch(session)}
                                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
                                          title="Focus Shell"
                                        >
                                          <Play className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => handleArchiveSession(session.id)}
                                          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-secondary"
                                          title="Archive Session"
                                        >
                                          <Archive className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-1 pl-3.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                                    <span className="truncate">Path: {session.projectPath ?? "Global"}</span>
                                    {session.resolvedProjectName && (
                                      <span className="inline-flex items-center gap-1 mt-0.5">
                                        <FolderGit2 className="h-2.5 w-2.5 shrink-0" />
                                        <span>{session.resolvedProjectName}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col h-full items-center py-4 justify-between">
                    {/* Top: Status & Shared Workspace */}
                    <div className="flex flex-col items-center gap-3 w-full">
                      {/* Pulse Status Dot */}
                      <div 
                        className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center bg-secondary/50 border border-black/5 dark:border-white/5 cursor-help",
                          codingToolAvailability.opencode.available ? "text-emerald-500" : "text-amber-500"
                        )}
                        title={codingToolAvailability.opencode.available ? "OpenCode Hub: Online" : "OpenCode Hub: Offline"}
                      >
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          codingToolAvailability.opencode.available 
                            ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                            : "bg-amber-500"
                        )} />
                      </div>

                      <div className="w-8 border-b border-black/5 dark:border-white/5" />

                      {/* Shared Terminal Workspace Shortcut */}
                      <button
                        onClick={() => handleSessionChange(GLOBAL_TERMINAL_WORKSPACE_SCOPE)}
                        className={cn(
                          "h-8 w-8 rounded-lg border flex items-center justify-center transition-all duration-150",
                          selectedSession === null
                            ? "bg-primary/10 border-primary/20 dark:bg-primary/20 dark:border-primary/40 text-primary"
                            : "bg-transparent border-transparent text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        )}
                        title="Shared terminals workspace"
                      >
                        <TerminalSquare className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Middle: Sessions List */}
                    <div className="flex-1 w-full my-4 overflow-y-auto py-2 flex flex-col items-center gap-2">
                      {activeSessions.map((session) => {
                        const isSelected = selectedSession?.id === session.id;
                        const isRunning = isSessionRunningInAnyPane(session.id);
                        const initials = session.title.substring(0, 2).toUpperCase();

                        return (
                          <button
                            key={session.id}
                            onClick={() => handleSessionChange(session.id)}
                            className={cn(
                              "relative h-8 w-8 rounded-full border flex items-center justify-center text-[9px] font-extrabold transition-all duration-150",
                              isSelected
                                ? "bg-primary/15 border-primary text-primary shadow-xs scale-105"
                                : "bg-white/60 dark:bg-[#202022]/60 border-black/5 dark:border-white/5 text-muted-foreground hover:bg-secondary/80 hover:text-foreground hover:scale-105"
                            )}
                            title={`${session.title}\nPath: ${session.projectPath ?? "Global"}`}
                          >
                            {initials}
                            {isRunning && (
                              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-white dark:border-[#1a1a1c] animate-pulse" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Bottom: Refresh Trigger */}
                    <div className="flex flex-col items-center w-full gap-2">
                      <div className="w-8 border-b border-black/5 dark:border-white/5" />
                      <button
                        onClick={() => {
                          void refreshSessions();
                          toast({ title: "Refreshing sessions...", description: "Querying active OpenCode daemon." });
                        }}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary/85 hover:text-foreground transition-all"
                        title="Refresh Sessions"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </aside>
            )}

            {/* Sidebar toggle tab */}
            {!isFocusMode && (
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="self-center flex h-16 w-3.5 items-center justify-center rounded-r-md border border-l-0 border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#1a1a1c]/80 hover:bg-secondary text-muted-foreground/60 transition-all shadow-sm z-10"
              >
                {sidebarOpen ? <ChevronLeft className="h-3 w-3 -ml-0.5" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}

            {/* Main Content Pane Area */}
            <div
              className={cn(
                "flex flex-1 min-h-[420px] min-w-0 flex-col",
                isFocusMode &&
                  "fixed inset-0 z-[90] min-h-0 bg-[#fbfbfb] dark:bg-[#121212] p-3 sm:p-4 lg:p-5",
              )}
            >
              {isFocusMode &&
              selectedSession === null &&
              (selectedRepoForLaunch || sanitizedPanes.length === 0) ? (
                <div className="pointer-events-none absolute right-3 top-3 z-[100] sm:right-4 sm:top-4 lg:right-5 lg:top-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="pointer-events-auto h-7 w-7 rounded-md bg-white/92 dark:bg-[#1e1e1e]/92 shadow-sm backdrop-blur-md"
                    onClick={() => setIsFocusMode(false)}
                    aria-label="Exit focus mode"
                    title="Exit focus mode"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}

              {/* Launcher empty state vs active terminal workspace */}
              {selectedSession === null &&
              (selectedRepoForLaunch || sanitizedPanes.length === 0) ? (
                <div className="flex-1 flex flex-col p-6 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-[#1b1b1c]/60 backdrop-blur-md overflow-y-auto">
                  {selectedRepoForLaunch ? (
                    <div className="max-w-xl mx-auto w-full border border-black/10 dark:border-white/10 rounded-xl bg-white/80 dark:bg-[#202022]/80 p-6 shadow-md space-y-5 animate-in fade-in zoom-in-95 duration-200 mt-10">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <FolderGit2 className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold">{selectedRepoForLaunch.name}</h3>
                            <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[320px]">{selectedRepoForLaunch.localPath}</p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={clearSelectedLaunchRepository}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-2">
                          <Label className="text-[11px] text-muted-foreground block font-medium">New Worktree Branch Name</Label>
                          <div className="relative">
                            <input
                              type="text"
                              value={newBranchName}
                              onChange={(e) => setNewBranchName(e.target.value)}
                              placeholder="e.g. feature/opencode-hub"
                              className="h-9 w-full bg-white dark:bg-background border border-black/10 dark:border-white/10 rounded-md pl-3 pr-8 focus:outline-none focus:border-primary/50 text-[12px]"
                            />
                            <GitBranch className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[11px] text-muted-foreground block font-medium">Base Ref / Branch</Label>
                          <Select value={baseRef} onValueChange={setBaseRef}>
                            <SelectTrigger className="h-9 w-full bg-white text-[12px]">
                              <SelectValue placeholder="Choose base branch" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={selectedRepoForLaunch.defaultBranch}>
                                {selectedRepoForLaunch.defaultBranch} (Default)
                              </SelectItem>
                              {selectedRepoForLaunch.currentBranch !== selectedRepoForLaunch.defaultBranch && (
                                <SelectItem value={selectedRepoForLaunch.currentBranch}>
                                  {selectedRepoForLaunch.currentBranch} (Active)
                                </SelectItem>
                              )}
                              <SelectItem value="HEAD">HEAD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-4 border-t border-black/10 dark:border-white/10 pt-4">
                        <div className="space-y-2">
                          <Label className="text-[11px] text-muted-foreground block font-medium">
                            Task Title
                          </Label>
                          <input
                            type="text"
                            value={launchTaskTitle}
                            onChange={(e) => setLaunchTaskTitle(e.target.value)}
                            placeholder="e.g. Implement agent-aware OpenCode launch"
                            className="h-9 w-full bg-white dark:bg-background border border-black/10 dark:border-white/10 rounded-md px-3 focus:outline-none focus:border-primary/50 text-[12px]"
                          />
                          {launchTaskTemplates.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {launchTaskTemplates.slice(0, 4).map((template) => (
                                <button
                                  key={template.id}
                                  type="button"
                                  onClick={() => setLaunchTaskTitle(template.title)}
                                  className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground dark:border-white/10 dark:bg-background"
                                >
                                  {template.title}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
                          <div className="space-y-2">
                            <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                              <Workflow className="h-3.5 w-3.5" />
                              Workflow
                            </Label>
                            <Select
                              value={selectedWorkflowId}
                              onValueChange={handleWorkflowSelection}
                            >
                              <SelectTrigger className="h-9 w-full bg-white text-[12px]">
                                <SelectValue placeholder="Choose workflow" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No workflow</SelectItem>
                                {launchWorkflows.map((workflow) => (
                                  <SelectItem key={workflow.id} value={workflow.id}>
                                    {workflow.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                              <Bot className="h-3.5 w-3.5" />
                              Agent
                            </Label>
                            <Select
                              value={selectedAgentId}
                              onValueChange={setSelectedAgentId}
                            >
                              <SelectTrigger className="h-9 w-full bg-white text-[12px]">
                                <SelectValue placeholder="Choose agent" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned OpenCode</SelectItem>
                                {launchAgents.map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5" />
                              Token Budget
                            </Label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={launchTokenBudget}
                              onChange={(event) => setLaunchTokenBudget(event.target.value)}
                              placeholder="Optional budget"
                              className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-[12px] outline-none transition-colors focus:border-primary/50 dark:border-white/10 dark:bg-background"
                            />
                          </div>
                        </div>

                        {selectedAgent ? (
                          <div className="border-l-2 border-primary/50 pl-3 text-[11px] leading-5 text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
                                <span className="truncate">{selectedAgent.name}</span>
                                {selectedAgentIsRecommended ? (
                                  <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                                    Recommended
                                  </span>
                                ) : null}
                              </span>
                              <span className="font-mono">
                                {resolvedLaunchTokenBudget
                                  ? `${resolvedLaunchTokenBudget.toLocaleString()} tokens`
                                  : "No token budget"}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="line-clamp-1">{agentRecommendationText}</p>
                              {!selectedAgentIsRecommended && recommendedAgent.agent ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedAgentId(recommendedAgent.agent!.id)}
                                  className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground dark:border-white/10 dark:bg-background"
                                >
                                  Use recommendation
                                </button>
                              ) : null}
                            </div>
                            {selectedAgent.responsibilities.length > 0 ? (
                              <p className="mt-1 line-clamp-2">
                                {selectedAgent.responsibilities.slice(0, 3).join(" | ")}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <div className="border-l-2 border-amber-400 pl-3 text-[11px] leading-5 text-amber-900 dark:text-amber-200">
                            No harness agent is selected. DevDeck will still track this as an unassigned OpenCode run.
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <Button 
                          variant="outline" 
                          onClick={clearSelectedLaunchRepository}
                          disabled={isCreatingSession}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => void handleLaunchSession()}
                          disabled={isCreatingSession}
                          className="gap-2 text-xs"
                        >
                          {isCreatingSession ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Launching...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              Launch OpenCode Workspace
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full py-8">
                      <div className="text-center space-y-2">
                        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                          <Sparkles className="h-5 w-5 animate-pulse" />
                        </div>
                        <h2 className="text-base font-semibold">Quick Launch OpenCode Workspace</h2>
                        <p className="text-[12px] text-muted-foreground max-w-lg mx-auto leading-relaxed">
                          Check out a new worktree branch and start a pre-scoped terminal session instantly inside any of your connected repositories.
                        </p>
                      </div>

                      {trackedProjects.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-[12px] bg-white/40 dark:bg-white/5 rounded-xl border border-dashed">
                          No connected repositories in workspace snapshot. Add folders in Settings to monitor repositories.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {trackedProjects.map((project) => (
                            <div
                              key={project.id}
                              onClick={() => {
                                setSelectedRepoForLaunch(project);
                                setNewBranchName(`feature/opencode-${Math.random().toString(36).substring(2, 6)}`);
                                setBaseRef(project.defaultBranch || "main");
                                setSelectedAgentId("none");
                                setSelectedWorkflowId("none");
                                setLaunchTaskTitle("");
                              }}
                              className="group relative p-4 rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-[#202022]/70 hover:border-primary/50 dark:hover:border-primary/50 cursor-pointer shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between h-36"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate max-w-[180px]">{project.name}</span>
                                  <span className="text-[9px] text-muted-foreground font-mono bg-secondary/50 dark:bg-[#2e2e30]/40 px-2 py-0.5 rounded">
                                    {project.language}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                  {project.description || "No description provided."}
                                </p>
                              </div>

                              <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1 font-mono">
                                  <GitBranch className="h-3 w-3 shrink-0" />
                                  {project.currentBranch}
                                </span>
                                <span className="group-hover:translate-x-1 transition-transform text-primary font-medium flex items-center gap-1">
                                  Launch Workspace &rarr;
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="text-center pt-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            addPaneWithShell(DEFAULT_QUICK_SHELLS[2]!);
                          }}
                        >
                          Or open a standard local terminal
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <TerminalWorkspace
                  key={storageScopeKey}
                  availableShells={availableShells}
                  availableCommands={ptyAvailability?.availableCommands ?? []}
                  defaultCwd={defaultCwd}
                  initialPanes={initialPanes}
                  layout={layout}
                  onLayoutRequestChange={requestLayoutChange}
                  onPaneRuntimeStateChange={handlePaneRuntimeStateChange}
                  opencodeAvailable={codingToolAvailability.opencode.available}
                  panes={sanitizedPanes.length > 0 ? sanitizedPanes : initialPanes}
                  preferences={terminalPreferences}
                  requestedLaunch={requestedLaunch}
                  requestedSessionId={selectedSession?.id ?? null}
                  selectedSession={selectedSession}
                  paneRuntimeStates={paneRuntimeStates}
                  setLayout={setLayout}
                  setPanes={setPanes}
                  scopeKey={storageScopeKey}
                  isFocusMode={isFocusMode}
                  onExitFocusMode={() => setIsFocusMode(false)}
                  activePaneId={activePaneId}
                  setActivePaneId={setActivePaneId}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <AlertDialog
        open={Boolean(pendingLayoutChange)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingLayoutChange(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close active terminal panes?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLayoutChange?.panes.length === 1
                ? `The terminal "${pendingLayoutChange.panes[0]?.label}" is still active and its context will be lost if you continue.`
                : "Some active terminal panes are still running and their contexts will be lost if you continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingLayoutChange?.panes.length ? (
            <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-[12px] text-muted-foreground">
              {pendingLayoutChange.panes.map((pane) => pane.label).join(" · ")}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep layout</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingLayoutChange) {
                  return;
                }

                setLayout(pendingLayoutChange.nextLayout);
                setPendingLayoutChange(null);
              }}
            >
              Change layout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TerminalSnippetsCabinet
        open={snippetsOpen}
        onOpenChange={setSnippetsOpen}
        activePaneId={activePaneId}
        activePaneCwd={
          (activePaneId ? paneRuntimeStates[activePaneId]?.info?.cwd : null) ??
          (panes.find((pane) => pane.id === activePaneId) ?? panes[0] ?? initialPanes[0])?.cwd ??
          defaultCwd ??
          null
        }
        paneRuntimeStates={paneRuntimeStates}
        snapshot={snapshot ?? null}
      />
    </AppLayout>
  );
}

function areTerminalPaneRuntimeStatesEqual(
  left: TerminalPaneRuntimeState | undefined,
  right: TerminalPaneRuntimeState,
) {
  if (!left) {
    return false;
  }

  return (
    left.status === right.status &&
    left.error === right.error &&
    left.label === right.label &&
    left.info?.id === right.info?.id &&
    left.info?.pid === right.info?.pid &&
    left.info?.cwd === right.info?.cwd &&
    left.info?.shell === right.info?.shell &&
    left.info?.label === right.info?.label
  );
}

interface TerminalWorkspaceProps {
  availableCommands: string[];
  availableShells: Array<{ label: string; command: string; args?: string[] }>;
  defaultCwd?: string;
  initialPanes: TerminalPaneConfig[];
  layout: TerminalLayout;
  onLayoutRequestChange: (layout: TerminalLayout) => void;
  onPaneRuntimeStateChange: (paneId: string, state: TerminalPaneRuntimeState) => void;
  opencodeAvailable: boolean;
  panes: TerminalPaneConfig[];
  paneRuntimeStates: Record<string, TerminalPaneRuntimeState>;
  preferences: import("@/lib/app-preferences").TerminalPreferences;
  requestedLaunch: string | null;
  requestedSessionId: string | null;
  selectedSession: OpenCodeSessionView | null;
  setLayout: (layout: TerminalLayout) => void;
  setPanes: React.Dispatch<React.SetStateAction<TerminalPaneConfig[]>>;
  scopeKey: string;
  isFocusMode?: boolean;
  onExitFocusMode?: () => void;
  activePaneId: string | null;
  setActivePaneId: React.Dispatch<React.SetStateAction<string | null>>;
}

function TerminalWorkspace({
  availableCommands,
  availableShells,
  defaultCwd,
  initialPanes,
  layout,
  onLayoutRequestChange,
  onPaneRuntimeStateChange,
  opencodeAvailable,
  panes,
  paneRuntimeStates,
  preferences,
  requestedLaunch,
  requestedSessionId,
  selectedSession,
  setLayout,
  setPanes,
  scopeKey,
  isFocusMode = false,
  onExitFocusMode,
  activePaneId,
  setActivePaneId,
}: TerminalWorkspaceProps) {
  const [paneSelectionSession, setPaneSelectionSession] = useState<OpenCodeSessionView | null>(null);
  const [, setLocation] = useLocation();
  const appliedLaunchSessionIdRef = useRef<string | null>(null);
  const desktopApi = getDesktopApi();

  useEffect(() => {
    if (requestedLaunch !== "opencode" || !requestedSessionId || !opencodeAvailable) {
      appliedLaunchSessionIdRef.current = null;
      return;
    }

    if (appliedLaunchSessionIdRef.current === requestedSessionId) {
      return;
    }

    // Check if there is already an active pane running this opencode session
    const existingPane = panes.find(
      (pane) =>
        pane.command === "opencode" &&
        pane.args?.includes(requestedSessionId)
    );

    if (existingPane) {
      appliedLaunchSessionIdRef.current = requestedSessionId;
      setActivePaneId(existingPane.id);
      navigateInApp(buildTerminalsPath(requestedSessionId), setLocation);
      return;
    }

    // Check if there is a "fresh" pane.
    // A pane is fresh if it is NOT running a custom tool (opencode or claude).
    const freshPane = panes.find(
      (pane) =>
        pane.command !== "opencode" &&
        pane.command !== "claude"
    );

    if (freshPane) {
      appliedLaunchSessionIdRef.current = requestedSessionId;
      setPanes((currentPanes) =>
        currentPanes.map((p) =>
          p.id === freshPane.id
            ? {
                ...p,
                label: selectedSession ? `OpenCode (${selectedSession.title})` : "OpenCode",
                command: "opencode",
                args: buildOpenCodeSessionArgs(requestedSessionId),
                cwd: selectedSession?.projectPath ?? p.cwd ?? defaultCwd,
                env: {
                  ...(p.env ?? {}),
                  [DEVDECK_OPENCODE_SESSION_ID_ENV]: requestedSessionId,
                },
              }
            : p
        )
      );
      setActivePaneId(freshPane.id);
      navigateInApp(buildTerminalsPath(requestedSessionId), setLocation);
      toast({
        title: "Session opened",
        description: `Running OpenCode in ${freshPane.label}`,
      });
      return;
    }

    // No fresh pane is available! Show the selection dialog.
    appliedLaunchSessionIdRef.current = requestedSessionId;
    if (selectedSession) {
      setPaneSelectionSession(selectedSession);
    }
  }, [
    requestedLaunch,
    requestedSessionId,
    opencodeAvailable,
    panes,
    setActivePaneId,
    setLocation,
    setPanes,
    selectedSession,
    defaultCwd,
  ]);

  const addPaneWithShell = (shell: {
    label: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }) => {
    const activePane =
      panes.find((pane) => pane.id === activePaneId) ?? panes[0] ?? initialPanes[0];
    const activePaneCwd =
      (activePaneId ? paneRuntimeStates[activePaneId]?.info?.cwd : null) ??
      activePane?.cwd ??
      defaultCwd;

    if (shell.command === "opencode") {
      if (selectedSession) {
        shell = {
          ...shell,
          label: `OpenCode (${selectedSession.title})`,
          args: buildOpenCodeSessionArgs(selectedSession.id),
          env: {
            [DEVDECK_OPENCODE_SESSION_ID_ENV]: selectedSession.id,
          },
        };
      }
    }

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
      cwd: selectedSession?.projectPath ?? activePaneCwd ?? defaultCwd,
    };

    setLayout(nextLayout);
    setPanes((currentPanes) => [...normalizeTerminalPanes(currentPanes), nextPane]);
  };

  return (
    <div className="relative flex h-full min-h-[420px] min-w-0 flex-1 flex-col">
      {isFocusMode && (
        <div className="flex items-center justify-end gap-2 pb-2.5 pr-1">
          {!selectedSession && (
            <QuickShellActions
              availableShells={availableShells}
              onAddPane={addPaneWithShell}
              tiny
            />
          )}
          <Button
            type="button"
            variant="outline"
            className="h-7 px-2.5 text-[11px] gap-1.5 rounded-md text-muted-foreground hover:text-foreground"
            onClick={onExitFocusMode}
            aria-label="Exit focus mode"
            title="Exit focus mode"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span>Exit Focus</span>
          </Button>
        </div>
      )}
      {/* HUD capsule removed to minimize redundant active indicators */}
      <TerminalGrid
        layout={layout}
        onLayoutChange={onLayoutRequestChange}
        onPaneRuntimeStateChange={onPaneRuntimeStateChange}
        panes={panes}
        onPanesChange={setPanes}
        preferences={preferences}
        availableShells={availableShells}
        defaultCwd={defaultCwd}
        showLayoutPicker={false}
        headerSlot={
          isFocusMode ? null : (
            selectedSession ? null : (
              <QuickShellActions
                availableShells={availableShells}
                onAddPane={addPaneWithShell}
              />
            )
          )
        }
        activePaneId={activePaneId}
        onActivePaneIdChange={setActivePaneId}
      />
      <AlertDialog
        open={Boolean(paneSelectionSession)}
        onOpenChange={(open) => {
          if (!open) {
            setPaneSelectionSession(null);
            if (selectedSession) {
              navigateInApp(buildTerminalsPath(selectedSession.id), setLocation);
            }
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">
              Select Terminal for OpenCode
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              All of your active terminals are currently running customized tools or busy contexts. Where would you like to launch the session <strong>"{paneSelectionSession?.title}"</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-2 py-2">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
              Active Terminals
            </span>
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {panes.map((pane) => {
                const runtime = paneRuntimeStates[pane.id];
                const activeTool = pane.command === "opencode" ? "OpenCode" : pane.command === "claude" ? "Claude" : "Shell";
                
                return (
                  <button
                    key={pane.id}
                    onClick={() => {
                      if (!paneSelectionSession) return;
                      setPanes((currentPanes) =>
                        currentPanes.map((p) =>
                          p.id === pane.id
                            ? {
                                ...p,
                                label: `OpenCode (${paneSelectionSession.title})`,
                                command: "opencode",
                                args: buildOpenCodeSessionArgs(paneSelectionSession.id),
                                cwd: paneSelectionSession.projectPath ?? p.cwd,
                                env: {
                                  ...(p.env ?? {}),
                                  [DEVDECK_OPENCODE_SESSION_ID_ENV]: paneSelectionSession.id,
                                },
                              }
                            : p
                        )
                      );
                      setActivePaneId(pane.id);
                      setPaneSelectionSession(null);
                      navigateInApp(buildTerminalsPath(paneSelectionSession.id), setLocation);
                      toast({
                        title: "Session opened",
                        description: `Running OpenCode in ${pane.label}`,
                      });
                    }}
                    className="w-full text-left p-2.5 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-secondary/80 flex items-center justify-between text-xs transition-colors"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-foreground truncate">{pane.label}</span>
                      <span className="text-[10px] text-muted-foreground truncate font-mono">
                        {pane.cwd ?? "~"} · {activeTool}
                      </span>
                    </div>
                    {runtime?.status === "ready" && (
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="pt-2 border-t border-border/50 flex flex-col gap-1.5">
              <button
                onClick={() => {
                  if (!paneSelectionSession) return;
                  
                  const currentCapacity = layoutCapacity(layout);
                  if (layout === "grid" && panes.length >= currentCapacity) {
                    toast({
                      title: "Grid is full",
                      description: "Please overwrite an existing terminal or change layout.",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  const nextLayout = getExpandedTerminalLayout(layout);
                  const nextPane: TerminalPaneConfig = {
                    ...createDefaultPane(panes.length, paneSelectionSession.projectPath ?? defaultCwd),
                    label: `OpenCode (${paneSelectionSession.title})`,
                    command: "opencode",
                    args: buildOpenCodeSessionArgs(paneSelectionSession.id),
                    cwd: paneSelectionSession.projectPath ?? defaultCwd,
                    env: {
                      [DEVDECK_OPENCODE_SESSION_ID_ENV]: paneSelectionSession.id,
                    },
                  };

                  setLayout(nextLayout);
                  setPanes((currentPanes) => [...currentPanes, nextPane]);
                  setActivePaneId(nextPane.id);
                  setPaneSelectionSession(null);
                  navigateInApp(buildTerminalsPath(paneSelectionSession.id), setLocation);
                  toast({
                    title: "Opened in new pane",
                    description: `Launched a new terminal pane for OpenCode`,
                  });
                }}
                className="w-full p-2.5 rounded-lg border border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary font-medium text-xs text-center transition-colors"
              >
                + Open in a new terminal pane
              </button>
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPaneSelectionSession(null);
                if (selectedSession) {
                  navigateInApp(buildTerminalsPath(selectedSession.id), setLocation);
                }
              }}
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  availableShells: Array<{
    label: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  onAddPane: (shell: {
    label: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }) => void;
  tiny?: boolean;
}

function QuickShellActions({
  availableShells,
  onAddPane,
  tiny = false,
}: QuickShellActionsProps) {
  const singleShell = availableShells.length === 1 ? availableShells[0] : null;

  const buttonClass = tiny
    ? "h-7 px-2.5 text-[11px] gap-1.5 rounded-md"
    : "gap-2 text-[12px]";

  const iconClass = "h-3.5 w-3.5";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {singleShell ? (
        <Button
          variant="outline"
          size={tiny ? "default" : "sm"}
          className={buttonClass}
          onClick={() => onAddPane(singleShell)}
        >
          <PlusSquare className={iconClass} />
          Split Pane
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size={tiny ? "default" : "sm"}
              className={buttonClass}
            >
              <PlusSquare className={iconClass} />
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
          size={iconOnly ? "icon" : "sm"}
          className={iconOnly ? "h-9 w-9" : "gap-2 text-[12px]"}
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
