import { app, ipcMain, webContents, type WebContents } from "electron";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import type { IPty } from "node-pty";
import type {
  SpawnPtyRequest,
  SpawnPtyResult,
} from "../shared/terminals";

/**
 * PTY manager for DevDeck's embedded terminals.
 *
 * The renderer speaks to us through a small IPC surface:
 *   - devdeck:pty:spawn   → create a new PTY, returns { id }
 *   - devdeck:pty:write   → write a chunk to an existing PTY
 *   - devdeck:pty:resize  → resize cols/rows (from xterm's fit addon)
 *   - devdeck:pty:kill    → kill and dispose
 *
 * Data flows back on a single channel (devdeck:pty:data) tagged with the
 * PTY id so the renderer can demux. Exit events use devdeck:pty:exit.
 *
 * A PTY is owned by the WebContents that spawned it — when that window goes
 * away we tear down anything it still has alive so a reload or window close
 * doesn't leak processes.
 */

interface Entry {
  pty: IPty;
  webContentsId: number;
  label: string;
}

const entries = new Map<string, Entry>();
let nodePtyModule: typeof import("node-pty") | null = null;
let nodePtyLoadError: Error | null = null;
let ptySpawnProbeError: Error | null = null;

function loadNodePty() {
  if (nodePtyModule) {
    return nodePtyModule;
  }

  if (nodePtyLoadError) {
    throw nodePtyLoadError;
  }

  try {
    // Lazy require so a missing native build doesn't crash the entire
    // electron main process at boot — the rest of the app still works,
    // the terminals page just surfaces an install hint.
    nodePtyModule = require("node-pty") as typeof import("node-pty");
    return nodePtyModule;
  } catch (error) {
    const wrapped = new Error(
      `Failed to load node-pty: ${
        error instanceof Error ? error.message : String(error)
      }. Run \`npm install\` followed by \`npm run electron:rebuild\` to build the native binding for your electron version.`,
    );
    nodePtyLoadError = wrapped;
    throw wrapped;
  }
}

export function isNodePtyAvailable() {
  if (nodePtyModule) {
    return true;
  }

  try {
    loadNodePty();
    return true;
  } catch {
    return false;
  }
}

function probePtySpawnability() {
  try {
    const ptyModule = loadNodePty();
    const probeShell =
      process.platform === "win32" ? defaultShell() : "/bin/sh";
    const probeArgs = process.platform === "win32" ? [] : ["-lc", "exit 0"];
    const probe = ptyModule.spawn(probeShell, probeArgs, {
      cols: 10,
      rows: 5,
      cwd: app.getPath("home"),
      env: mergeEnv(undefined),
      name: "xterm-256color",
    });
    probe.kill();
    ptySpawnProbeError = null;
    return true;
  } catch (error) {
    ptySpawnProbeError = new Error(
      `node-pty is installed but cannot start shell processes: ${
        error instanceof Error ? error.message : String(error)
      }. Run \`npm run electron:rebuild\` and restart DevDeck.`,
    );
    return false;
  }
}

function defaultShell() {
  if (process.platform === "win32") {
    // PowerShell is the sensible default on modern Windows. Users who want
    // cmd.exe can pick it via preferences.
    return process.env.COMSPEC ?? "powershell.exe";
  }

  return process.env.SHELL ?? "/bin/zsh";
}

function defaultShellArgs(shell: string) {
  if (process.platform === "win32") {
    return [] as string[];
  }

  // Run the shell in login mode so PATH picks up nvm/fnm/mise/homebrew —
  // otherwise tools the user expects (opencode, claude, codex) won't be
  // on PATH inside the embedded terminal.
  const shellName = shell.split("/").pop() ?? shell;
  if (shellName === "bash" || shellName === "zsh") {
    return ["-l"];
  }
  return [];
}

function resolveCwd(requested: string | undefined) {
  if (requested && requested.trim().length > 0) {
    try {
      if (existsSync(requested) && statSync(requested).isDirectory()) {
        return requested;
      }
    } catch {
      // Fall back to the home directory below.
    }
  }

  return app.getPath("home");
}

function mergeEnv(extra: Record<string, string> | undefined) {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  merged.TERM = merged.TERM ?? "xterm-256color";
  merged.COLORTERM = merged.COLORTERM ?? "truecolor";
  merged.TERM_PROGRAM = "DevDeck";
  merged.TERM_PROGRAM_VERSION = app.getVersion();
  merged.LANG = merged.LANG ?? "en_US.UTF-8";

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === "string") {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function resolveLabel(label: string | undefined, shell: string) {
  if (label && label.trim().length > 0) {
    return label.trim();
  }

  const base = shell.split(/[\\/]/).pop() ?? shell;
  return base;
}

function commandExists(command: string) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function collectAvailableCommands(commands: string[]) {
  return commands.filter((command, index, currentCommands) => {
    if (currentCommands.indexOf(command) !== index) {
      return false;
    }

    return commandExists(command);
  });
}

function ensureLaunchableCommand(command: string) {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return;
  }

  const looksLikePath =
    trimmedCommand.includes("/") || trimmedCommand.includes("\\");

  if (looksLikePath) {
    if (!existsSync(trimmedCommand)) {
      throw new Error(
        `Terminal command \`${trimmedCommand}\` was not found on disk.`,
      );
    }
    return;
  }

  if (!commandExists(trimmedCommand)) {
    throw new Error(
      `Terminal command \`${trimmedCommand}\` is not available on this machine. Install it or change the pane command.`,
    );
  }
}

