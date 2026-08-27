import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RepositoryMappingMatch, RepositoryMappingRule } from "@shared/backlog";
import { getDesktopApi } from "@/lib/desktop";

export function useBacklogMappings(jiraProjectKey: string | null) {
  return useQuery({
    queryKey: ["backlog-mapping", jiraProjectKey],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.backlogMapping || !jiraProjectKey) {
        return [];
      }
      return desktopApi.backlogMapping.list(jiraProjectKey);
    },
    enabled: Boolean(jiraProjectKey),
  });
}

export interface SaveBacklogMappingInput {
  id?: string;
  enabled: boolean;
  jiraProjectKey: string;
  localProjectIds: string[];
  match: RepositoryMappingMatch;
  priority: number;
}

export function useSaveBacklogMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveBacklogMappingInput): Promise<RepositoryMappingRule> => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.backlogMapping) {
        throw new Error("Saving a repository mapping requires the desktop app.");
      }
      return desktopApi.backlogMapping.save(input);
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["backlog-mapping", variables.jiraProjectKey],
      });
    },
  });
}

export interface ResolveRepositoryMappingInput {
  components: string[];
  issueKey: string;
  jiraProjectKey: string;
  labels: string[];
}

export function useResolvedRepositoryMapping(input: ResolveRepositoryMappingInput | null) {
  return useQuery({
    queryKey: ["backlog-mapping-resolve", input],
    queryFn: async () => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.backlogMapping || !input) {
        return null;
      }
      return desktopApi.backlogMapping.resolve(input);
    },
    enabled: Boolean(input),
  });
}

export function useDeleteBacklogMapping(jiraProjectKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const desktopApi = getDesktopApi();
      if (!desktopApi?.backlogMapping) {
        return;
      }
      await desktopApi.backlogMapping.delete(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backlog-mapping", jiraProjectKey] });
    },
  });
}
