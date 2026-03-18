import { useEffect, useRef } from "react";
import { getDesktopApi } from "@/lib/desktop";
import type { AppPreferences } from "@/lib/app-preferences";
import type { WorkspaceSnapshot } from "@shared/workspace";
import { collectWorkspaceNotifications } from "@shared/workspace-monitor";

export function useWorkspaceAlerts(
  snapshot: WorkspaceSnapshot | null | undefined,
  preferences: AppPreferences,
) {
  const previousSnapshotRef = useRef<WorkspaceSnapshot | null>(null);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (getDesktopApi()) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (!desktopApi?.showNotification) {
      return;
    }
    const notifications = collectWorkspaceNotifications(
      previousSnapshotRef.current,
      snapshot,
      preferences,
    );
    previousSnapshotRef.current = snapshot;

    for (const notification of notifications) {
      void desktopApi.showNotification(notification);
    }
  }, [preferences, snapshot]);
}