function disposeEntry(id: string, entry: Entry) {
  entries.delete(id);
  try {
    entry.pty.kill();
  } catch {
    // best-effort; process may already be gone.
  }
}

function sendToOwner(
  entry: Entry,
  channel: string,
  payload: unknown,
): boolean {
  const contents = webContents.fromId(entry.webContentsId);
  if (!contents || contents.isDestroyed()) {
    return false;
  }

  contents.send(channel, payload);
  return true;
}

function wireEvents(id: string, entry: Entry) {
  entry.pty.onData((chunk) => {
    if (!sendToOwner(entry, "devdeck:pty:data", { id, chunk })) {
      disposeEntry(id, entry);
    }
  });

  entry.pty.onExit(({ exitCode, signal }) => {
    sendToOwner(entry, "devdeck:pty:exit", {
      id,
      exitCode,
      signal: signal ?? null,
    });
    entries.delete(id);
  });
}

function spawnPty(sender: WebContents, request: SpawnPtyRequest): SpawnPtyResult {
  const ptyModule = loadNodePty();
  const shell = request.command && request.command.trim().length > 0
    ? request.command.trim()
    : defaultShell();
  const args = request.args ?? defaultShellArgs(shell);
  const cwd = resolveCwd(request.cwd);
  const cols = clampDimension(request.cols, 80, 40, 400);
  const rows = clampDimension(request.rows, 24, 10, 200);

  ensureLaunchableCommand(shell);

  let pty: IPty;
  try {
    pty = ptyModule.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: mergeEnv(request.env),
    });
  } catch (error) {
    throw new Error(
      `Failed to start terminal command \`${shell}\`: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const id = randomUUID();
  const entry: Entry = {
    pty,
    webContentsId: sender.id,
    label: resolveLabel(request.label, shell),
  };

  entries.set(id, entry);
  wireEvents(id, entry);

  return {
    id,
    pid: pty.pid,
    shell,
    label: entry.label,
    cwd,
  };
}

function clampDimension(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function disposeByOwner(webContentsId: number) {
  for (const [id, entry] of Array.from(entries.entries())) {
    if (entry.webContentsId === webContentsId) {
      disposeEntry(id, entry);
    }
  }
}

function disposeAll() {
  for (const [id, entry] of Array.from(entries.entries())) {
    disposeEntry(id, entry);
  }
}

export function registerPtyIpc() {
  ipcMain.handle(
    "devdeck:pty:spawn",
    async (event, request: SpawnPtyRequest): Promise<SpawnPtyResult> => {
      return spawnPty(event.sender, request ?? {});
    },
  );

  ipcMain.handle(
    "devdeck:pty:write",
    async (_event, payload: { id: string; data: string }) => {
      const entry = entries.get(payload.id);
      if (!entry) {
        return;
      }
      try {
        entry.pty.write(payload.data);
      } catch {
        // If writing fails the process is probably gone — let the exit
        // handler clean up.
      }
    },
  );

  ipcMain.handle(
    "devdeck:pty:resize",
    async (
      _event,
      payload: { id: string; cols: number; rows: number },
    ) => {
      const entry = entries.get(payload.id);
      if (!entry) {
        return;
      }
      const cols = clampDimension(payload.cols, 80, 10, 400);
      const rows = clampDimension(payload.rows, 24, 5, 200);
      try {
        entry.pty.resize(cols, rows);
      } catch {
        // ignored — likely process already gone.
      }
    },
  );

  ipcMain.handle(
    "devdeck:pty:kill",
    async (_event, payload: { id: string }) => {
      const entry = entries.get(payload.id);
      if (!entry) {
        return;
      }
      disposeEntry(payload.id, entry);
    },
  );

  ipcMain.handle("devdeck:pty:available", async () => {
    const moduleAvailable = isNodePtyAvailable();
    const spawnAvailable = moduleAvailable ? probePtySpawnability() : false;
    const defaultShellCommand = defaultShell();
    const availableCommands = collectAvailableCommands([
      "opencode",
      "claude",
      defaultShellCommand,
      "/bin/zsh",
      "/bin/bash",
    ]);

    return {
      available: moduleAvailable && spawnAvailable,
      availableCommands,
      reason: nodePtyLoadError?.message ?? ptySpawnProbeError?.message ?? null,
      platform: process.platform,
      defaultShell: defaultShellCommand,
      homeDir: os.homedir(),
    };
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("destroyed", () => {
      disposeByOwner(contents.id);
    });
  });

  app.on("before-quit", () => {
    disposeAll();
  });
}
