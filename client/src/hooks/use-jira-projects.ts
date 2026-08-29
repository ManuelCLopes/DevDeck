import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDesktopApi } from "@/lib/desktop";

export function useJiraRemoteProjects(enabled: boolean) {
  return useQuery({
    queryKey: ["jira", "remote-projects"],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira) {
        return [];
      }
      return desktopApi.jira.listRemoteProjects();
    },
    enabled,
  });
}

export function useJiraProjectConfigs(connectionId: string | null) {
  return useQuery({
    queryKey: ["jira", "project-configs", connectionId],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira || !connectionId) {
        return [];
      }
      return desktopApi.jira.listProjectConfigs(connectionId);
    },
    enabled: Boolean(connectionId),
  });
}

export interface SaveJiraProjectConfigInput {
  connectionId: string;
  jql: string | null;
  name: string;
  projectKey: string;
}

export function useSaveJiraProjectConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveJiraProjectConfigInput) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira) {
        throw new Error("Saving a Jira project requires the desktop app.");
      }
      return desktopApi.jira.saveProjectConfig(input);
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["jira", "project-configs", variables.connectionId],
      });
    },
  });
}

export function usePreviewJiraJql() {
  return useMutation({
    mutationFn: async (payload: { connectionId: string; jql: string }) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.jira) {
        throw new Error("Previewing a JQL filter requires the desktop app.");
      }
      return desktopApi.jira.previewJql(payload);
    },
  });
}
