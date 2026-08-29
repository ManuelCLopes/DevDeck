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
      }
    });
  }, [connectionId, projectConfigId, queryClient]);

  const start = useCallback(
    async (mode: JiraSyncMode) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira || !projectConfigId) {
        return;
      }
      const started = await desktopApi.jira.startSync({ mode, projectConfigId });
      trackedOperationId.current = started.id;
      setOperation(started);
    },
    [projectConfigId],
  );

  const isSyncing = operation
    ? operation.status === "pending" || operation.status === "running"
    : false;

  return { isSyncing, operation, start };
}
