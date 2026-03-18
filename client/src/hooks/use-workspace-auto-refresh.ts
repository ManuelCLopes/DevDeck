import { useEffect, useRef } from "react";
import { useAppPreferences } from "@/lib/app-preferences";
import { queryClient } from "@/lib/queryClient";
import { getWorkspaceSelection } from "@/lib/workspace-selection";

const WORKSPACE_SNAPSHOT_QUERY_KEY = ["workspace", "snapshot"];
const REFRESH_THROTTLE_MS = 1500;

export function useWorkspaceAutoRefresh() {
  const { preferences } = useAppPreferences();
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    const refreshSnapshot = (reason: "focus" | "interval" | "online") => {
      if (!getWorkspaceSelection()) {
        return;
      }

      if (reason === "interval" && document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) {
        return;
      }

      lastRefreshAtRef.current = now;
      void queryClient.invalidateQueries({
        queryKey: WORKSPACE_SNAPSHOT_QUERY_KEY,
      });
    };

    const handleWindowFocus = () => {
      if (!preferences.refreshOnWindowFocus) {
        return;
      }

      refreshSnapshot("focus");
    };
    const handleVisibilityChange = () => {
      if (!preferences.refreshOnWindowFocus || document.visibilityState !== "visible") {
        return;
      }

      refreshSnapshot("focus");
    };
    const handleOnline = () => refreshSnapshot("online");

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const refreshIntervalId = preferences.autoRefreshEnabled
      ? window.setInterval(
          () => refreshSnapshot("interval"),
          preferences.autoRefreshIntervalSeconds * 1000,
        )
      : null;

    return () => {
      if (refreshIntervalId !== null) {
        window.clearInterval(refreshIntervalId);
      }

      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    preferences.autoRefreshEnabled,
    preferences.autoRefreshIntervalSeconds,
    preferences.refreshOnWindowFocus,
  ]);
}
