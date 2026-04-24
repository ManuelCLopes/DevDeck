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
  preferences: TerminalPreferences;
  onReady?: (info: { id: string; pid: number; shell: string; label: string }) => void;
  onExit?: (info: { exitCode: number; signal: number | null }) => void;
}

export interface EmbeddedTerminalHandle {
  registerContainer: (element: HTMLDivElement | null) => void;
  focus: () => void;
  restart: () => void;
  status: EmbeddedTerminalStatus;
  error: string | null;
  info: { id: string; pid: number; shell: string; label: string } | null;
}

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
  const [restartToken, setRestartToken] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
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

  // Apply preference changes to a live terminal without tearing the PTY
  // down. xterm supports mutating fontSize/fontFamily/theme on the fly.
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
      }
    });
  }, [xtermOptions]);

  const registerContainer = useCallback(
    (element: HTMLDivElement | null) => {
      containerRef.current = element;
    },
    [],
  );

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const restart = useCallback(() => {
    setRestartToken((value) => value + 1);
  }, []);

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

    let cancelled = false;
    const terminal = new Terminal(xtermOptions);
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(container);

    // VS Code-style Cmd/Ctrl+C: copy if selection exists, otherwise let
    // the terminal forward ^C to the process. Same for Cmd/Ctrl+V.
    terminal.attachCustomKeyEventHandler((event) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta || event.type !== "keydown") {
        return true;
      }

      const key = event.key.toLowerCase();
      if (key === "c" && terminal.hasSelection()) {
        const selection = terminal.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => {
            // ignored — clipboard may be blocked in some environments
          });
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
          .catch(() => {
            // ignored
          });
        return false;
      }

      return true;
    });

    try {
      fitAddon.fit();
    } catch {
      // first fit can fail if layout isn't settled — we retry via observer
    }

    let spawnedId: string | null = null;
    const pendingWrites: string[] = [];
    let dataDisposer: (() => void) | null = null;
    let exitDisposer: (() => void) | null = null;
    let xtermDisposer: { dispose(): void } | null = null;

    setStatus("starting");
    setError(null);
    setInfo(null);

    void (async () => {
      try {
        const { cols, rows } = readTerminalDimensions(terminal);
        const result = await desktopApi.terminal.spawn({
          command: options.command,
          args: options.args,
          cwd: options.cwd,
          env: options.env,
          label: options.label,
          cols,
          rows,
        });

        if (cancelled) {
          await desktopApi.terminal.kill({ id: result.id }).catch(() => undefined);
          return;
        }

        spawnedId = result.id;
        ptyIdRef.current = result.id;
        setStatus("ready");
        setInfo(result);
        onReadyRef.current?.(result);

        // Flush anything the user typed before the PTY was ready.
        if (pendingWrites.length > 0) {
          for (const chunk of pendingWrites) {
            void desktopApi.terminal.write({ id: result.id, data: chunk });
          }
          pendingWrites.length = 0;
        }

        dataDisposer = desktopApi.terminal.onData(({ id, chunk }) => {
          if (id !== result.id) {
            return;
          }
          terminal.write(chunk);
        });

        exitDisposer = desktopApi.terminal.onExit(({ id, exitCode, signal }) => {
          if (id !== result.id) {
            return;
          }
          setStatus("exited");
          setInfo(null);
          ptyIdRef.current = null;
          onExitRef.current?.({ exitCode, signal });
        });
      } catch (spawnError) {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setError(
          spawnError instanceof Error ? spawnError.message : String(spawnError),
        );
      }
    })();

    xtermDisposer = terminal.onData((data) => {
      const id = ptyIdRef.current;
      if (!id) {
        pendingWrites.push(data);
        return;
      }
      void desktopApi.terminal.write({ id, data });
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        return;
      }

      const { cols, rows } = readTerminalDimensions(terminal);
      const id = ptyIdRef.current;
      if (!id) {
        return;
      }

      void desktopApi.terminal.resize({ id, cols, rows });
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      dataDisposer?.();
      exitDisposer?.();
      xtermDisposer?.dispose();
      const id = spawnedId ?? ptyIdRef.current;
      if (id) {
        void desktopApi.terminal.kill({ id }).catch(() => undefined);
      }
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
      ptyIdRef.current = null;
    };
    // We deliberately re-run when these inputs change so the PTY respawns
    // with the new command/cwd. preference changes flow through the
    // separate mutation effect above so the shell keeps running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.cwd,
    options.command,
    options.label,
    restartToken,
    // args/env are objects and would cause thrash if included directly;
    // we key on their serialized form instead.
    options.args ? options.args.join("\u0000") : "",
    options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`).join("\u0000") : "",
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

function readTerminalDimensions(terminal: Terminal) {
  const cols = Math.max(10, terminal.cols ?? 80);
  const rows = Math.max(5, terminal.rows ?? 24);
  return { cols, rows };
}
