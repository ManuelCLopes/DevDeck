import { useQuery } from "@tanstack/react-query";
import { getDesktopApi } from "@/lib/desktop";

export function useJiraIssueDetail(issueKey: string | null) {
  return useQuery({
    queryKey: ["jira", "issue-detail", issueKey],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira || !issueKey) {
        return null;
      }
      return desktopApi.jira.getIssueDetail(issueKey);
    },
    enabled: Boolean(issueKey),
  });
}
