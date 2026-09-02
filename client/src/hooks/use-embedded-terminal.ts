import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getDesktopApi } from "@/lib/desktop";
import type { TerminalPreferences } from "@/lib/app-preferences";
import { getXtermOptionsFromPreferences } from "@/lib/terminal-theme";

export type EmbeddedTerminalStatus =
  | "idle"
  | "starting"
  | "ready"
  | "exited"
  | "error";

export interface UseEmbeddedTerminalOptions {
  cwd?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  label?: string;
  persistenceKey?: string;
  preferences: TerminalPreferences;
  onReady?: (info: {
    cwd: string;
    id: string;
    pid: number;
    shell: string;
    label: string;
  }) => void;
  onExit?: (info: { exitCode: number; signal: number | null }) => void;
}

export interface EmbeddedTerminalHandle {
  registerContainer: (element: HTMLDivElement | null) => void;
  focus: () => void;
  restart: () => void;
  status: EmbeddedTerminalStatus;
  error: string | null;
  info: {
    cwd: string;
    id: string;
    pid: number;
    shell: string;
    label: string;
  } | null;
}

interface PersistentTerminalRuntime {
  error: string | null;
  info: EmbeddedTerminalHandle["info"];
  status: EmbeddedTerminalStatus;
}

interface PersistentTerminalExit {
  exitCode: number;
  signal: number | null;
}

interface TerminalDimensions {
  cols: number;
  rows: number;
}

interface PersistentTerminalSession extends PersistentTerminalRuntime {
  buffer: string;
  dataDisposer: (() => void) | null;
  /**
   * Size the pane last asked for. It is recorded even while the PTY is still
   * spawning so the real geometry can be applied the moment it exists —
   * otherwise the process would stay stuck at the fallback 80x24 and full
   * screen TUIs (opencode, claude) would draw into a small box.
   */
  dimensions: TerminalDimensions | null;
  exitDisposer: (() => void) | null;
  key: string;
  lastExit: PersistentTerminalExit | null;
  pendingWrites: string[];
  ptyId: string | null;
  signature: string;
  spawnPromise: Promise<void> | null;
  subscribers: Set<PersistentTerminalSubscriber>;
}

interface PersistentTerminalSubscriber {
  onData: (chunk: string) => void;
  onExit: (info: PersistentTerminalExit) => void;
  onRuntime: (runtime: PersistentTerminalRuntime) => void;
}

const persistedTerminalSessions = new Map<string, PersistentTerminalSession>();
const MAX_BUFFER_LENGTH = 200_000;

/**
 * Identifies what a session *runs*. Two configs with the same signature can
 * share one PTY; a change to it means the old process is no longer what the
 * pane asked for and has to be replaced. The label is deliberately excluded —
 * it is only a display name, and renaming a pane should never kill the shell
 * running inside it.
 */
function buildSessionSignature(options: UseEmbeddedTerminalOptions) {
  const envPairs = options.env
    ? Object.entries(options.env)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
    : [];

  return JSON.stringify({
    args: options.args ?? [],
    command: options.command ?? null,
    cwd: options.cwd ?? null,
    env: envPairs,
  });
}

function createPersistentSession(
  key: string,
  signature: string,
): PersistentTerminalSession {
  return {
    buffer: "",
    dataDisposer: null,
    dimensions: null,
    error: null,
    exitDisposer: null,
    info: null,
    key,
    lastExit: null,
    pendingWrites: [],
    ptyId: null,
    signature,
    spawnPromise: null,
    status: "idle",
    subscribers: new Set(),
  };
}

/**
 * Records the pane geometry and pushes it to the PTY when one is running.
 * The size is remembered even while the PTY is still spawning so it can be
 * applied as soon as the process exists.
 */
function applySessionDimensions(
  session: PersistentTerminalSession,
  dimensions: TerminalDimensions,
) {
  const changed =
    session.dimensions?.cols !== dimensions.cols ||
    session.dimensions?.rows !== dimensions.rows;

  session.dimensions = dimensions;

  const ptyId = session.ptyId;
  if (!ptyId || !changed) {
    return;
  }

  const desktopApi = getDesktopApi();
  void desktopApi?.terminal
    ?.resize({ id: ptyId, cols: dimensions.cols, rows: dimensions.rows })
    .catch(() => undefined);
}

