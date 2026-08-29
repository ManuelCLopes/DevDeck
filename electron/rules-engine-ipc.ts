import { ipcMain } from "electron";
import { z } from "zod";
import {
  getIssueAssessmentRequestSchema,
  getProjectAssessmentSummaryRequestSchema,
  listAssessmentHistoryRequestSchema,
  listRulesScansRequestSchema,
  startRulesScanRequestSchema,
  submitAssessmentFeedbackRequestSchema,
} from "../shared/assessment-schemas";
import {
  getLatestAssessmentForIssue,
  getProjectAssessmentSummary,
  insertAssessmentFeedback,
  listAssessmentFeedback,
  listAssessmentHistoryForIssue,
} from "./persistence/assessment-repository";
import { listRulesScansForProject } from "./persistence/rules-scan-repository";
import { runRulesScan } from "./rules-engine/rules-scan";
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

let rulesScanOperationHandlerRegistered = false;

function registerRulesScanOperationHandler(): void {
  if (rulesScanOperationHandlerRegistered) {
    return;
  }
  rulesScanOperationHandlerRegistered = true;

  engineeringBrainService.registerOperationHandler(
    "rules-scan-project",
    async ({ input, reportProgress, signal }) => {
      const { jiraProjectId } = startRulesScanRequestSchema.parse(input);
      const db = requireDatabaseConnection();

      await runRulesScan({ db, jiraProjectId, onProgress: reportProgress, signal });
    },
  );
}

let ipcRegistered = false;

export function registerRulesEngineIpc(): void {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;

  registerRulesScanOperationHandler();

  ipcMain.handle("devdeck:assessment:get-for-issue", async (_event, issueKey: unknown) => {
    const { issueKey: parsedIssueKey } = getIssueAssessmentRequestSchema.parse({ issueKey });
    return getLatestAssessmentForIssue(requireDatabaseConnection(), parsedIssueKey);
  });

  ipcMain.handle("devdeck:assessment:list-history", async (_event, payload: unknown) => {
    const request = listAssessmentHistoryRequestSchema.parse(payload);
    return listAssessmentHistoryForIssue(requireDatabaseConnection(), request.issueKey, request.limit);
  });

  ipcMain.handle("devdeck:assessment:get-project-summary", async (_event, jiraProjectId: unknown) => {
    const { jiraProjectId: parsedProjectId } = getProjectAssessmentSummaryRequestSchema.parse({
      jiraProjectId,
    });
    return getProjectAssessmentSummary(requireDatabaseConnection(), parsedProjectId);
  });

  ipcMain.handle("devdeck:assessment:list-scans", async (_event, payload: unknown) => {
    const request = listRulesScansRequestSchema.parse(payload);
    return listRulesScansForProject(requireDatabaseConnection(), request.jiraProjectId, request.limit);
  });

  ipcMain.handle("devdeck:assessment:submit-feedback", async (_event, payload: unknown) => {
    const request = submitAssessmentFeedbackRequestSchema.parse(payload);
    return insertAssessmentFeedback(requireDatabaseConnection(), {
      assessmentId: request.assessmentId,
      correctedClassification: request.correctedClassification ?? null,
      decision: request.decision,
      note: request.note ?? null,
    });
  });

  ipcMain.handle("devdeck:assessment:list-feedback", async (_event, assessmentId: unknown) => {
    return listAssessmentFeedback(requireDatabaseConnection(), z.string().min(1).parse(assessmentId));
  });

  // Thin convenience wrapper around engineeringBrain.startOperation, same
  // rationale as devdeck:jira:start-sync and devdeck:evidence:start-gather
  // — the renderer shouldn't need to construct an EngineeringBrainPolicy
  // just to kick off a scan.
  ipcMain.handle("devdeck:assessment:start-scan", async (_event, payload: unknown) => {
    const request = startRulesScanRequestSchema.parse(payload);
    return engineeringBrainService.startOperation({
      input: { jiraProjectId: request.jiraProjectId },
      kind: "rules-scan-project",
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
