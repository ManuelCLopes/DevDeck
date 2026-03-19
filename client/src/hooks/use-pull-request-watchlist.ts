import { useSyncExternalStore } from "react";
import {
  getPullRequestWatchlist,
  subscribePullRequestWatchlist,
} from "@/lib/pull-request-watchlist";

export function usePullRequestWatchlist() {
  return useSyncExternalStore(
    subscribePullRequestWatchlist,
    getPullRequestWatchlist,
    () => ({}),
  );
}
