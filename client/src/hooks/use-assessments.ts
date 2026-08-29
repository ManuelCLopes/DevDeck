import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EngineeringBrainOperation } from "@shared/engineering-brain";
import type { AssessmentFeedbackDecision } from "@shared/assessment";
import type { BacklogClassification } from "@shared/backlog";
import { getDesktopApi } from "@/lib/desktop";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function useIssueAssessment(issueKey: string | null) {
  return useQuery({
    queryKey: ["assessment", "issue", issueKey],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.assessment || !issueKey) {
        return null;
      }
      return desktopApi.assessment.getForIssue(issueKey);
    },
    enabled: Boolean(issueKey),
  });
}

export function useAssessmentHistory(issueKey: string | null) {
  return useQuery({
    queryKey: ["assessment", "history", issueKey],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.assessment || !issueKey) {
        return [];
      }
      return desktopApi.assessment.listHistory({ issueKey });
    },
    enabled: Boolean(issueKey),
  });
}

export function useAssessmentFeedback(assessmentId: string | null) {
  return useQuery({
    queryKey: ["assessment", "feedback", assessmentId],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.assessment || !assessmentId) {
        return [];
      }
      return desktopApi.assessment.listFeedback(assessmentId);
    },
    enabled: Boolean(assessmentId),
  });
}

export function useProjectAssessmentSummary(jiraProjectId: string | null) {
  return useQuery({
    queryKey: ["assessment", "project-summary", jiraProjectId],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.assessment || !jiraProjectId) {
        return null;
      }
      return desktopApi.assessment.getProjectSummary(jiraProjectId);
    },
    enabled: Boolean(jiraProjectId),
  });
}

export function useRulesScans(jiraProjectId: string | null) {
  return useQuery({
    queryKey: ["assessment", "scans", jiraProjectId],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.assessment || !jiraProjectId) {
        return [];
      }
      return desktopApi.assessment.listScans({ jiraProjectId });
    },
    enabled: Boolean(jiraProjectId),
  });
}

/**
 * Starts a "rules-scan-project" Engineering Brain operation and tracks
 * it the same way useJiraSync / useEvidenceGather do — filtering the
 * shared event stream to the operation this hook started, invalidating
 * the project summary, scan history, and every issue-level assessment
 * query on completion (a project scan can touch every synced issue).
 */
export function useRulesScan(jiraProjectId: string | null) {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<EngineeringBrainOperation | null>(null);
  const trackedOperationId = useRef<string | null>(null);

  const invalidateOnCompletion = useCallback(() => {
    if (!jiraProjectId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["assessment", "project-summary", jiraProjectId],
    });
    void queryClient.invalidateQueries({ queryKey: ["assessment", "scans", jiraProjectId] });
    // A project scan can (re-)assess every synced issue at once —
    // invalidate the whole "issue" and "history" prefixes rather
    // than tracking which issue keys were touched.
    void queryClient.invalidateQueries({ queryKey: ["assessment", "issue"] });
    void queryClient.invalidateQueries({ queryKey: ["assessment", "history"] });
  }, [jiraProjectId, queryClient]);

  useEffect(() => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.engineeringBrain) {
      return;
    }

    return desktopApi.engineeringBrain.subscribe((event) => {
      const eventOperationId =
        event.type === "operation-progress" ? event.operationId : event.operation.id;
      if (eventOperationId !== trackedOperationId.current) {
        return;
      }

      if (event.type === "operation-progress") {
        setOperation((current) =>
          current ? { ...current, progress: event.progress } : current,
        );
        return;
      }

      setOperation(event.operation);
      if (TERMINAL_STATUSES.has(event.operation.status)) {
        invalidateOnCompletion();
      }
    });
  }, [invalidateOnCompletion]);

  const start = useCallback(async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.assessment || !jiraProjectId) {
      return;
    }
    const started = await desktopApi.assessment.startScan(jiraProjectId);
    trackedOperationId.current = started.id;

    // A fast scan (e.g. a project with no synced issues) can finish
    // between the main process firing the handler and this IPC
    // round-trip resolving — engineeringBrainService starts the handler
    // without waiting for startOperation's own response. The subscribe()
    // effect above would silently discard that terminal event, since
    // trackedOperationId wasn't set yet when it arrived, leaving the UI
    // stuck on "Scanning…" forever. Re-fetch the operation's current
    // state directly to catch that instead of trusting `started`.
    const current = await desktopApi.engineeringBrain?.getOperation(started.id);
    const latest = current ?? started;
    setOperation(latest);
    if (TERMINAL_STATUSES.has(latest.status)) {
      invalidateOnCompletion();
    }
  }, [invalidateOnCompletion, jiraProjectId]);

  const isScanning = operation
    ? operation.status === "pending" || operation.status === "running"
    : false;

  return { isScanning, operation, start };
}

export interface SubmitAssessmentFeedbackInput {
  assessmentId: string;
  correctedClassification?: BacklogClassification | null;
  decision: AssessmentFeedbackDecision;
  note?: string | null;
}

export function useSubmitAssessmentFeedback(issueKey: string | null) {
  const queryClient = useQueryClient();

  return useCallback(
    async (input: SubmitAssessmentFeedbackInput) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.assessment) {
        return;
      }
      await desktopApi.assessment.submitFeedback(input);
      void queryClient.invalidateQueries({
        queryKey: ["assessment", "feedback", input.assessmentId],
      });
      if (issueKey) {
        void queryClient.invalidateQueries({ queryKey: ["assessment", "issue", issueKey] });
        void queryClient.invalidateQueries({ queryKey: ["assessment", "history", issueKey] });
      }
    },
    [issueKey, queryClient],
  );
}
