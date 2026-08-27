import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";

/**
 * `better-sqlite3` is a native, synchronous CJS module. esbuild bundles
 * this file into a CJS Electron build (script/build-electron.ts), where a
 * bare `require` call works natively — that is how electron/pty.ts loads
 * node-pty. But this same file also runs unbundled as ESM under `tsx`
 * (DevDeck's package.json sets "type": "module") for unit tests, where
 * top-level `require` does not exist. `typeof require` is safe to probe
 * on an undeclared binding in both environments (it never throws), so
 * this picks the real CJS `require` when it's there and only falls back
 * to a synthesized one — never evaluating `import.meta.url` in the
 * bundled build, where esbuild would have already zeroed it out.
 */
function resolveRequire(): NodeRequire {
  if (typeof require === "function") {
    return require;
  }
  return createRequire(import.meta.url);
}

/**
 * Narrow port around the concrete SQLite driver.
 *
 * ADR-0003 defers the final driver choice until arm64 macOS packaging,
 * signing, and notarisation are validated. `better-sqlite3` is the
 * interim selection for Phase 1 (it is synchronous, widely used in
 * Electron apps, and already proven in this repository's dev/test
 * environment) — see docs/adr/0003-sqlite-persistence.md for the
 * follow-up that still needs to happen before this is final.
 *
 * Nothing outside this file should import `better-sqlite3` directly, so
 * swapping the driver later stays a one-file change.
 */
export type SqliteConnection = BetterSqlite3.Database;

let driverModule: typeof BetterSqlite3 | null = null;
let driverLoadError: Error | null = null;

function loadDriver(): typeof BetterSqlite3 {
  if (driverModule) {
    return driverModule;
  }

  if (driverLoadError) {
    throw driverLoadError;
  }

  try {
    // Lazy require so a missing/mismatched native build doesn't crash the
    // whole Electron main process at boot — callers get a clear error at
    // the point they actually need persistence, and the rest of DevDeck
    // keeps working (mirrors electron/pty.ts's lazy load of node-pty).
    driverModule = resolveRequire()("better-sqlite3") as typeof BetterSqlite3;
    return driverModule;
  } catch (error) {
    const wrapped = new Error(
      `Failed to load better-sqlite3: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    driverLoadError = wrapped;
    throw wrapped;
  }
}

export interface OpenSqliteOptions {
  /** Path to the database file, or ":memory:" for an in-process database (tests). */
  path: string;
  /** Milliseconds to wait on a locked database before failing. Defaults to 5000. */
  busyTimeoutMs?: number;
}

/**
 * Opens a SQLite connection with the pragmas recommended in
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md (section 11): WAL mode,
 * foreign keys enabled, and a bounded busy timeout instead of failing
 * immediately on lock contention.
 */
export function openSqliteConnection(
  options: OpenSqliteOptions,
): SqliteConnection {
  const Driver = loadDriver();
  const connection = new Driver(options.path);

  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);

  return connection;
}
