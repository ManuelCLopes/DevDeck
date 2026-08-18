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
    initialData: DEFAULT_BACKLOG_FEATURE_FLAGS,
    staleTime: 60_000,
  });
}
