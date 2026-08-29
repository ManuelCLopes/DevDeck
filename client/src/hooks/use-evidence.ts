import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EngineeringBrainOperation } from "@shared/engineering-brain";
import type { EvidenceForIssueResult, RepositoryReference } from "@shared/evidence";
import { getDesktopApi } from "@/lib/desktop";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const EMPTY_EVIDENCE_RESULT: EvidenceForIssueResult = {
  evidence: [],
  repositoryPathsBySnapshotId: {},
  unavailableRepositories: [],
};

export function useIssueEvidence(jiraProjectId: string | null, issueKey: string | null) {
  return useQuery({
    queryKey: ["evidence", jiraProjectId, issueKey],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.evidence || !jiraProjectId || !issueKey) {
        return EMPTY_EVIDENCE_RESULT;
      }
      return desktopApi.evidence.getForIssue({ issueKey, jiraProjectId });
    },
    enabled: Boolean(jiraProjectId && issueKey),
  });
}

/**
 * Starts a "gather-evidence" Engineering Brain operation and tracks it
 * the same way useJiraSync does — filtering the shared event stream to
 * the operation this hook started, invalidating the evidence query on
 * completion.
 */
export function useEvidenceGather(jiraProjectId: string | null, issueKey: string | null) {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<EngineeringBrainOperation | null>(null);
  const trackedOperationId = useRef<string | null>(null);

  const invalidateOnCompletion = useCallback(() => {
    if (jiraProjectId && issueKey) {
      void queryClient.invalidateQueries({ queryKey: ["evidence", jiraProjectId, issueKey] });
    }
  }, [issueKey, jiraProjectId, queryClient]);

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

  const start = useCallback(
    async (repositories: RepositoryReference[]) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.evidence || !jiraProjectId || !issueKey) {
        return;
      }
      const started = await desktopApi.evidence.startGather({
        jiraProjectId,
        request: { issueKey, repositories },
      });
      trackedOperationId.current = started.id;

      // A fast gather (e.g. an already-unavailable repository failing
      // immediately) can finish between the main process starting the
      // handler and this IPC round-trip resolving — the subscribe()
      // effect above would silently discard that terminal event, since
      // trackedOperationId wasn't set yet when it arrived. Re-fetch the
      // operation's current state directly to catch that instead of
      // trusting `started`.
      const current = await desktopApi.engineeringBrain?.getOperation(started.id);
      const latest = current ?? started;
      setOperation(latest);
      if (TERMINAL_STATUSES.has(latest.status)) {
        invalidateOnCompletion();
      }
    },
    [invalidateOnCompletion, issueKey, jiraProjectId],
  );

  const isGathering = operation
    ? operation.status === "pending" || operation.status === "running"
    : false;

  return { isGathering, operation, start };
}
