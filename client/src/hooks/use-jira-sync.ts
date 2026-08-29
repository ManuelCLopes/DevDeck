import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EngineeringBrainOperation } from "@shared/engineering-brain";
import type { JiraSyncMode } from "@shared/jira";
import { getDesktopApi } from "@/lib/desktop";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * Starts a Jira full/incremental sync (an Engineering Brain operation —
 * see electron/jira-ipc.ts) and tracks its progress by filtering the
 * shared engineeringBrain event stream down to the operation this hook
 * itself started. On completion it invalidates the project-config and
 * issue queries so the UI picks up the new sync cursor and issue rows.
 */
export function useJiraSync(projectConfigId: string | null, connectionId: string | null) {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<EngineeringBrainOperation | null>(null);
  const trackedOperationId = useRef<string | null>(null);

  const invalidateOnCompletion = useCallback(() => {
    if (connectionId) {
      void queryClient.invalidateQueries({
        queryKey: ["jira", "project-configs", connectionId],
      });
    }
    if (projectConfigId) {
      void queryClient.invalidateQueries({
        queryKey: ["jira", "issues", projectConfigId],
        exact: false,
      });
    }
  }, [connectionId, projectConfigId, queryClient]);

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
    async (mode: JiraSyncMode) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira || !projectConfigId) {
        return;
      }
      const started = await desktopApi.jira.startSync({ mode, projectConfigId });
      trackedOperationId.current = started.id;

      // A fast sync (e.g. an incremental sync that finds nothing to do)
      // can finish between the main process starting the handler and
      // this IPC round-trip resolving — engineeringBrainService fires
      // the handler without waiting for startOperation's own response.
      // The subscribe() effect above would silently discard that
      // terminal event, since trackedOperationId wasn't set yet when it
      // arrived, leaving the UI stuck on "Syncing…" forever. Re-fetch
      // the operation's current state directly to catch that instead of
      // trusting `started`.
      const current = await desktopApi.engineeringBrain?.getOperation(started.id);
      const fetched = current ?? started;

      // getOperation and the subscribe() push event are two independent
      // IPC round-trips with no ordering guarantee between them — the
      // terminal event can be received and applied first, and this
      // (now stale) non-terminal snapshot must not regress that back to
      // "running"/"pending" once it finally resolves.
      let shouldInvalidate = false;
      setOperation((currentOperation) => {
        const alreadyTerminal =
          currentOperation?.id === fetched.id && TERMINAL_STATUSES.has(currentOperation.status);
        if (alreadyTerminal && !TERMINAL_STATUSES.has(fetched.status)) {
          return currentOperation;
        }
        if (!alreadyTerminal && TERMINAL_STATUSES.has(fetched.status)) {
          shouldInvalidate = true;
        }
        return fetched;
      });
      if (shouldInvalidate) {
        invalidateOnCompletion();
      }
    },
    [invalidateOnCompletion, projectConfigId],
  );

  const isSyncing = operation
    ? operation.status === "pending" || operation.status === "running"
    : false;

  return { isSyncing, operation, start };
}