/**
 * Asks a running process to repaint by shrinking the PTY by one row and
 * restoring it. The kernel only raises SIGWINCH when the geometry actually
 * changes, so re-sending the same size would do nothing. This is what brings
 * a full screen TUI back after the terminals page was unmounted: the replayed
 * scrollback alone leaves whatever the app last drew, and the nudge makes it
 * redraw against the current viewport.
 */
function requestSessionRepaint(session: PersistentTerminalSession) {
  const desktopApi = getDesktopApi();
  const ptyId = session.ptyId;
  const dimensions = session.dimensions;

  if (!desktopApi?.terminal || !ptyId || !dimensions || dimensions.rows <= 1) {
    return;
  }

  void desktopApi.terminal
    .resize({ id: ptyId, cols: dimensions.cols, rows: dimensions.rows - 1 })
    .then(() =>
      desktopApi.terminal.resize({
        id: ptyId,
        cols: dimensions.cols,
        rows: dimensions.rows,
      }),
    )
    .catch(() => undefined);
}

function notifyRuntime(session: PersistentTerminalSession) {
  const runtime: PersistentTerminalRuntime = {
    error: session.error,
    info: session.info,
    status: session.status,
  };

  session.subscribers.forEach((subscriber) => {
    subscriber.onRuntime(runtime);
  });
}

function appendSessionBuffer(
  session: PersistentTerminalSession,
  chunk: string,
) {
  if (!chunk) {
    return;
  }

  const nextBuffer = session.buffer + chunk;
  session.buffer =
    nextBuffer.length > MAX_BUFFER_LENGTH
      ? nextBuffer.slice(-MAX_BUFFER_LENGTH)
      : nextBuffer;
}

async function disposeSessionProcess(
  session: PersistentTerminalSession,
  options?: { preserveRuntime?: boolean; removeFromRegistry?: boolean },
) {
  const desktopApi = getDesktopApi();
  const ptyId = session.ptyId;

  session.dataDisposer?.();
  session.dataDisposer = null;
  session.exitDisposer?.();
  session.exitDisposer = null;
  session.spawnPromise = null;
  session.pendingWrites = [];
  session.ptyId = null;

  if (!options?.preserveRuntime) {
    session.status = "idle";
    session.error = null;
    session.info = null;
    session.lastExit = null;
    session.buffer = "";
    notifyRuntime(session);
  }

  if (ptyId && desktopApi?.terminal) {
    await desktopApi.terminal.kill({ id: ptyId }).catch(() => undefined);
  }

  if (options?.removeFromRegistry) {
    persistedTerminalSessions.delete(session.key);
  }
}

function getOrCreatePersistentSession(
  key: string,
  signature: string,
) {
  const existingSession = persistedTerminalSessions.get(key);
  if (!existingSession) {
    const createdSession = createPersistentSession(key, signature);
    persistedTerminalSessions.set(key, createdSession);
    return createdSession;
  }

  if (existingSession.signature !== signature) {
    void disposeSessionProcess(existingSession, { preserveRuntime: false });
    existingSession.signature = signature;
  }

  return existingSession;
}

async function writeToPersistentSession(
  session: PersistentTerminalSession,
  data: string,
) {
  const desktopApi = getDesktopApi();
  if (!desktopApi?.terminal) {
    return;
  }

  if (!session.ptyId) {
    session.pendingWrites.push(data);
    return;
  }

  await desktopApi.terminal.write({ id: session.ptyId, data }).catch(() => undefined);
}

