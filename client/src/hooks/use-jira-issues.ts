import { useQuery } from "@tanstack/react-query";
import { getDesktopApi } from "@/lib/desktop";

export function useJiraIssues(
  projectConfigId: string | null,
  pagination: { limit: number; offset: number },
) {
  return useQuery({
    queryKey: ["jira", "issues", projectConfigId, pagination.limit, pagination.offset],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira || !projectConfigId) {
        return { issues: [], total: 0 };
      }
      return desktopApi.jira.listIssues({ projectConfigId, ...pagination });
    },
    enabled: Boolean(projectConfigId),
  });
}
