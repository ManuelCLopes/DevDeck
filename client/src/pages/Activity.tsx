import { useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  CheckCircle2,
  FolderGit2,
  GitBranch,
  RefreshCw,
} from "lucide-react";

export default function Activity() {
  const [filter, setFilter] = useState<"all" | "commit" | "checkout" | "repo">("all");
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();

  const filteredActivities = useMemo(
    () =>
      (snapshot?.activities ?? []).filter(
        (activity) => filter === "all" || activity.type === filter,
      ),
    [filter, snapshot?.activities],
  );
  const activitiesPagination = usePagination(filteredActivities, 10, filter);

  const ActivityIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "commit":
        return <CheckCircle2 className="w-4 h-4 text-chart-1" />;
      case "checkout":
        return <GitBranch className="w-4 h-4 text-primary" />;
      case "repo":
        return <FolderGit2 className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Activity Inbox</h1>
            <p className="text-muted-foreground text-sm">Recent local Git activity across repositories tracked by DevDeck.</p>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            className="h-8 px-3 rounded-md text-xs font-medium bg-white/80 backdrop-blur-md border border-border/60 hover:bg-black/5 shadow-sm transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="flex gap-2 border-b border-border/40 pb-4 flex-wrap">
          {[
            { id: "all", label: "All Activity" },
            { id: "commit", label: "Commits" },
            { id: "checkout", label: "Checkouts" },
            { id: "repo", label: "Repo Events" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id as typeof filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${filter === item.id ? "bg-foreground text-background border-foreground shadow-sm" : "bg-white text-muted-foreground hover:text-foreground border-border/60 hover:border-black/20"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-border/60 rounded-xl shadow-sm overflow-hidden">
          <div className="flex flex-col">
            {filteredActivities.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                <div className="p-3 bg-secondary/50 rounded-full">
                  <CheckCircle2 className="w-6 h-6 text-chart-1 opacity-80" />
                </div>
                <p>{isLoading ? "Scanning your workspace..." : "No local activity matched this filter."}</p>
              </div>
            ) : (
              activitiesPagination.paginatedItems.map((activity) => (
                <div
                  key={activity.id}
                  className="group flex items-start gap-4 p-4 border-b border-border/40 last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer relative"
                >
                  <div className="mt-0.5 p-2 rounded-lg border shadow-sm bg-secondary/50 border-border/50">
                    <ActivityIcon type={activity.type} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <p className="text-[13px] font-semibold text-foreground">
                        {activity.title}
                      </p>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </span>
                    </div>

                    <p className="text-[13px] text-muted-foreground line-clamp-2 mb-2">
                      {activity.description}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                      <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50 text-foreground/80">
                        {activity.repo}
                      </span>
                      {activity.author && <span>by {activity.author}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="px-4 pb-4">
            <PaginationControls
              currentPage={activitiesPagination.currentPage}
              onPageChange={activitiesPagination.setCurrentPage}
              pageSize={activitiesPagination.pageSize}
              totalItems={activitiesPagination.totalItems}
              label="activity items"
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
