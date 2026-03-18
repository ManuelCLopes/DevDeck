import { useQuery } from "@tanstack/react-query";
import { loadWorkspaceSnapshot } from "@/lib/workspace-snapshot";

export function useWorkspaceSnapshot() {
  return useQuery({
    queryKey: ["workspace", "snapshot"],
    queryFn: loadWorkspaceSnapshot,
  });
}
