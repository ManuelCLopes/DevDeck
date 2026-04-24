import {
  getDefaultTerminalPaneAccent,
  type TerminalPaneAccent,
  type TerminalPaneConfig,
  type TerminalLayout,
} from "@/lib/terminal-panes";

export const GLOBAL_TERMINAL_WORKSPACE_SCOPE = "__global__";
const DEFAULT_LAYOUT: TerminalLayout = "single";

export interface TerminalWorkspaceSummary {
  layout: TerminalLayout;
  paneCount: number;
  toolLabels: string[];
}

export function buildTerminalWorkspaceScopeKey(sessionId?: string | null) {
  return sessionId ? `session:${sessionId}` : GLOBAL_TERMINAL_WORKSPACE_SCOPE;
}

export function buildTerminalLayoutStorageKey(scopeKey: string) {
  return scopeKey === GLOBAL_TERMINAL_WORKSPACE_SCOPE
    ? "devdeck:terminals:layout"
    : `devdeck:terminals:layout:${scopeKey}`;
}

export function buildTerminalPanesStorageKey(scopeKey: string) {
  return scopeKey === GLOBAL_TERMINAL_WORKSPACE_SCOPE
    ? "devdeck:terminals:panes"
    : `devdeck:terminals:panes:${scopeKey}`;
}

export function getExpandedTerminalLayout(layout: TerminalLayout): TerminalLayout {
  if (layout === "single") {
    return "columns";
  }

  if (layout === "columns" || layout === "rows") {
    return "grid";
  }

  return "grid";
}

export function normalizeTerminalLayout(value: unknown): TerminalLayout {
  if (
    value === "single" ||
    value === "columns" ||
    value === "rows" ||
    value === "grid"
  ) {
    return value;
  }

  return DEFAULT_LAYOUT;
}

export function normalizeTerminalPanes(value: unknown): TerminalPaneConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === "object")
    .map((candidate, index) => ({
      id:
        typeof candidate.id === "string" && candidate.id.length > 0
          ? candidate.id
          : `pane-${index}`,
      label:
        typeof candidate.label === "string" && candidate.label.length > 0
          ? candidate.label
          : `Shell ${index + 1}`,
      command:
        typeof candidate.command === "string" && candidate.command.length > 0
          ? candidate.command
          : undefined,
      args: Array.isArray(candidate.args)
        ? candidate.args.filter((arg): arg is string => typeof arg === "string")
        : undefined,
      cwd:
        typeof candidate.cwd === "string" && candidate.cwd.length > 0
          ? candidate.cwd
          : undefined,
      env:
        candidate.env && typeof candidate.env === "object"
          ? Object.fromEntries(
              Object.entries(candidate.env).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
              ),
            )
          : undefined,
      accent: normalizeTerminalPaneAccent(candidate.accent, index),
    }));
}

function normalizeTerminalPaneAccent(
  value: unknown,
  index: number,
): TerminalPaneAccent {
  if (
    value === "slate" ||
    value === "blue" ||
    value === "emerald" ||
    value === "amber" ||
    value === "rose" ||
    value === "violet"
  ) {
    return value;
  }

  return getDefaultTerminalPaneAccent(index);
}

export function sanitizeUnavailableTerminalPanes(
  panes: TerminalPaneConfig[],
  options: { availableCommands: string[]; opencodeAvailable: boolean },
) {
  let changed = false;
  const availableCommands = new Set(
    options.availableCommands.map((command) => command.trim().toLowerCase()),
  );

  const sanitized = panes.map((pane) => {
    const command = pane.command?.trim().toLowerCase();
    const commandUnavailable =
      command === "opencode"
        ? !options.opencodeAvailable
        : command
          ? availableCommands.size > 0 &&
            !command.includes("/") &&
            !command.includes("\\") &&
            !availableCommands.has(command)
          : false;

    if (!command || !commandUnavailable) {
      return pane;
    }

    changed = true;
    return {
      ...pane,
      args: undefined,
      command: undefined,
      label:
        pane.label === "OpenCode" || pane.label === "Claude"
          ? "Shell"
          : pane.label,
    } satisfies TerminalPaneConfig;
  });

  return changed ? sanitized : panes;
}

function getPaneToolLabel(pane: TerminalPaneConfig) {
  const command = pane.command?.toLowerCase() ?? "";

  if (command.includes("opencode")) {
    return "OpenCode";
  }

  if (command.includes("claude")) {
    return "Claude";
  }

  return "Shell";
}

export function summarizeTerminalWorkspace(
  layout: TerminalLayout,
  panes: TerminalPaneConfig[],
): TerminalWorkspaceSummary {
  const toolLabels = Array.from(
    new Set(
      panes
        .map((pane) => getPaneToolLabel(pane))
        .filter((label) => label.length > 0),
    ),
  );

  return {
    layout,
    paneCount: panes.length,
    toolLabels,
  };
}

export function readStoredTerminalWorkspaceSummary(
  scopeKey: string,
): TerminalWorkspaceSummary | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawLayout = window.localStorage.getItem(buildTerminalLayoutStorageKey(scopeKey));
  const rawPanes = window.localStorage.getItem(buildTerminalPanesStorageKey(scopeKey));

  if (!rawLayout && !rawPanes) {
    return null;
  }

  let layout = DEFAULT_LAYOUT;
  let panes: TerminalPaneConfig[] = [];

  try {
    layout = rawLayout ? normalizeTerminalLayout(JSON.parse(rawLayout)) : DEFAULT_LAYOUT;
    panes = rawPanes ? normalizeTerminalPanes(JSON.parse(rawPanes)) : [];
  } catch {
    return null;
  }

  if (panes.length === 0) {
    return null;
  }

  return summarizeTerminalWorkspace(layout, panes);
}
