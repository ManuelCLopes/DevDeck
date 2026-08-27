import { ipcMain } from "electron";
import { z } from "zod";
import {
  getEvidenceForIssueRequestSchema,
  resolveRepositoryMappingRequestSchema,
  saveRepositoryMappingInputSchema,
  startGatherEvidenceRequestSchema,
} from "../shared/evidence-schemas";
import {
  deleteBacklogMapping,
  listBacklogMappings,
  resolveRepositoryMapping,
  upsertBacklogMapping,
} from "./persistence/backlog-mapping-repository";
import { getEvidenceForIssue } from "./persistence/evidence-repository";
import { gatherEvidence } from "./repository-index/evidence-gather";
import {
  engineeringBrainService,
  getEngineeringBrainDatabaseConnection,
} from "./engineering-brain-ipc";

function requireDatabaseConnection() {
  const connection = getEngineeringBrainDatabaseConnection();
  if (!connection) {
    throw new Error(
      "The Backlog Intelligence database is not ready yet. Try again in a moment.",
    );
  }
  return connection;
}

let evidenceOperationHandlerRegistered = false;

function registerEvidenceOperationHandler(): void {
  if (evidenceOperationHandlerRegistered) {
    return;
  }
  evidenceOperationHandlerRegistered = true;

  engineeringBrainService.registerOperationHandler(
    "gather-evidence",
    async ({ input, reportProgress, signal }) => {
      const { jiraProjectId, request } = startGatherEvidenceRequestSchema.parse(input);
      const db = requireDatabaseConnection();

      await gatherEvidence({ db, jiraProjectId, onProgress: reportProgress, request, signal });
    },
  );
}

let ipcRegistered = false;

export function registerRepositoryEvidenceIpc(): void {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;

  registerEvidenceOperationHandler();

  ipcMain.handle("devdeck:backlog-mapping:save", async (_event, payload: unknown) => {
    const input = saveRepositoryMappingInputSchema.parse(payload);
    return upsertBacklogMapping(requireDatabaseConnection(), input);
  });

  ipcMain.handle("devdeck:backlog-mapping:list", async (_event, jiraProjectKey: unknown) => {
    return listBacklogMappings(requireDatabaseConnection(), z.string().min(1).parse(jiraProjectKey));
  });

  ipcMain.handle("devdeck:backlog-mapping:delete", async (_event, id: unknown) => {
    deleteBacklogMapping(requireDatabaseConnection(), z.string().min(1).parse(id));
  });

  ipcMain.handle("devdeck:backlog-mapping:resolve", async (_event, payload: unknown) => {
    const request = resolveRepositoryMappingRequestSchema.parse(payload);
    return resolveRepositoryMapping(requireDatabaseConnection(), request);
  });

  ipcMain.handle("devdeck:evidence:get-for-issue", async (_event, payload: unknown) => {
    const request = getEvidenceForIssueRequestSchema.parse(payload);
    return getEvidenceForIssue(requireDatabaseConnection(), request.jiraProjectId, request.issueKey);
  });

  // Thin convenience wrapper around engineeringBrain.startOperation, same
  // rationale as devdeck:jira:start-sync — the renderer shouldn't need to
  // construct an EngineeringBrainPolicy just to gather evidence.
  ipcMain.handle("devdeck:evidence:start-gather", async (_event, payload: unknown) => {
    const request = startGatherEvidenceRequestSchema.parse(payload);
    return engineeringBrainService.startOperation({
      input: request,
      kind: "gather-evidence",
      policy: {
        allowedProjectIds: [],
        allowExternalModelRequests: false,
        maxConcurrentOperations: 2,
        maxContextCharacters: 0,
        maxEstimatedCost: null,
        maxEvidenceItems: 0,
        modelProviderId: null,
        rulesOnly: true,
      },
    });
  });
}
