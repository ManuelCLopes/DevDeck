import { ipcMain } from "electron";
import { z } from "zod";
import type { JiraConnection } from "../shared/jira";
import {
  jiraConnectionCredentialsSchema,
  jiraProjectConfigInputSchema,
  jqlPreviewRequestSchema,
  listLocalIssuesRequestSchema,
  startJiraSyncRequestSchema,
} from "../shared/jira-schemas";
import {
  clearStoredJiraCredentials,
  getJiraAuthCapabilities,
  readStoredJiraCredentials,
  saveStoredJiraCredentials,
} from "./jira/jira-auth";
import { listIssueTypes, listProjects, searchIssues, testConnection } from "./jira/jira-client";
import {
  getJiraConnection,
  getJiraProjectConfig,
  listJiraIssuesForProject,
  listJiraProjectConfigs,
  upsertJiraConnection,
  upsertJiraProjectConfig,
} from "./persistence/jira-repository";
import {
  engineeringBrainService,
  getEngineeringBrainDatabaseConnection,
} from "./engineering-brain-ipc";
import { runFullJiraSync, runIncrementalJiraSync } from "./jira/jira-sync";

/**
 * Phase 2 supports a single active Jira connection
 * (shared/jira.ts / electron/jira/jira-auth.ts already document why).
 * This id is stable across the app's lifetime so the `jira_connections`
 * row and the stored credentials always refer to the same connection.
 */
const JIRA_CONNECTION_ID = "default";

function requireDatabaseConnection() {
  const connection = getEngineeringBrainDatabaseConnection();
  if (!connection) {
    throw new Error(
      "The Backlog Intelligence database is not ready yet. Try again in a moment.",
    );
  }
  return connection;
}

async function requireStoredCredentials() {
  const credentials = await readStoredJiraCredentials();
  if (!credentials) {
    throw new Error("No Jira connection is configured yet.");
  }
  return credentials;
}

let jiraOperationHandlersRegistered = false;

function registerJiraOperationHandlers(): void {
  if (jiraOperationHandlersRegistered) {
    return;
  }
  jiraOperationHandlersRegistered = true;

  const runSync = (
    mode: "full" | "incremental",
  ): Parameters<typeof engineeringBrainService.registerOperationHandler>[1] =>
    async ({ input, reportProgress, signal }) => {
      const projectConfigId = z.string().min(1).parse(input.projectConfigId);

      const db = requireDatabaseConnection();
      const projectConfig = getJiraProjectConfig(db, projectConfigId);
      if (!projectConfig) {
        throw new Error(`Unknown Jira project config: ${projectConfigId}`);
      }

      const credentials = await requireStoredCredentials();

      const syncFn = mode === "full" ? runFullJiraSync : runIncrementalJiraSync;
      await syncFn({
        connectionId: projectConfig.connectionId,
        credentials,
        db,
        onProgress: reportProgress,
        projectConfig,
        signal,
      });
    };

  engineeringBrainService.registerOperationHandler("jira-full-sync", runSync("full"));
  engineeringBrainService.registerOperationHandler(
    "jira-incremental-sync",
    runSync("incremental"),
  );
}

let ipcRegistered = false;

export function registerJiraIpc(): void {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;

  registerJiraOperationHandlers();

  ipcMain.handle("devdeck:jira:get-auth-capabilities", async () => {
    return getJiraAuthCapabilities();
  });

  ipcMain.handle("devdeck:jira:get-connection", async (): Promise<JiraConnection | null> => {
    const credentials = await readStoredJiraCredentials();
    if (!credentials) {
      return null;
    }

    const db = requireDatabaseConnection();
    return (
      getJiraConnection(db, JIRA_CONNECTION_ID) ?? {
        accountEmail: credentials.accountEmail,
        authMethod: "api_token",
        baseUrl: credentials.baseUrl,
        id: JIRA_CONNECTION_ID,
        lastError: null,
        lastSuccessfulSyncAt: null,
      }
    );
  });

  ipcMain.handle("devdeck:jira:test-and-save-connection", async (_event, payload: unknown) => {
    const credentials = jiraConnectionCredentialsSchema.parse(payload);
    const health = await testConnection(credentials);
    if (!health.ok) {
      throw new Error(health.reason ?? "Jira rejected that connection.");
    }

    await saveStoredJiraCredentials(credentials);

    const db = requireDatabaseConnection();
    const connection = upsertJiraConnection(db, {
      accountEmail: credentials.accountEmail,
      baseUrl: credentials.baseUrl,
      id: JIRA_CONNECTION_ID,
    });

    return { connection, health };
  });

  ipcMain.handle("devdeck:jira:clear-connection", async () => {
    await clearStoredJiraCredentials();
  });

  ipcMain.handle("devdeck:jira:list-remote-projects", async () => {
    const credentials = await requireStoredCredentials();
    return listProjects(credentials);
  });

  ipcMain.handle("devdeck:jira:list-issue-types", async (_event, projectKey: unknown) => {
    const credentials = await requireStoredCredentials();
    return listIssueTypes(credentials, z.string().min(1).parse(projectKey));
  });

  ipcMain.handle("devdeck:jira:preview-jql", async (_event, payload: unknown) => {
    const request = jqlPreviewRequestSchema.parse(payload);
    const credentials = await requireStoredCredentials();

    try {
      const page = await searchIssues(
        credentials,
        { jql: request.jql, maxResults: 0, startAt: 0 },
        // No local project id exists yet at preview time; maxResults 0
        // means Jira returns zero issues, so nothing gets normalised
        // against it.
        "",
      );
      return { total: page.total, valid: true as const };
    } catch (error) {
      return {
        reason: error instanceof Error ? error.message : "Jira rejected this JQL.",
        valid: false as const,
      };
    }
  });

  ipcMain.handle("devdeck:jira:save-project-config", async (_event, payload: unknown) => {
    const input = jiraProjectConfigInputSchema.parse(payload);
    const db = requireDatabaseConnection();
    return upsertJiraProjectConfig(db, input);
  });

  ipcMain.handle("devdeck:jira:list-project-configs", async (_event, connectionId: unknown) => {
    const db = requireDatabaseConnection();
    return listJiraProjectConfigs(db, z.string().min(1).parse(connectionId));
  });

  ipcMain.handle("devdeck:jira:list-issues", async (_event, payload: unknown) => {
    const request = listLocalIssuesRequestSchema.parse(payload);
    const db = requireDatabaseConnection();
    return listJiraIssuesForProject(db, request.projectConfigId, {
      limit: request.limit,
      offset: request.offset,
    });
  });

  // Thin convenience wrapper around the generic
  // engineeringBrain.startOperation channel: the renderer shouldn't need
  // to know EngineeringBrainPolicy internals just to kick off a sync.
  // Progress/completion still flow through the existing
  // engineeringBrain.subscribe / getOperation surface (Phase 1).
  ipcMain.handle("devdeck:jira:start-sync", async (_event, payload: unknown) => {
    const request = startJiraSyncRequestSchema.parse(payload);
    return engineeringBrainService.startOperation({
      input: { projectConfigId: request.projectConfigId },
      kind: request.mode === "full" ? "jira-full-sync" : "jira-incremental-sync",
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