async function spawnPersistentSession(
  session: PersistentTerminalSession,
  request: UseEmbeddedTerminalOptions,
  dimensions: TerminalDimensions | null,
) {
  const desktopApi = getDesktopApi();
  if (!desktopApi?.terminal) {
    session.status = "error";
    session.error =
      "Embedded terminals require the DevDeck desktop app with the node-pty binding built.";
    notifyRuntime(session);
    return;
  }

  if (dimensions) {
    applySessionDimensions(session, dimensions);
  }

  if (session.spawnPromise || session.ptyId) {
    return session.spawnPromise ?? Promise.resolve();
  }

  session.status = "starting";
  session.error = null;
  session.info = null;
  session.lastExit = null;
  session.buffer = "";
  notifyRuntime(session);

  session.spawnPromise = (async () => {
    try {
      const requestedDimensions = session.dimensions ?? FALLBACK_DIMENSIONS;
      const result = await desktopApi.terminal.spawn({
        command: request.command,
        args: request.args,
        cwd: request.cwd,
        env: request.env,
        label: request.label,
        cols: requestedDimensions.cols,
        rows: requestedDimensions.rows,
      });

      session.ptyId = result.id;
      session.status = "ready";
      session.info = result;
      notifyRuntime(session);

      // The pane may have been measured (or resized) while the spawn was in
      // flight — push the latest geometry now that there is a process to
      // resize.
      if (
        session.dimensions &&
        (session.dimensions.cols !== requestedDimensions.cols ||
          session.dimensions.rows !== requestedDimensions.rows)
      ) {
        await desktopApi.terminal
          .resize({
            id: result.id,
            cols: session.dimensions.cols,
            rows: session.dimensions.rows,
          })
          .catch(() => undefined);
      }

      if (session.pendingWrites.length > 0) {
        for (const chunk of session.pendingWrites) {
          await desktopApi.terminal.write({ id: result.id, data: chunk }).catch(() => undefined);
        }
        session.pendingWrites = [];
      }

      session.dataDisposer = desktopApi.terminal.onData(({ id, chunk }) => {
        if (id !== result.id) {
          return;
        }

        appendSessionBuffer(session, chunk);
        session.subscribers.forEach((subscriber) => {
          subscriber.onData(chunk);
        });
      });

      session.exitDisposer = desktopApi.terminal.onExit(({ id, exitCode, signal }) => {
        if (id !== result.id) {
          return;
        }

        session.ptyId = null;
        session.status = "exited";
        session.info = null;
        session.lastExit = { exitCode, signal: signal ?? null };
        notifyRuntime(session);

        session.subscribers.forEach((subscriber) => {
          subscriber.onExit({ exitCode, signal: signal ?? null });
        });
      });
    } catch (spawnError) {
      session.status = "error";
      session.error =
        spawnError instanceof Error ? spawnError.message : String(spawnError);
      session.info = null;
      notifyRuntime(session);
    } finally {
      session.spawnPromise = null;
    }
  })();

  return session.spawnPromise;
}

async function restartPersistentSession(
  session: PersistentTerminalSession,
  request: UseEmbeddedTerminalOptions,
) {
  const dimensions = session.dimensions;
  await disposeSessionProcess(session, { preserveRuntime: false });
  await spawnPersistentSession(session, request, dimensions);
}

const FALLBACK_DIMENSIONS: TerminalDimensions = { cols: 80, rows: 24 };

/**
 * Wires an xterm.js Terminal to a node-pty process owned by the electron
 * main. The hook owns the terminal instance and addon lifecycles — the
 * consumer just provides a container via `registerContainer`.
 */
