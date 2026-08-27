import { useQuery } from "@tanstack/react-query";
import type { BacklogFeatureFlags } from "@shared/feature-flags";
import { DEFAULT_BACKLOG_FEATURE_FLAGS } from "@shared/feature-flags";
import { getDesktopApi } from "@/lib/desktop";

/**
 * Reads Backlog Intelligence feature flags from the desktop process.
 * Outside the desktop app (e.g. the legacy web build) every flag stays at
 * its documented default — off.
 */
export function useBacklogFeatureFlags() {
  return useQuery<BacklogFeatureFlags>({
    queryKey: ["backlog", "feature-flags"],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.getBacklogFeatureFlags) {
        return DEFAULT_BACKLOG_FEATURE_FLAGS;
      }
      return desktopApi.getBacklogFeatureFlags();
    },
    // placeholderData (not initialData): initialData would seed the cache
    // as if it were a real, fresh fetch, so with staleTime the queryFn
    // would never run on mount and the real flags (e.g.
    // DEVDECK_FEATURE_BACKLOG_INTELLIGENCE=true) would stay invisible
    // until some other refetch trigger fired. placeholderData renders the
    // same disabled-by-default UI immediately without marking the query
    // as already resolved.
    placeholderData: DEFAULT_BACKLOG_FEATURE_FLAGS,
    staleTime: 60_000,
  });
}
