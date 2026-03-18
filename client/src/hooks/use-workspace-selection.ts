import { useSyncExternalStore } from "react";
import {
  getWorkspaceSelection,
  subscribeWorkspaceSelection,
} from "@/lib/workspace-selection";

export function useWorkspaceSelection() {
  return useSyncExternalStore(
    subscribeWorkspaceSelection,
    getWorkspaceSelection,
    () => null,
  );
}
