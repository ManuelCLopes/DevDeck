import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JiraConnectionCredentials } from "@shared/jira";
import { getDesktopApi } from "@/lib/desktop";

const JIRA_CONNECTION_QUERY_KEY = ["jira", "connection"];

export function useJiraConnection() {
  return useQuery({
    queryKey: JIRA_CONNECTION_QUERY_KEY,
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira) {
        return null;
      }
      return desktopApi.jira.getConnection();
    },
  });
}

export function useTestAndSaveJiraConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: JiraConnectionCredentials) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira) {
        throw new Error("Connecting Jira requires the desktop app.");
      }
      return desktopApi.jira.testAndSaveConnection(credentials);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JIRA_CONNECTION_QUERY_KEY });
    },
  });
}

export function useClearJiraConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira) {
        return;
      }
      await desktopApi.jira.clearConnection();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JIRA_CONNECTION_QUERY_KEY });
    },
  });
}
