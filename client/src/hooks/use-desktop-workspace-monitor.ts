import { useEffect } from "react";
import type { WorkspaceSelection } from "@shared/workspace";
import type { AppPreferences } from "@/lib/app-preferences";
import { getDesktopApi } from "@/lib/desktop";
import { queryClient } from "@/lib/queryClient";

const WORKSPACE_SNAPSHOT_QUERY_KEY = ["workspace", "snapshot"];

export function useDesktopWorkspaceMonitor(
  selection: WorkspaceSelection | null,
  preferences: AppPreferences,
) {
  useEffect(() => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.syncWorkspaceMonitorState) {
      return;
    }

    void desktopApi.syncWorkspaceMonitorState({
      preferences: {
        alertFailingBuilds: preferences.alertFailingBuilds,
        autoRefreshEnabled: preferences.autoRefreshEnabled,
        autoRefreshIntervalSeconds: preferences.autoRefreshIntervalSeconds,
        notifyApproved: preferences.notifyApproved,
        notifyChangesRequested: preferences.notifyChangesRequested,
        notifyReviewRequired: preferences.notifyReviewRequired,
        refreshOnWindowFocus: preferences.refreshOnWindowFocus,
      },
      selection,
    });
  }, [preferences, selection]);

  useEffect(() => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.onWorkspaceSnapshotUpdated) {
      return;
    }

    return desktopApi.onWorkspaceSnapshotUpdated((snapshot) => {
      queryClient.setQueryData(WORKSPACE_SNAPSHOT_QUERY_KEY, snapshot);
    });
  }, []);
}
