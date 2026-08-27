import { ipcMain, webContents } from "electron";
import { z } from "zod";
import type { EngineeringBrainEvent } from "../shared/engineering-brain";
import { startEngineeringBrainOperationRequestSchema } from "../shared/engineering-brain-schemas";
import type { BacklogDiagnosticsSummary } from "../shared/backlog";
import { resolveBacklogFeatureFlags } from "../shared/feature-flags";
import { EngineeringBrainService } from "./engineering-brain/engineering-brain-service";
import {
  getBacklogDatabasePath,
  openBacklogDatabase,
  type BacklogDatabaseHandle,
} from "./persistence/backlog-db";

/**
 * Singleton service instance. It only holds in-memory operation state, so
 * constructing it eagerly has no I/O side effects and stays test-friendly.
 */
export const engineeringBrainService = new EngineeringBrainService();

let databaseHandle: BacklogDatabaseHandle | null = null;
let databaseInitError: Error | null = null;

/**
 * Opens the Backlog Intelligence SQLite database and runs pending
 * migrations. Call once from the main process at startup (mirrors
 * registerPtyIpc's role for terminals) — never from the renderer.
 *
 * A failure here (e.g. the native driver failed to load) is recorded and
 * surfaced through diagnostics rather than crashing the app: the rest of
 * DevDeck does not depend on this database yet.
 */
export function initializeEngineeringBrainPersistence(): void {
  if (databaseHandle || databaseInitError) {
    return;
  }

  try {
    databaseHandle = openBacklogDatabase();
  } catch (error) {
    databaseInitError =
      error instanceof Error ? error : new Error(String(error));
  }
}

export function closeEngineeringBrainPersistence(): void {
  databaseHandle?.close();
  databaseHandle = null;
  databaseInitError = null;
}

/**
 * The live SQLite connection, for other IPC modules that need it (e.g.
 * electron/jira-ipc.ts). Returns null until
 * initializeEngineeringBrainPersistence() has run successfully — callers
 * must handle that rather than assuming persistence is always ready.
 */
export function getEngineeringBrainDatabaseConnection() {
  return databaseHandle?.connection ?? null;
}

function getBacklogDiagnosticsSummary(): BacklogDiagnosticsSummary {
  if (databaseHandle) {
    return {
      appliedMigrations: databaseHandle.migrationResult.appliedMigrations,
      databasePath: databaseHandle.databasePath,
      error: null,
      ready: true,
      schemaVersion: databaseHandle.migrationResult.toVersion,
    };
  }

  return {
    appliedMigrations: [],
    databasePath: getBacklogDatabasePath(),
    error: databaseInitError?.message ?? null,
    ready: false,
    schemaVersion: 0,
  };
}

const operationIdSchema = z.string().min(1);

function broadcastEngineeringBrainEvent(event: EngineeringBrainEvent): void {
  for (const contents of webContents.getAllWebContents()) {
    contents.send("devdeck:engineering-brain:event", event);
  }
}

let ipcRegistered = false;

/**
 * Registers the Engineering Brain IPC surface. Idempotent so tests and a
 * hot-reloaded main process can call it more than once safely.
 */
export function registerEngineeringBrainIpc(): void {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;

  engineeringBrainService.subscribe(broadcastEngineeringBrainEvent);

  ipcMain.handle(
    "devdeck:engineering-brain:start-operation",
    async (_event, payload: unknown) => {
      const request = startEngineeringBrainOperationRequestSchema.parse(payload);
      return engineeringBrainService.startOperation(request);
    },
  );

  ipcMain.handle(
    "devdeck:engineering-brain:get-operation",
    async (_event, operationId: unknown) => {
      return engineeringBrainService.getOperation(
        operationIdSchema.parse(operationId),
      );
    },
  );

  ipcMain.handle("devdeck:engineering-brain:list-operations", async () => {
    return engineeringBrainService.listOperations();
  });

  ipcMain.handle(
    "devdeck:engineering-brain:cancel-operation",
    async (_event, operationId: unknown) => {
      await engineeringBrainService.cancelOperation(
        operationIdSchema.parse(operationId),
      );
    },
  );

  ipcMain.handle("devdeck:get-backlog-feature-flags", async () => {
    return resolveBacklogFeatureFlags();
  });

  ipcMain.handle("devdeck:get-backlog-diagnostics", async () => {
    return getBacklogDiagnosticsSummary();
  });
}
