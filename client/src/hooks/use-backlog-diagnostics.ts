import { useQuery } from "@tanstack/react-query";
import type { BacklogDiagnosticsSummary } from "@shared/backlog";
import { getDesktopApi } from "@/lib/desktop";

const NOT_DESKTOP_SUMMARY: BacklogDiagnosticsSummary = {
  appliedMigrations: [],
  databasePath: "",
  error: "Backlog Intelligence diagnostics require the desktop app.",
  ready: false,
  schemaVersion: 0,
};

export function useBacklogDiagnostics(enabled: boolean) {
  return useQuery<BacklogDiagnosticsSummary>({
    queryKey: ["backlog", "diagnostics"],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.getBacklogDiagnostics) {
        return NOT_DESKTOP_SUMMARY;
      }
      return desktopApi.getBacklogDiagnostics();
    },
    enabled,
    staleTime: 30_000,
  });
}
