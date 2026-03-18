import { useQuery } from "@tanstack/react-query";
import { loadWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import type { WorkspaceSnapshot } from "@shared/workspace";

export function useWorkspaceSnapshot() {
  return useQuery<WorkspaceSnapshot | null>({
    queryKey: ["workspace", "snapshot"],
    queryFn: loadWorkspaceSnapshot,
  });
}