export function useEmbeddedTerminal(
  options: UseEmbeddedTerminalOptions,
): EmbeddedTerminalHandle {
  const [status, setStatus] = useState<EmbeddedTerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<EmbeddedTerminalHandle["info"]>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionRef = useRef<PersistentTerminalSession | null>(null);
  const ephemeralSessionKeyRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `ephemeral:${crypto.randomUUID()}`
      : `ephemeral:${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const onReadyRef = useRef(options.onReady);
  const onExitRef = useRef(options.onExit);
  const xtermOptions = useMemo(
    () => getXtermOptionsFromPreferences({ preferences: options.preferences }),
    [options.preferences],
  );

  useEffect(() => {
    onReadyRef.current = options.onReady;
    onExitRef.current = options.onExit;
  }, [options.onReady, options.onExit]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.fontFamily = xtermOptions.fontFamily;
    terminal.options.fontSize = xtermOptions.fontSize;
    terminal.options.theme = xtermOptions.theme;
    terminal.options.cursorBlink = xtermOptions.cursorBlink;
    terminal.options.cursorStyle = xtermOptions.cursorStyle;
    terminal.options.scrollback = xtermOptions.scrollback;

    queueMicrotask(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignored — terminal may be detached momentarily
        return;
      }

      // A different font size means a different column/row count, so the
      // process needs to hear about it too.
      const session = sessionRef.current;
      if (session) {
        applySessionDimensions(session, readTerminalDimensions(terminal));
      }
    });
  }, [xtermOptions]);

  const registerContainer = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const restart = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    void restartPersistentSession(session, options);
  }, [options]);

  useEffect(() => {
    const desktopApi = getDesktopApi();
    const container = containerRef.current;

    if (!desktopApi?.terminal) {
      setStatus("error");
      setError(
        "Embedded terminals require the DevDeck desktop app with the node-pty binding built.",
      );
      return;
    }

    if (!container) {
      return;
    }

    const sessionKey = options.persistenceKey ?? ephemeralSessionKeyRef.current;
    const session = getOrCreatePersistentSession(
      sessionKey,
      buildSessionSignature(options),
    );
    sessionRef.current = session;

    const terminal = new Terminal(xtermOptions);
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(container);

    terminal.attachCustomKeyEventHandler((event) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta || event.type !== "keydown") {
        return true;
      }

      const key = event.key.toLowerCase();
      if (key === "c" && terminal.hasSelection()) {
        const selection = terminal.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => undefined);
          terminal.clearSelection();
          event.preventDefault();
          return false;
        }
      }

      if (key === "v") {
        event.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              terminal.paste(text);
            }
          })
          .catch(() => undefined);
        return false;
      }

      return true;
    });

    try {
      fitAddon.fit();
    } catch {
      // first fit can fail if layout isn't settled — we retry via observer
    }

    const subscriber: PersistentTerminalSubscriber = {
      onData: (chunk) => {
        terminal.write(chunk);
      },
      onExit: (exitInfo) => {
        onExitRef.current?.(exitInfo);
      },
      onRuntime: (runtime) => {
        setStatus(runtime.status);
        setError(runtime.error);
        setInfo(runtime.info);
        if (runtime.status === "ready" && runtime.info) {
          onReadyRef.current?.(runtime.info);
        }
      },
    };

    session.subscribers.add(subscriber);

    const wasAlreadyRunning = Boolean(session.ptyId);

    setStatus(session.status);
    setError(session.error);
    setInfo(session.info);
    if (session.buffer) {
      terminal.write(session.buffer);
    }

    void spawnPersistentSession(
      session,
      options,
      readTerminalDimensions(terminal),
    );

    if (wasAlreadyRunning) {
      // Re-attaching to a process that kept running while this page was
      // unmounted. The replayed scrollback restores the history; the nudge
      // makes a full screen TUI redraw its current state into the viewport.
      requestSessionRepaint(session);
    }

    const xtermDisposer = terminal.onData((data) => {
      void writeToPersistentSession(session, data);
    });

    const fitToContainer = () => {
      try {
        fitAddon.fit();
      } catch {
        return;
      }

      applySessionDimensions(session, readTerminalDimensions(terminal));
    };

    // The container is usually still settling on the first frame, so the fit
    // above can measure a collapsed box. Re-measure once layout has run.
    const initialFitFrame = requestAnimationFrame(fitToContainer);

    const resizeObserver = new ResizeObserver(fitToContainer);

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    return () => {
      cancelAnimationFrame(initialFitFrame);
      resizeObserver.disconnect();
      session.subscribers.delete(subscriber);
      xtermDisposer.dispose();
      terminal.dispose();

      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      if (fitAddonRef.current === fitAddon) {
        fitAddonRef.current = null;
      }
      if (resizeObserverRef.current === resizeObserver) {
        resizeObserverRef.current = null;
      }

      if (session.subscribers.size === 0) {
        if (!options.persistenceKey) {
          void disposeSessionProcess(session, { removeFromRegistry: true });
        }
      }
    };
    // We deliberately re-run when these inputs change so the PTY respawns
    // with the new command/cwd. Preference and label changes are excluded:
    // they flow through the mutation effect above (or affect nothing but the
    // header) so the shell keeps running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.cwd,
    options.command,
    options.persistenceKey,
    options.args ? options.args.join("\u0000") : "",
    options.env
      ? Object.entries(options.env)
          .map(([key, value]) => `${key}=${value}`)
          .join("\u0000")
      : "",
  ]);

  return {
    registerContainer,
    focus,
    restart,
    status,
    error,
    info,
  };
}

export function disposePersistentTerminalSession(persistenceKey: string) {
  const session = persistedTerminalSessions.get(persistenceKey);
  if (!session) {
    return;
  }

  void disposeSessionProcess(session, { removeFromRegistry: true });
}

function readTerminalDimensions(terminal: Terminal) {
  const cols = Math.max(10, terminal.cols ?? 80);
  const rows = Math.max(5, terminal.rows ?? 24);
  return { cols, rows };
}
