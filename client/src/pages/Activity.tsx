import { useEffect, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Bell,
  CheckCircle2,
  FolderGit2,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

const contributionChartConfig = {
  commits: {
    color: "hsl(var(--chart-4))",
    label: "Commits",
  },
  pullRequestsMerged: {
    color: "hsl(var(--chart-5))",
    label: "PRs Merged",
  },
  pullRequestsReviewed: {
    color: "hsl(var(--chart-2))",
    label: "PRs Reviewed",
  },
} satisfies ChartConfig;

export default function Activity() {
  const formatCount = (value: number) => new Intl.NumberFormat().format(value);
  const [filter, setFilter] = usePersistentState<"all" | "commit" | "checkout" | "repo">(
    "devdeck:activity:filter",
    "all",
  );
  const [period, setPeriod] = usePersistentState<"7d" | "30d" | "90d">(
    "devdeck:activity:period",
    "7d",
  );
  const { data: snapshot, isLoading, isFetching, refetch } = useWorkspaceSnapshot();

  useEffect(() => {
    if (filter === "checkout") {
      setFilter("repo");
    }
  }, [filter, setFilter]);

  const selectedUserActivity =
    period === "30d"
      ? snapshot?.userActivity.last30Days
      : period === "90d"
        ? snapshot?.userActivity.last90Days
        : snapshot?.userActivity.last7Days;
  const activityChartData = useMemo(
    () => (selectedUserActivity?.points ?? []).map((point) => ({ ...point })),
    [selectedUserActivity?.points],
  );

  const filteredActivities = useMemo(
    () =>
      (snapshot?.activities ?? []).filter(
        (activity) =>
          filter === "all" ||
          activity.type === filter ||
          (filter === "repo" && activity.type === "checkout"),
      ),
    [filter, snapshot?.activities],
  );
  const activitiesPagination = usePagination(filteredActivities, 10, {
    resetKey: filter,
    storageKey: "devdeck:activity:pagination",
  });

  const getActivityTypeLabel = (type: string) => {
    switch (type) {
      case "commit":
        return "Commit";
      case "checkout":
        return "Checkout";
      case "repo":
        return "Repository";
      default:
        return "Activity";
    }
  };

  const getActivityHeadline = (activity: {
    description: string;
    title: string;
    type: string;
  }) => {
    const cleanedDescription = activity.description
      .replace(/^(commit|checkout|repo)\s*:\s*/i, "")
      .trim();
    const cleanedTitle = activity.title
      .replace(/^(commit recorded in|repository activity in)\s+/i, "")
      .trim();

    return cleanedDescription || cleanedTitle;
  };

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

  const formatChartTick = (dateKey: string) =>
    format(parseISO(dateKey), period === "7d" ? "EEE" : "MMM d");

  const formatChartTooltipLabel = (dateKey: string) =>
    format(parseISO(dateKey), period === "7d" ? "EEE, MMM d" : "MMM d, yyyy");

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
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

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Your Activity
              </h2>
              <p className="text-sm text-muted-foreground">
                Personal output across the monitored workspace for the selected period.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "90d", label: "90 Days" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPeriod(option.id as typeof period)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === option.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-white text-muted-foreground hover:border-black/15 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border/60 bg-white/60 p-4 shadow-sm backdrop-blur-md">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Commits
              </h3>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {formatCount(selectedUserActivity?.commits ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/60 p-4 shadow-sm backdrop-blur-md">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                PRs Reviewed
              </h3>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {formatCount(selectedUserActivity?.pullRequestsReviewed ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/60 p-4 shadow-sm backdrop-blur-md">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                PRs Merged
              </h3>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {formatCount(selectedUserActivity?.pullRequestsMerged ?? 0)}
              </p>
            </div>
          </div>

          {snapshot?.githubStatus.state !== "connected" ? (
            <p className="text-xs text-muted-foreground">
              GitHub must be connected in Preferences for PR merged/reviewed totals.
            </p>
          ) : null}

          <section className="rounded-xl border border-border/60 bg-white/60 p-4 shadow-sm backdrop-blur-md">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Contribution Trend</h3>
              <p className="text-xs text-muted-foreground">
                Daily commits, PR reviews, and merges for the selected period.
              </p>
              <p className="text-xs text-muted-foreground">
                Lines changed in this window:{" "}
                <span className="font-medium text-foreground">
                  +{formatCount(selectedUserActivity?.linesAdded ?? 0)}
                </span>{" "}
                /{" "}
                <span className="font-medium text-foreground">
                  -{formatCount(selectedUserActivity?.linesDeleted ?? 0)}
                </span>
              </p>
            </div>
            <ChartContainer
              config={contributionChartConfig}
              className="mt-4 h-[260px] w-full aspect-auto"
            >
              <LineChart
                accessibilityLayer
                data={activityChartData}
                margin={{ bottom: 0, left: 4, right: 4, top: 8 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={24}
                  tickFormatter={formatChartTick}
                  tickLine={false}
                  tickMargin={10}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(value) =>
                        typeof value === "string"
                          ? formatChartTooltipLabel(value)
                          : value
                      }
                    />
                  }
                />
                <ChartLegend
                  verticalAlign="top"
                  content={<ChartLegendContent className="justify-start" />}
                />
                <Line
                  dataKey="commits"
                  dot={false}
                  stroke="var(--color-commits)"
                  strokeWidth={2.25}
                  type="monotone"
                />
                <Line
                  dataKey="pullRequestsReviewed"
                  dot={false}
                  stroke="var(--color-pullRequestsReviewed)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Line
                  dataKey="pullRequestsMerged"
                  dot={false}
                  stroke="var(--color-pullRequestsMerged)"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ChartContainer>
          </section>
        </section>

        <div className="flex gap-2 border-b border-border/40 pb-4 flex-wrap">
          {[
            { id: "all", label: "All Activity" },
            { id: "commit", label: "Commits" },
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
                    <div className="mb-1 flex flex-col gap-1">
                      <p className="min-w-0 text-[13px] text-foreground break-words">
                        <span className="font-semibold">
                          {getActivityTypeLabel(activity.type)}
                        </span>{" "}
                        <span>{getActivityHeadline(activity)}</span>
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 text-[11px] font-medium text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={getProjectTagClassName(activity.repo)}>
                          {activity.repo}
                        </span>
                        {activity.author && <span>by {activity.author}</span>}
                      </div>
                      <span className="whitespace-nowrap text-right font-normal">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </span>
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
