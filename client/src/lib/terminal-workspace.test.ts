import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTerminalLayoutStorageKey,
  buildTerminalPanesStorageKey,
  buildTerminalWorkspaceScopeKey,
  getExpandedTerminalLayout,
  normalizeTerminalPanes,
  readStoredTerminalWorkspaceSummary,
  sanitizeUnavailableTerminalPanes,
  summarizeTerminalWorkspace,
} from "@/lib/terminal-workspace";

test("buildTerminalWorkspaceScopeKey keeps a stable global scope and session scopes", () => {
  assert.equal(buildTerminalWorkspaceScopeKey(), "__global__");
  assert.equal(buildTerminalWorkspaceScopeKey("abc"), "session:abc");
});

test("storage keys stay shared for global workspace and scoped for sessions", () => {
  assert.equal(buildTerminalLayoutStorageKey("__global__"), "devdeck:terminals:layout");
  assert.equal(buildTerminalPanesStorageKey("__global__"), "devdeck:terminals:panes");
  assert.equal(
    buildTerminalLayoutStorageKey("session:123"),
    "devdeck:terminals:layout:session:123",
  );
  assert.equal(
    buildTerminalPanesStorageKey("session:123"),
    "devdeck:terminals:panes:session:123",
  );
});

test("getExpandedTerminalLayout grows from single to columns and then to grid", () => {
  assert.equal(getExpandedTerminalLayout("single"), "columns");
  assert.equal(getExpandedTerminalLayout("columns"), "grid");
  assert.equal(getExpandedTerminalLayout("rows"), "grid");
  assert.equal(getExpandedTerminalLayout("grid"), "grid");
});

test("summarizeTerminalWorkspace deduplicates tool labels", () => {
  const summary = summarizeTerminalWorkspace("grid", [
    { id: "1", label: "OpenCode", command: "opencode", args: ["."], cwd: "/tmp" },
    { id: "2", label: "Claude", command: "claude", cwd: "/tmp" },
    { id: "3", label: "Shell 3", cwd: "/tmp" },
    { id: "4", label: "Shell 4", command: "/bin/zsh", args: ["-l"], cwd: "/tmp" },
  ]);

  assert.equal(summary.layout, "grid");
  assert.equal(summary.paneCount, 4);
  assert.deepEqual(summary.toolLabels, ["OpenCode", "Claude", "Shell"]);
});

test("readStoredTerminalWorkspaceSummary reads persisted session workspaces", () => {
  const localStorage = new Map<string, string>();
  const windowStub = {
    localStorage: {
      getItem(key: string) {
        return localStorage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        localStorage.set(key, value);
      },
    },
  };

  Object.assign(globalThis, { window: windowStub });

  const scopeKey = buildTerminalWorkspaceScopeKey("session-1");
  windowStub.localStorage.setItem(
    buildTerminalLayoutStorageKey(scopeKey),
    JSON.stringify("columns"),
  );
  windowStub.localStorage.setItem(
    buildTerminalPanesStorageKey(scopeKey),
    JSON.stringify([
      { id: "1", label: "OpenCode", command: "opencode", args: ["."], cwd: "/tmp" },
      { id: "2", label: "Shell", cwd: "/tmp" },
    ]),
  );

  const summary = readStoredTerminalWorkspaceSummary(scopeKey);

  assert.deepEqual(summary, {
    layout: "columns",
    paneCount: 2,
    toolLabels: ["OpenCode", "Shell"],
  });

  delete (globalThis as { window?: unknown }).window;
});

test("sanitizeUnavailableTerminalPanes falls back from unavailable tool panes", () => {
  const sanitized = sanitizeUnavailableTerminalPanes(
    [
      {
        args: ["."],
        command: "opencode",
        cwd: "/tmp/repo",
        id: "1",
        label: "OpenCode",
        accent: "violet",
      },
      {
        command: "claude",
        cwd: "/tmp/repo",
        id: "2",
        label: "Claude",
        accent: "blue",
      },
      {
        command: "/bin/zsh",
        cwd: "/tmp/repo",
        id: "3",
        label: "Shell 3",
        accent: "amber",
      },
    ],
    { availableCommands: ["/bin/zsh"], opencodeAvailable: false },
  );

  assert.deepEqual(sanitized, [
    {
      args: undefined,
      command: undefined,
      cwd: "/tmp/repo",
      id: "1",
      label: "Shell",
      accent: "violet",
    },
    {
      command: undefined,
      cwd: "/tmp/repo",
      id: "2",
      label: "Shell",
      accent: "blue",
      args: undefined,
    },
    {
      command: "/bin/zsh",
      cwd: "/tmp/repo",
      id: "3",
      label: "Shell 3",
      accent: "amber",
    },
  ]);
});

test("normalizeTerminalPanes backfills pane accents for older saved layouts", () => {
  const panes = normalizeTerminalPanes([
    { id: "1", label: "Shell 1", cwd: "/tmp" },
    { id: "2", label: "Shell 2", cwd: "/tmp", accent: "rose", theme: "dark" },
  ]);

  assert.equal(panes[0]?.accent, "slate");
  assert.equal(panes[0]?.theme, undefined);
  assert.equal(panes[1]?.accent, "rose");
  assert.equal(panes[1]?.theme, "dark");
});
