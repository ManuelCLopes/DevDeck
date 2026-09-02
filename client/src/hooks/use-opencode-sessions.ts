import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpenCodeSessionRecord } from "@shared/opencode-sessions";
import { useCodingTool } from "@/hooks/use-coding-tool";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getDesktopApi } from "@/lib/desktop";
import { findTrackedProjectForPath } from "@/lib/dev-sessions";

export interface OpenCodeSessionView extends OpenCodeSessionRecord {
  resolvedProjectName: string | null;
}

const OPEN_CODE_SESSION_POLL_INTERVAL_MS = 15_000;

export function useOpenCodeSessions() {
  const desktopApi = getDesktopApi();
  const { availability } = useCodingTool();
  const { data: snapshot } = useWorkspaceSnapshot();
  const [sessions, setSessions] = useState<OpenCodeSessionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!desktopApi?.listOpenCodeSessions || !availability.opencode.available) {
      setSessions([]);
      setError(availability.opencode.reason ?? null);
      return;
    }

    setIsLoading(true);
    try {
      const nextSessions = await desktopApi.listOpenCodeSessions();
      setSessions(nextSessions);
      setError(null);
    } catch (nextError) {
      setSessions([]);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [availability.opencode.available, availability.opencode.reason, desktopApi]);

  useEffect(() => {
    void refresh();

    // Each poll spawns two HTTP calls against the OpenCode server DevDeck
    // starts on the user's behalf. Sessions are created by hand, so there is
    // nothing to see several times a minute — and there is nothing at all to
    // see while the window is in the background.
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void refresh();
    }, OPEN_CODE_SESSION_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  const mappedSessions = useMemo(() => {
    const trackedProjects = snapshot?.projects ?? [];
    return sessions.map((session) => {
      const matchedProject = findTrackedProjectForPath(
        trackedProjects,
        session.projectPath,
      );
      return {
        ...session,
        resolvedProjectName:
          session.projectName ?? matchedProject?.name ?? null,
      } satisfies OpenCodeSessionView;
    });
  }, [sessions, snapshot?.projects]);

  return {
    error,
    isAvailable: availability.opencode.available,
    isLoading,
    refresh,
    sessions: mappedSessions,
  };
}
