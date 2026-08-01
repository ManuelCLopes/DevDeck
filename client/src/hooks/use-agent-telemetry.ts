import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import type { AgentRun, TokenUsageEvent } from "@shared/agents";
import {
  DEFAULT_AGENT_RUN_HISTORY_LIMIT,
  DEFAULT_TOKEN_USAGE_HISTORY_LIMIT,
  mergeAgentRuns,
  mergeTokenUsageEvents,
  normalizeAgentRuns,
  normalizeTokenUsageEvents,
} from "@shared/agent-telemetry";
import { AGENT_RUNS_STORAGE_KEY } from "@/lib/agent-runs";
import { TOKEN_USAGE_EVENTS_STORAGE_KEY } from "@/lib/token-usage";
import { getDesktopApi } from "@/lib/desktop";
import { usePersistentState } from "./use-persistent-state";

interface DurableTelemetryState {
  error: string | null;
  hydrated: boolean;
  isDesktopBacked: boolean;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useAgentRunsState(): [
  AgentRun[],
  Dispatch<SetStateAction<AgentRun[]>>,
  DurableTelemetryState,
] {
  const desktopApi = getDesktopApi();
  const [agentRuns, setAgentRuns] = usePersistentState<AgentRun[]>(
    AGENT_RUNS_STORAGE_KEY,
    [],
    {
      deserialize: (value) => normalizeAgentRuns(JSON.parse(value)),
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const hasLoadedDesktopStore = useRef(false);
  const isDesktopBacked = Boolean(
    desktopApi?.getAgentTelemetry && desktopApi?.saveAgentRuns,
  );

  useEffect(() => {
    if (!isDesktopBacked || !desktopApi?.getAgentTelemetry) {
      hasLoadedDesktopStore.current = true;
      setHydrated(true);
      return;
    }

    let cancelled = false;
    void desktopApi
      .getAgentTelemetry()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        setAgentRuns((currentRuns) =>
          mergeAgentRuns(
            snapshot.agentRuns,
            currentRuns,
            DEFAULT_AGENT_RUN_HISTORY_LIMIT,
          ),
        );
        setError(null);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(getErrorMessage(nextError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          hasLoadedDesktopStore.current = true;
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopApi, isDesktopBacked, setAgentRuns]);

  useEffect(() => {
    if (
      !isDesktopBacked ||
      !desktopApi?.saveAgentRuns ||
      !hasLoadedDesktopStore.current
    ) {
      return;
    }

    void desktopApi
      .saveAgentRuns(
        normalizeAgentRuns(agentRuns).slice(0, DEFAULT_AGENT_RUN_HISTORY_LIMIT),
      )
      .then(() => setError(null))
      .catch((nextError) => setError(getErrorMessage(nextError)));
  }, [agentRuns, desktopApi, isDesktopBacked]);

  const state = useMemo(
    () => ({
      error,
      hydrated,
      isDesktopBacked,
    }),
    [error, hydrated, isDesktopBacked],
  );

  return [agentRuns, setAgentRuns, state];
}

export function useTokenUsageEventsState(): [
  TokenUsageEvent[],
  Dispatch<SetStateAction<TokenUsageEvent[]>>,
  DurableTelemetryState,
] {
  const desktopApi = getDesktopApi();
  const [tokenUsageEvents, setTokenUsageEvents] = usePersistentState<TokenUsageEvent[]>(
    TOKEN_USAGE_EVENTS_STORAGE_KEY,
    [],
    {
      deserialize: (value) => normalizeTokenUsageEvents(JSON.parse(value)),
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const hasLoadedDesktopStore = useRef(false);
  const isDesktopBacked = Boolean(
    desktopApi?.getAgentTelemetry && desktopApi?.saveTokenUsageEvents,
  );

  useEffect(() => {
    if (!isDesktopBacked || !desktopApi?.getAgentTelemetry) {
      hasLoadedDesktopStore.current = true;
      setHydrated(true);
      return;
    }

    let cancelled = false;
    void desktopApi
      .getAgentTelemetry()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        setTokenUsageEvents((currentEvents) =>
          mergeTokenUsageEvents(
            snapshot.tokenUsageEvents,
            currentEvents,
            DEFAULT_TOKEN_USAGE_HISTORY_LIMIT,
          ),
        );
        setError(null);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(getErrorMessage(nextError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          hasLoadedDesktopStore.current = true;
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopApi, isDesktopBacked, setTokenUsageEvents]);

  useEffect(() => {
    if (
      !isDesktopBacked ||
      !desktopApi?.saveTokenUsageEvents ||
      !hasLoadedDesktopStore.current
    ) {
      return;
    }

    void desktopApi
      .saveTokenUsageEvents(
        normalizeTokenUsageEvents(tokenUsageEvents).slice(
          0,
          DEFAULT_TOKEN_USAGE_HISTORY_LIMIT,
        ),
      )
      .then(() => setError(null))
      .catch((nextError) => setError(getErrorMessage(nextError)));
  }, [desktopApi, isDesktopBacked, tokenUsageEvents]);

  const state = useMemo(
    () => ({
      error,
      hydrated,
      isDesktopBacked,
    }),
    [error, hydrated, isDesktopBacked],
  );

  return [tokenUsageEvents, setTokenUsageEvents, state];
}
