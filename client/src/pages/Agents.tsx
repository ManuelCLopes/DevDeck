import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Layers,
  Link2Off,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PaginationControls from "@/components/ui/pagination-controls";
import { useToast } from "@/hooks/use-toast";
import { useAgentHarness } from "@/hooks/use-agent-harness";
import { usePagination } from "@/hooks/use-pagination";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import {
  useAgentRunsState,
  useTaskTraceEntriesState,
  useTokenUsageEventsState,
} from "@/hooks/use-agent-telemetry";
import { useCodingTool } from "@/hooks/use-coding-tool";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import {
  buildAgentHandoffLaunchPath,
  buildDefaultHandoffBranchName,
  haveAgentRunLinksChanged,
  linkAgentRunsToOpenCodeUsageRecords,
  mergeAgentRuns,
  normalizeAgentRuns,
  summarizeAgentRunsByStatus,
  synthesizeAgentRunsFromOpenCodeRecords,
  updateAgentRunStatus,
} from "@/lib/agent-runs";
import { getDesktopApi } from "@/lib/desktop";
import { navigateInApp } from "@/lib/app-navigation";
import { buildCreateSessionPath } from "@/lib/dev-sessions";
import {
  buildTokenUsageEventsFromOpenCodeRecords,
  getTokenUsageSummaryTotal,
  mergeTokenUsageEvents,
  summarizeTokenUsageByAgent,
  type TokenUsageSummary,
} from "@/lib/token-usage";
import {
  summarizeTokenUsageForAgentRun,
  type AgentRunUsageSummary,
} from "@/lib/agent-run-detail";
import {
  buildAgentProductivityInsights,
  buildAgentTelemetryExport,
  serializeAgentTelemetryCsv,
  type AgentProductivityInsights,
  type AgentProductivityRunInsight,
} from "@/lib/agent-productivity-insights";
import {
  buildAgentHarnessQualityReport,
  type AgentHarnessQualityIssue,
  type AgentHarnessQualityReport,
} from "@/lib/agent-harness-quality";
import {
  DEVDECK_TRACE_DIRECTORY,
  buildAgentRunTracePath,
  buildAgentRunHandoffSteps,
  buildTaskTraceAppendCommandText,
  buildTaskTraceContractText,
  getTaskTraceEntriesForRun,
  serializeTaskTraceEntriesCsv,
  summarizeWorkflowHandoffHealth,
  type AgentRunHandoffStep,
  type WorkflowHandoffHealthSummary,
} from "@/lib/task-trace";
import { cn } from "@/lib/utils";
import type {
  AgentDefinition,
  AgentRun,
  AgentRunStatus,
  TaskTraceEntry,
  WorkflowDefinition,
} from "@shared/agents";

const FAVOURITE_AGENTS_STORAGE_KEY = "devdeck:agents:favourite-ids";
const DISMISSED_SOURCE_ERRORS_STORAGE_KEY =
  "devdeck:agents:dismissed-source-errors";
const TIME_RANGE_STORAGE_KEY = "devdeck:agents:time-range";
const AGENTS_PAGE_SIZE = 8;
const HARNESS_SOURCES_PAGE_SIZE = 6;
const AGENT_RUNS_PAGE_SIZE = 8;

const TIME_RANGE_OPTIONS = [
  { value: "24h", label: "Last 24 hours", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
] as const;

type TimeRangeValue = (typeof TIME_RANGE_OPTIONS)[number]["value"];

const DEFAULT_TIME_RANGE: TimeRangeValue = "30d";

function getTimeRangeCutoffMs(range: TimeRangeValue): number | null {
  const option = TIME_RANGE_OPTIONS.find((entry) => entry.value === range);
  if (!option || option.days === null) {
    return null;
  }
  return Date.now() - option.days * 24 * 60 * 60 * 1000;
}

function isValidTimeRange(value: unknown): value is TimeRangeValue {
  return (
    typeof value === "string" &&
    TIME_RANGE_OPTIONS.some((option) => option.value === value)
  );
}

function formatSourceName(sourcePath: string) {
  return sourcePath.split("/").filter(Boolean).slice(-2).join("/");
}

function buildSourceErrorKey(sourcePath: string, errors: string[]) {
  return `${sourcePath}::${errors.join("\n")}`;
}

function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }

  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat().format(tokens);
}

function formatEstimatedCost(cost: number) {
  if (cost <= 0) {
    return "$0.00";
  }

  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(cost);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPercent(value: number) {
  return `${value}%`;
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "Not enough data";
  }

  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function getExportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildRunDiagnosticsText(runInsight: AgentProductivityRunInsight) {
  return [
    "Agent Run Diagnostics",
    `Task: ${runInsight.run.taskTitle}`,
    `Status: ${runInsight.run.status}`,
    `Agent: ${runInsight.agentName}`,
    `Workflow: ${runInsight.workflowName}`,
    `Project: ${runInsight.projectName}`,
    `Started: ${formatDateTime(runInsight.run.startedAt)}`,
    `Ended: ${formatDateTime(runInsight.run.endedAt)}`,
    `Duration: ${formatDuration(runInsight.durationMs)}`,
    `Tokens: ${runInsight.totalTokens.toLocaleString()}`,
    `Estimated Cost: ${formatEstimatedCost(runInsight.estimatedCost)}`,
    `Usage Events: ${runInsight.eventCount}`,
    `Branch: ${runInsight.run.branchName ?? "No branch"}`,
    `Worktree: ${runInsight.run.worktreePath ?? "No worktree path"}`,
    `OpenCode Session: ${runInsight.run.opencodeSessionId ?? "Not linked"}`,
  ].join("\n");
}

function formatTraceList(values: string[]) {
  if (values.length === 0) {
    return "None";
  }

  return values.join(" | ");
}

function getHandoffStepTone(step: AgentRunHandoffStep) {
  if (step.status === "current") {
    return "green";
  }
  if (step.status === "handoff-target") {
    return "amber";
  }
  if (step.status === "traced") {
    return "blue";
  }

  return "neutral";
}

function getQualityIssueTone(issue: AgentHarnessQualityIssue) {
  if (issue.severity === "critical") {
    return "red";
  }
  if (issue.severity === "warning") {
    return "amber";
  }

  return "blue";
}

function buildAgentBriefText(agent: AgentDefinition) {
  return [
    `Agent: ${agent.name}`,
    `ID: ${agent.id}`,
    `Project: ${getProjectLabel(agent.projectName)}`,
    agent.description ? `Description: ${agent.description}` : null,
    agent.responsibilities.length
      ? `Responsibilities: ${agent.responsibilities.join("; ")}`
      : null,
    agent.boundaries.length ? `Boundaries: ${agent.boundaries.join("; ")}` : null,
    agent.defaultTools.length ? `Tools: ${agent.defaultTools.join(", ")}` : null,
    agent.defaultSkills.length ? `Skills: ${agent.defaultSkills.join(", ")}` : null,
    agent.handoffTargets.length
      ? `Handoff Targets: ${agent.handoffTargets.join(", ")}`
      : null,
    `Source: ${agent.sourcePath}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function getProjectLabel(projectName: string | null) {
  return projectName ?? "Workspace";
}

function getRunStatusClassName(status: AgentRunStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (status === "blocked" || status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200";
  }
  if (status === "paused") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-black/10 bg-white/70 text-muted-foreground dark:border-white/10 dark:bg-white/5";
}

function uniqueValues(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function AgentPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "amber" | "blue" | "green" | "neutral" | "red";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5",
        tone === "blue" &&
          "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200",
        tone === "green" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
        tone === "amber" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
        tone === "red" &&
          "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200",
        tone === "neutral" &&
          "border-black/10 bg-white/70 text-muted-foreground dark:border-white/10 dark:bg-white/5",
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function InsightMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail?: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-[#1d1d1f]/75">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
      {detail ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function EmptyInsight({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-black/10 p-4 text-xs text-muted-foreground dark:border-white/10">
      {children}
    </div>
  );
}

function AutomationStatusCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: "amber" | "blue" | "green" | "red";
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/70 p-3 text-xs dark:bg-white/5",
        tone === "green" &&
          "border-emerald-200/80 dark:border-emerald-900/50",
        tone === "amber" &&
          "border-amber-200/80 dark:border-amber-900/50",
        tone === "red" &&
          "border-rose-200/80 dark:border-rose-900/50",
        tone === "blue" && "border-sky-200/80 dark:border-sky-900/50",
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <p className="mt-2 font-semibold text-foreground">{value}</p>
      <p className="mt-1 line-clamp-2 leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniTrendBars<TPoint extends { day: string; label: string }>({
  formatValue,
  getValue,
  points,
  tone = "blue",
}: {
  formatValue: (value: number) => string;
  getValue: (point: TPoint) => number;
  points: TPoint[];
  tone?: "amber" | "blue" | "green" | "red";
}) {
  const maxValue = points.reduce(
    (currentMax, point) => Math.max(currentMax, getValue(point)),
    0,
  );
  const toneClassName =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "red"
          ? "bg-red-500"
          : "bg-primary";

  return (
    <div className="flex h-14 items-end gap-1" aria-hidden="true">
      {points.map((point) => {
        const value = getValue(point);
        const heightPercent =
          maxValue > 0 ? Math.max(8, Math.round((value / maxValue) * 100)) : 0;

        return (
          <div
            key={point.day}
            className="flex min-w-0 flex-1 flex-col justify-end"
            title={`${point.label}: ${formatValue(value)}`}
          >
            <div
              className={cn(
                "w-full rounded-sm opacity-80 transition-opacity hover:opacity-100",
                value > 0 ? toneClassName : "bg-muted",
              )}
              style={{ height: value > 0 ? `${heightPercent}%` : "2px" }}
            />
          </div>
        );
      })}
    </div>
  );
}

function HarnessQualitySection({
  report,
}: {
  report: AgentHarnessQualityReport;
}) {
  const topIssues = report.issues.slice(0, 8);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Harness Quality</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InsightMetric
          icon={Gauge}
          label="Score"
          value={report.score.toLocaleString()}
          detail={`${report.issues.length} total issues`}
        />
        <InsightMetric
          icon={AlertTriangle}
          label="Critical"
          value={report.criticalCount.toLocaleString()}
          detail={`${report.warningCount} warnings`}
        />
        <InsightMetric
          icon={Bot}
          label="Agent Coverage"
          value={`${report.agentCoverage.withResponsibilities}/${report.agentCoverage.totalAgents}`}
          detail={`${report.agentCoverage.withToolsOrSkills} with tools or skills`}
        />
        <InsightMetric
          icon={Workflow}
          label="Verification"
          value={formatPercent(report.workflowCoverage.verificationCoverageRate)}
          detail={`${report.workflowCoverage.stepsWithVerification}/${report.workflowCoverage.totalSteps} steps`}
        />
      </div>

      {topIssues.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {topIssues.map((issue) => (
            <div
              key={`${issue.severity}:${issue.category}:${issue.entityLabel}:${issue.message}`}
              className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {issue.entityLabel}
                  </p>
                  <p className="mt-1 leading-5 text-muted-foreground">
                    {issue.message}
                  </p>
                </div>
                <AgentPill tone={getQualityIssueTone(issue)}>
                  {issue.severity}
                </AgentPill>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <AgentPill>{issue.category}</AgentPill>
                {issue.sourcePath ? (
                  <AgentPill>{formatSourceName(issue.sourcePath)}</AgentPill>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyInsight>No harness quality issues detected.</EmptyInsight>
      )}
    </section>
  );
}

function ProductivityInsightsSection({
  handoffHealth,
  insights,
}: {
  handoffHealth: WorkflowHandoffHealthSummary[];
  insights: AgentProductivityInsights;
}) {
  const topWorkflows = insights.workflowSummaries.slice(0, 6);
  const topModels = insights.modelSummaries.slice(0, 5);
  const topProjects = insights.projectSummaries.slice(0, 5);
  const topHandoffRoles = insights.handoffRoles.slice(0, 5);
  const activeProductivityTrendPoints = insights.productivityTrendPoints.filter(
    (point) => point.runCount > 0 || point.traceCount > 0 || point.totalTokens > 0,
  );
  const latestProductivityTrend = activeProductivityTrendPoints.at(-1) ?? null;
  const peakReworkTrend =
    [...activeProductivityTrendPoints].sort(
      (left, right) =>
        right.reworkRate - left.reworkRate ||
        right.reworkRunCount - left.reworkRunCount ||
        right.failedTraceCount - left.failedTraceCount,
    )[0] ?? null;
  const topAgentThroughputTrends = insights.agentThroughputTrends.slice(0, 3);
  const topAgentCycleTimes = insights.agentSummaries
    .filter((summary) => summary.runCount > 0)
    .sort(
      (left, right) =>
        (right.averageDurationMs ?? 0) - (left.averageDurationMs ?? 0) ||
        right.runCount - left.runCount ||
        left.agentName.localeCompare(right.agentName),
    )
    .slice(0, 5);
  const topReworkSignals = insights.reworkSignals.slice(0, 5);
  const topWorkflowCostTrends = insights.workflowCostTrends.slice(0, 3);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Productivity Insights</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <InsightMetric
          icon={Gauge}
          label="Completion"
          value={formatPercent(insights.totals.completionRate)}
          detail={`${insights.totals.completedRunCount}/${insights.totals.runCount} runs`}
        />
        <InsightMetric
          icon={AlertTriangle}
          label="Failure"
          value={formatPercent(insights.totals.failureRate)}
          detail={`${insights.totals.failedRunCount} failed`}
        />
        <InsightMetric
          icon={AlertTriangle}
          label="Paused / Blocked"
          value={formatPercent(insights.totals.pausedOrBlockedRate)}
          detail={`${insights.totals.pausedRunCount + insights.totals.blockedRunCount} runs`}
        />
        <InsightMetric
          icon={Timer}
          label="Avg Duration"
          value={formatDuration(insights.totals.averageDurationMs)}
          detail={`${formatTokenCount(insights.totals.averageTokensPerRun)} avg tokens`}
        />
        <InsightMetric
          icon={Sparkles}
          label="Usage Coverage"
          value={formatPercent(insights.totals.usageCoverageRate)}
          detail={`${insights.totals.runsWithUsageCount} linked runs`}
        />
        <InsightMetric
          icon={Link2Off}
          label="Unlinked"
          value={insights.totals.unlinkedOpenCodeRunCount.toLocaleString()}
          detail={`${insights.totals.linkedOpenCodeRunCount} OpenCode links`}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Productivity Trends</h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">
              Agent Throughput Trend
            </h4>
            {topAgentThroughputTrends.length > 0 ? (
              <div className="space-y-2">
                {topAgentThroughputTrends.map((trend) => (
                  <div
                    key={trend.agentId ?? "unassigned"}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-foreground">
                        {trend.agentName}
                      </p>
                      <AgentPill>{`${trend.runCount} runs`}</AgentPill>
                    </div>
                    <div className="mt-3">
                      <MiniTrendBars
                        points={trend.points}
                        getValue={(point) => point.runCount}
                        formatValue={(value) => `${value} runs`}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {formatDecimal(trend.averageRunsPerActiveDay)} runs / active day ·{" "}
                      {formatPercent(trend.completionRate)} completion
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No throughput trend yet.</EmptyInsight>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">
              Rework Rate Trend
            </h4>
            {latestProductivityTrend ? (
              <div className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">
                    {latestProductivityTrend.label}
                  </p>
                  <AgentPill
                    tone={latestProductivityTrend.reworkRate > 0 ? "amber" : "green"}
                  >
                    {formatPercent(latestProductivityTrend.reworkRate)}
                  </AgentPill>
                </div>
                <div className="mt-3">
                  <MiniTrendBars
                    points={insights.productivityTrendPoints}
                    getValue={(point) => point.reworkRate}
                    formatValue={formatPercent}
                    tone={latestProductivityTrend.reworkRate > 0 ? "amber" : "green"}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <AgentPill>{`${latestProductivityTrend.reworkRunCount} rework runs`}</AgentPill>
                  <AgentPill>{`${latestProductivityTrend.failedTraceCount} failed traces`}</AgentPill>
                  {peakReworkTrend ? (
                    <AgentPill tone={peakReworkTrend.reworkRate > 0 ? "amber" : "green"}>
                      {`Peak ${formatPercent(peakReworkTrend.reworkRate)}`}
                    </AgentPill>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyInsight>No rework trend yet.</EmptyInsight>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">
              Workflow Cost Trend
            </h4>
            {topWorkflowCostTrends.length > 0 ? (
              <div className="space-y-2">
                {topWorkflowCostTrends.map((trend) => (
                  <div
                    key={trend.workflowId ?? "unassigned"}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-foreground">
                        {trend.workflowName}
                      </p>
                      <AgentPill>{formatEstimatedCost(trend.estimatedCost)}</AgentPill>
                    </div>
                    <div className="mt-3">
                      <MiniTrendBars
                        points={trend.points}
                        getValue={(point) => point.totalTokens}
                        formatValue={formatTokenCount}
                        tone="green"
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {formatTokenCount(trend.totalTokens)} total ·{" "}
                      {formatTokenCount(trend.averageTokensPerRun)} / run
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No workflow cost trend yet.</EmptyInsight>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">
              Handoff Latency
            </h4>
            {insights.handoffLatency.sampleCount > 0 ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Average</p>
                      <p className="font-semibold text-foreground">
                        {formatDuration(insights.handoffLatency.averageLatencyMs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Slowest</p>
                      <p className="font-semibold text-foreground">
                        {formatDuration(insights.handoffLatency.maxLatencyMs)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {insights.handoffLatency.sampleCount} matched handoffs
                  </p>
                </div>
                {insights.handoffLatency.slowestSamples.slice(0, 2).map((sample) => (
                  <div
                    key={`${sample.sourceRunId}:${sample.targetRunId}:${sample.handoffAt}`}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-foreground">
                        {sample.workflowName}
                      </p>
                      <AgentPill>{formatDuration(sample.latencyMs)}</AgentPill>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {sample.fromAgentName} to {sample.toAgentName}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No matched handoff starts yet.</EmptyInsight>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Workflow Rollups</h3>
          </div>
          {topWorkflows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="border-b border-black/10 bg-secondary/50 text-[10px] uppercase text-muted-foreground dark:border-white/10">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Workflow</th>
                    <th className="px-3 py-2 font-semibold">Runs</th>
                    <th className="px-3 py-2 font-semibold">Avg Duration</th>
                    <th className="px-3 py-2 font-semibold">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white/70 dark:divide-white/10 dark:bg-white/5">
                  {topWorkflows.map((workflow) => (
                    <tr key={workflow.workflowId ?? "unassigned"}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{workflow.workflowName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {workflow.projectName}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {workflow.runCount}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDuration(workflow.averageDurationMs)}
                      </td>
                      <td className="px-3 py-2">
                        {workflow.metadataIssues.length > 0 ? (
                          <div className="flex max-w-[260px] flex-wrap gap-1">
                            {workflow.metadataIssues.slice(0, 3).map((issue) => (
                              <AgentPill key={issue} tone="amber">
                                {issue}
                              </AgentPill>
                            ))}
                          </div>
                        ) : (
                          <AgentPill tone="green">Ready</AgentPill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyInsight>No workflow rollups yet.</EmptyInsight>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Agent Cycle Time</h3>
            </div>
            {topAgentCycleTimes.length > 0 ? (
              <div className="space-y-2">
                {topAgentCycleTimes.map((agent) => (
                  <div
                    key={agent.agentId ?? "unassigned"}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-foreground">
                        {agent.agentName}
                      </p>
                      <AgentPill>{formatDuration(agent.averageDurationMs)}</AgentPill>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {agent.runCount} runs · {formatPercent(agent.completionRate)} completion
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No agent cycle time yet.</EmptyInsight>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Rework Signals</h3>
            </div>
            {topReworkSignals.length > 0 ? (
              <div className="space-y-2">
                {topReworkSignals.map((signal) => (
                  <div
                    key={signal.runId}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <p className="truncate font-semibold text-foreground">
                      {signal.taskTitle}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {signal.failedTraceCount > 0 ? (
                        <AgentPill tone="red">
                          {`${signal.failedTraceCount} failed traces`}
                        </AgentPill>
                      ) : null}
                      {signal.repeatedFileCount > 0 ? (
                        <AgentPill tone="amber">
                          {`${signal.repeatedFileCount} repeated files`}
                        </AgentPill>
                      ) : null}
                      {signal.repeatedTestCount > 0 ? (
                        <AgentPill tone="amber">
                          {`${signal.repeatedTestCount} repeated tests`}
                        </AgentPill>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {signal.agentName} · {signal.traceCount} traces
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No rework signals detected.</EmptyInsight>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Model Usage</h3>
            </div>
            {topModels.length > 0 ? (
              <div className="space-y-2">
                {topModels.map((model) => (
                  <div
                    key={model.label}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-foreground">{model.label}</p>
                      <AgentPill>{`${model.eventCount} events`}</AgentPill>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-muted-foreground">
                      <span>{formatTokenCount(model.totalTokens)} tokens</span>
                      <span>{formatEstimatedCost(model.estimatedCost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No model usage recorded.</EmptyInsight>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Project Usage</h3>
            </div>
            {topProjects.length > 0 ? (
              <div className="space-y-2">
                {topProjects.map((project) => (
                  <div
                    key={project.projectId ?? project.projectName}
                    className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-foreground">
                        {project.projectName}
                      </p>
                      <AgentPill>{`${project.runCount} runs`}</AgentPill>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-muted-foreground">
                      <span>{formatTokenCount(project.totalTokens)} tokens</span>
                      <span>{formatEstimatedCost(project.estimatedCost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight>No project usage recorded.</EmptyInsight>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Linking Attention</h3>
          </div>
          {insights.telemetryGaps.length > 0 ? (
            <div className="space-y-2">
              {insights.telemetryGaps.slice(0, 4).map((gap) => (
                <div
                  key={`gap:${gap.runId ?? gap.taskTitle}:${gap.createdAt}`}
                  className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                >
                  <p className="truncate font-semibold text-foreground">{gap.taskTitle}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {gap.issueLabels.map((issue) => (
                      <AgentPill key={issue} tone="red">
                        {issue}
                      </AgentPill>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {gap.agentName} · {gap.workflowName}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInsight>No linking issues detected.</EmptyInsight>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Handoff Health</h3>
          </div>
          {handoffHealth.length > 0 ? (
            <div className="space-y-2">
              {handoffHealth.slice(0, 5).map((health) => (
                <div
                  key={health.workflowId ?? health.workflowName}
                  className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-foreground">
                      {health.workflowName}
                    </p>
                    <AgentPill
                      tone={
                        health.stuckHandoffCount > 0 || health.errorTraceCount > 0
                          ? "amber"
                          : "green"
                      }
                    >
                      {`${health.traceCount} traces`}
                    </AgentPill>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Stuck</p>
                      <p className="font-semibold text-foreground">
                        {health.stuckHandoffCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Missing</p>
                      <p className="font-semibold text-foreground">
                        {health.missingNextActionCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Errors</p>
                      <p className="font-semibold text-foreground">
                        {health.errorTraceCount}
                      </p>
                    </div>
                  </div>
                  {health.repeatedFailurePoints.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {health.repeatedFailurePoints.map((failure) => (
                        <AgentPill key={failure.label} tone="red">
                          {`${failure.label} x${failure.count}`}
                        </AgentPill>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {health.missingTraceRunCount} runs without trace entries
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyInsight>No workflow handoff health yet.</EmptyInsight>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Recent Expensive Runs</h3>
          </div>
          {insights.expensiveRuns.length > 0 ? (
            <div className="space-y-2">
              {insights.expensiveRuns.slice(0, 5).map((runInsight) => (
                <div
                  key={`expensive:${runInsight.run.id}`}
                  className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-foreground">
                      {runInsight.run.taskTitle}
                    </p>
                    <AgentPill>{formatEstimatedCost(runInsight.estimatedCost)}</AgentPill>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {runInsight.agentName} · {formatTokenCount(runInsight.totalTokens)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInsight>No costed runs recorded.</EmptyInsight>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Handoff Roles</h3>
          </div>
          {topHandoffRoles.length > 0 ? (
            <div className="space-y-2">
              {topHandoffRoles.map((role) => (
                <div
                  key={role.agentId}
                  className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                >
                  <p className="truncate font-semibold text-foreground">{role.agentName}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">First</p>
                      <p className="font-semibold text-foreground">
                        {role.firstRunCount} runs
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Last</p>
                      <p className="font-semibold text-foreground">
                        {role.lastRunCount} runs
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {role.firstWorkflowCount} first-step, {role.lastWorkflowCount} last-step workflows
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInsight>No handoff roles detected.</EmptyInsight>
          )}
        </div>
      </div>
    </section>
  );
}

function AgentCard({
  agent,
  isFavourite,
  onCopyBrief,
  onOpenSource,
  onRevealSource,
  onToggleFavourite,
  tokenUsage,
}: {
  agent: AgentDefinition;
  isFavourite: boolean;
  onCopyBrief: (agent: AgentDefinition) => void;
  onOpenSource: (sourcePath: string) => void;
  onRevealSource: (sourcePath: string) => void;
  onToggleFavourite: (agentId: string) => void;
  tokenUsage: TokenUsageSummary | null;
}) {
  // Responsibilities fall back to the description when none are parsed,
  // and to nothing at all when neither is present — matching the
  // convention we now use for tools/skills. The old "No responsibilities
  // were parsed from the harness source." fallback read like a parse
  // error and cluttered every card that didn't happen to list them.
  const primaryResponsibilities =
    agent.responsibilities.length > 0
      ? agent.responsibilities
      : agent.description
        ? [agent.description]
        : [];

  return (
    <article className="flex min-h-[260px] flex-col rounded-lg border border-black/10 bg-white/80 p-4 shadow-sm transition-colors hover:border-primary/30 dark:border-white/10 dark:bg-[#1d1d1f]/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3>
            <AgentPill tone="green">{getProjectLabel(agent.projectName)}</AgentPill>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {agent.description ?? "Harness-defined agent profile."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onToggleFavourite(agent.id)}
            title={isFavourite ? "Remove from favourites" : "Mark as favourite"}
            aria-pressed={isFavourite}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                isFavourite
                  ? "fill-amber-400 text-amber-500"
                  : "text-muted-foreground",
              )}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCopyBrief(agent)}
            title="Copy agent brief"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onOpenSource(agent.sourcePath)}
            title="Open source definition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRevealSource(agent.sourcePath)}
            title="Reveal source definition"
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-black/10 bg-secondary/35 px-3 py-2 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Model
          </p>
          <p className="mt-1 truncate font-semibold text-foreground">
            {agent.defaultModel ?? agent.defaultProvider ?? "Unspecified"}
          </p>
        </div>
        <div className="rounded-md border border-black/10 bg-secondary/35 px-3 py-2 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Used
          </p>
          <p className="mt-1 truncate font-semibold text-foreground">
            {formatTokenCount(tokenUsage?.totalTokens ?? 0)}
          </p>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-3">
        {primaryResponsibilities.length > 0 ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Responsibilities
            </div>
            <ul className="space-y-1.5 text-xs leading-5 text-foreground/85">
              {primaryResponsibilities.slice(0, 4).map((responsibility) => (
                <li key={responsibility} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{responsibility}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {agent.boundaries.length > 0 ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Boundaries
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {agent.boundaries.join(" | ")}
            </p>
          </div>
        ) : null}
      </div>

      {agent.defaultTools.length > 0 || agent.defaultSkills.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-black/10 pt-3 dark:border-white/10">
          {agent.defaultTools.slice(0, 4).map((tool) => (
            <AgentPill key={`tool:${tool}`}>{tool}</AgentPill>
          ))}
          {agent.defaultSkills.slice(0, 4).map((skill) => (
            <AgentPill key={`skill:${skill}`} tone="blue">
              {skill}
            </AgentPill>
          ))}
        </div>
      ) : null}

      <p className="mt-3 truncate text-[10px] text-muted-foreground">
        Source: {formatSourceName(agent.sourcePath)}
      </p>
    </article>
  );
}

function WorkflowRow({
  workflow,
  onSelect,
}: {
  workflow: WorkflowDefinition;
  onSelect: (workflow: WorkflowDefinition) => void;
}) {
  // Row is intentionally minimal: name, description, project, and a
  // step count. The click-through modal is the source of truth for
  // step names, agents, and models, so we don't duplicate them here.
  const stepCountLabel = `${workflow.steps.length} step${workflow.steps.length === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(workflow)}
      className="flex w-full items-start justify-between gap-3 rounded-lg border border-black/10 bg-white/70 p-3 text-left transition hover:border-primary/50 hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      title="Open workflow diagram"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{workflow.name}</p>
        {workflow.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {workflow.description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <AgentPill>{stepCountLabel}</AgentPill>
        <AgentPill tone="green">{getProjectLabel(workflow.projectName)}</AgentPill>
      </div>
    </button>
  );
}

// --- Workflow diagram helpers ---

interface WorkflowLayoutNode {
  step: WorkflowDefinition["steps"][number];
  col: number;
  row: number;
  x: number;
  y: number;
}

const WORKFLOW_NODE_WIDTH = 220;
const WORKFLOW_NODE_HEIGHT = 96;
const WORKFLOW_COLUMN_GAP = 60;
const WORKFLOW_ROW_GAP = 24;
const WORKFLOW_DIAGRAM_PADDING = 24;

function computeWorkflowLayout(workflow: WorkflowDefinition): {
  nodes: WorkflowLayoutNode[];
  width: number;
  height: number;
} {
  const steps = workflow.steps;
  if (steps.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const stepById = new Map(steps.map((step) => [step.id, step]));
  // Longest-path level assignment: level(step) = 1 + max(level(pred)).
  // Steps with no predecessor start at level 0. Cycles are broken by the
  // memoized visitor guard.
  const predecessorsById = new Map<string, string[]>();
  for (const step of steps) {
    predecessorsById.set(step.id, []);
  }
  for (const step of steps) {
    for (const nextId of step.nextStepIds) {
      if (!stepById.has(nextId)) {
        continue;
      }
      predecessorsById.get(nextId)!.push(step.id);
    }
  }

  const levelById = new Map<string, number>();
  const visiting = new Set<string>();
  const resolveLevel = (id: string): number => {
    if (levelById.has(id)) {
      return levelById.get(id)!;
    }
    if (visiting.has(id)) {
      // Cycle guard: treat as root to avoid infinite recursion.
      levelById.set(id, 0);
      return 0;
    }
    visiting.add(id);
    const preds = predecessorsById.get(id) ?? [];
    const level = preds.length === 0
      ? 0
      : Math.max(...preds.map((predId) => resolveLevel(predId))) + 1;
    visiting.delete(id);
    levelById.set(id, level);
    return level;
  };
  for (const step of steps) {
    resolveLevel(step.id);
  }

  const columns = new Map<number, WorkflowDefinition["steps"]>();
  for (const step of steps) {
    const level = levelById.get(step.id) ?? 0;
    const list = columns.get(level) ?? [];
    list.push(step);
    columns.set(level, list);
  }

  const sortedLevels = Array.from(columns.keys()).sort((a, b) => a - b);
  const nodes: WorkflowLayoutNode[] = [];
  let maxRows = 0;
  sortedLevels.forEach((level, colIndex) => {
    const stepsInColumn = columns.get(level)!;
    if (stepsInColumn.length > maxRows) {
      maxRows = stepsInColumn.length;
    }
    stepsInColumn.forEach((step, rowIndex) => {
      nodes.push({
        step,
        col: colIndex,
        row: rowIndex,
        x: WORKFLOW_DIAGRAM_PADDING + colIndex * (WORKFLOW_NODE_WIDTH + WORKFLOW_COLUMN_GAP),
        y: WORKFLOW_DIAGRAM_PADDING + rowIndex * (WORKFLOW_NODE_HEIGHT + WORKFLOW_ROW_GAP),
      });
    });
  });

  const width =
    WORKFLOW_DIAGRAM_PADDING * 2 +
    sortedLevels.length * WORKFLOW_NODE_WIDTH +
    Math.max(0, sortedLevels.length - 1) * WORKFLOW_COLUMN_GAP;
  const height =
    WORKFLOW_DIAGRAM_PADDING * 2 +
    Math.max(1, maxRows) * WORKFLOW_NODE_HEIGHT +
    Math.max(0, maxRows - 1) * WORKFLOW_ROW_GAP;
  return { nodes, width, height };
}

function WorkflowDiagramDialog({
  agents,
  onOpenChange,
  workflow,
}: {
  agents: AgentDefinition[];
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowDefinition | null;
}) {
  const layout = useMemo(
    () => (workflow ? computeWorkflowLayout(workflow) : null),
    [workflow],
  );
  const nodesById = useMemo(
    () => new Map((layout?.nodes ?? []).map((node) => [node.step.id, node])),
    [layout],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  if (!workflow || !layout) {
    return null;
  }

  return (
    <Dialog open={workflow !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-black/10 bg-white/95 backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/95">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-semibold">
            {workflow.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {workflow.description ??
              `${workflow.steps.length} step${workflow.steps.length === 1 ? "" : "s"} · ${getProjectLabel(workflow.projectName)}`}
          </DialogDescription>
        </DialogHeader>

        {layout.nodes.length > 0 ? (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-black/10 bg-secondary/30 dark:border-white/10">
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="block"
              role="img"
              aria-label={`Diagram for ${workflow.name}`}
            >
              <defs>
                <marker
                  id="workflow-arrow"
                  markerWidth={8}
                  markerHeight={8}
                  refX={7}
                  refY={4}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                </marker>
              </defs>
              <g className="text-muted-foreground/60">
                {layout.nodes.flatMap((node) =>
                  node.step.nextStepIds
                    .map((nextId) => nodesById.get(nextId))
                    .filter((target): target is WorkflowLayoutNode => Boolean(target))
                    .map((target, index) => {
                      const startX = node.x + WORKFLOW_NODE_WIDTH;
                      const startY = node.y + WORKFLOW_NODE_HEIGHT / 2;
                      const endX = target.x;
                      const endY = target.y + WORKFLOW_NODE_HEIGHT / 2;
                      // Cubic bezier for a nicer arc when rows differ.
                      const midX = (startX + endX) / 2;
                      const path = `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`;
                      return (
                        <path
                          key={`${node.step.id}->${target.step.id}:${index}`}
                          d={path}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          markerEnd="url(#workflow-arrow)"
                        />
                      );
                    }),
                )}
              </g>
              {layout.nodes.map((node) => {
                const agent = node.step.agentId
                  ? agentsById.get(node.step.agentId)
                  : null;
                const modelLabel = agent?.defaultModel ?? agent?.defaultProvider ?? null;
                return (
                  <g key={node.step.id} transform={`translate(${node.x}, ${node.y})`}>
                    <rect
                      width={WORKFLOW_NODE_WIDTH}
                      height={WORKFLOW_NODE_HEIGHT}
                      rx={10}
                      ry={10}
                      className="fill-white stroke-black/20 dark:fill-white/10 dark:stroke-white/20"
                    />
                    <text
                      x={12}
                      y={22}
                      className="fill-foreground"
                      style={{ fontSize: 12, fontWeight: 600 }}
                    >
                      {truncateForSvg(node.step.name, 26)}
                    </text>
                    <text
                      x={12}
                      y={42}
                      className="fill-muted-foreground"
                      style={{ fontSize: 11 }}
                    >
                      {agent ? `Agent: ${truncateForSvg(agent.name, 22)}` : "No agent bound"}
                    </text>
                    <text
                      x={12}
                      y={60}
                      className="fill-muted-foreground"
                      style={{ fontSize: 10 }}
                    >
                      {modelLabel
                        ? `Model: ${truncateForSvg(modelLabel, 24)}`
                        : "Model: unspecified"}
                    </text>
                    {node.step.expectedOutput ? (
                      <text
                        x={12}
                        y={80}
                        className="fill-muted-foreground/80"
                        style={{ fontSize: 10, fontStyle: "italic" }}
                      >
                        → {truncateForSvg(node.step.expectedOutput, 26)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-muted-foreground dark:border-white/10">
            This workflow has no steps to diagram.
          </div>
        )}

        {workflow.steps.length > 0 ? (
          <div className="max-h-56 overflow-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/10 bg-secondary/50 text-[10px] uppercase text-muted-foreground dark:border-white/10">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Step</th>
                  <th className="px-3 py-2 font-semibold">Agent</th>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">Next</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {workflow.steps.map((step, index) => {
                  const agent = step.agentId ? agentsById.get(step.agentId) : null;
                  const model = agent?.defaultModel ?? agent?.defaultProvider ?? null;
                  return (
                    <tr key={step.id}>
                      <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        <div className="flex flex-col">
                          <span>{step.name}</span>
                          {step.expectedOutput ? (
                            <span className="text-[10px] text-muted-foreground">
                              expects: {step.expectedOutput}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {agent?.name ?? (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {model ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {step.nextStepIds.length > 0
                          ? step.nextStepIds
                              .map((nextId) =>
                                workflow.steps.find((candidate) => candidate.id === nextId)?.name ??
                                nextId,
                              )
                              .join(", ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function truncateForSvg(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function AgentRunRow({
  agents,
  isSelected,
  onStatusChange,
  onSelect,
  run,
  usage,
  workflows,
}: {
  agents: AgentDefinition[];
  isSelected: boolean;
  onStatusChange: (runId: string, status: AgentRunStatus) => void;
  onSelect: (runId: string) => void;
  run: AgentRun;
  usage: AgentRunUsageSummary;
  workflows: WorkflowDefinition[];
}) {
  const agent = run.agentId
    ? agents.find((candidate) => candidate.id === run.agentId)
    : null;
  const workflow = run.workflowRunId
    ? workflows.find((candidate) => candidate.id === run.workflowRunId)
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white/70 p-3 transition-colors dark:bg-white/5",
        isSelected
          ? "border-primary/50"
          : "border-black/10 dark:border-white/10",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{run.taskTitle}</p>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
                getRunStatusClassName(run.status),
              )}
            >
              {run.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {agent?.name ?? "Unassigned"} · {workflow?.name ?? "No workflow"}
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
            {run.branchName ?? "No branch"} · {run.worktreePath ?? "No worktree path"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelect(run.id)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-black/10 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-background",
            )}
          >
            {isSelected ? "Viewing" : "Details"}
          </button>
          {(["active", "blocked", "paused", "completed", "failed"] as AgentRunStatus[]).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => onStatusChange(run.id, status)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  run.status === status
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-black/10 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-background",
                )}
              >
                {status}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <AgentPill>{run.startedAt.slice(0, 10)}</AgentPill>
        {usage.totalTokens > 0 ? (
          <AgentPill>{formatTokenCount(usage.totalTokens)} used</AgentPill>
        ) : null}
        {run.terminalPaneId ? <AgentPill>{run.terminalPaneId}</AgentPill> : null}
      </div>
    </div>
  );
}

function AgentRunDetail({
  agents,
  handoffSteps,
  onCopyValue,
  onCopyDiagnostics,
  onCopyTraceAppendCommand,
  onCopyTraceContract,
  onStartHandoff,
  onStatusChange,
  run,
  traceEntries,
  usage,
  workflows,
}: {
  agents: AgentDefinition[];
  handoffSteps: AgentRunHandoffStep[];
  onCopyDiagnostics: (runId: string) => void;
  onCopyTraceAppendCommand: (runId: string) => void;
  onCopyTraceContract: (runId: string) => void;
  onCopyValue: (value: string, title: string) => void;
  onStartHandoff: (run: AgentRun, step: AgentRunHandoffStep) => void;
  onStatusChange: (runId: string, status: AgentRunStatus) => void;
  run: AgentRun | null;
  traceEntries: TaskTraceEntry[];
  usage: AgentRunUsageSummary | null;
  workflows: WorkflowDefinition[];
}) {
  if (!run || !usage) {
    return (
      <aside className="rounded-lg border border-dashed border-black/10 p-4 text-sm text-muted-foreground dark:border-white/10">
        Select an agent run to inspect branch, worktree, token usage, and status.
      </aside>
    );
  }

  const agent = run.agentId
    ? agents.find((candidate) => candidate.id === run.agentId)
    : null;
  const workflow = run.workflowRunId
    ? workflows.find((candidate) => candidate.id === run.workflowRunId)
    : null;

  return (
    <aside className="rounded-lg border border-black/10 bg-white/70 p-4 text-xs dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {run.taskTitle}
          </h3>
          <p className="mt-1 text-muted-foreground">
            {agent?.name ?? "Unassigned"} · {workflow?.name ?? "No workflow"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
            getRunStatusClassName(run.status),
          )}
        >
          {run.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-black/10 bg-secondary/35 p-2 dark:border-white/10">
          <p className="text-[10px] uppercase text-muted-foreground">Tokens</p>
          <p className="mt-1 font-semibold text-foreground">
            {formatTokenCount(usage.totalTokens)}
          </p>
        </div>
        <div className="rounded-md border border-black/10 bg-secondary/35 p-2 dark:border-white/10">
          <p className="text-[10px] uppercase text-muted-foreground">Est. Cost</p>
          <p className="mt-1 font-semibold text-foreground">
            {formatEstimatedCost(usage.estimatedCost)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <AgentPill>{`${usage.eventCount} usage events`}</AgentPill>
      </div>

      <dl className="mt-4 space-y-3">
        {[
          ["Started", formatDateTime(run.startedAt)],
          ["Ended", formatDateTime(run.endedAt)],
          ["Branch", run.branchName ?? "No branch"],
          ["Worktree", run.worktreePath ?? "No worktree path"],
          ["OpenCode Session", run.opencodeSessionId ?? "Not linked"],
          ["Last Usage", formatDateTime(usage.lastUsedAt)],
          ["Models", usage.modelLabels.length ? usage.modelLabels.join(", ") : "No model data"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 truncate text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Input</p>
          <p className="font-semibold text-foreground">
            {formatTokenCount(usage.inputTokens)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Output</p>
          <p className="font-semibold text-foreground">
            {formatTokenCount(usage.outputTokens)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Reasoning</p>
          <p className="font-semibold text-foreground">
            {formatTokenCount(usage.reasoningTokens)}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">
            Handoff Trace
          </h4>
          <AgentPill>{`${handoffSteps.length} steps`}</AgentPill>
        </div>
        {handoffSteps.length > 0 ? (
          <div className="mt-2 space-y-2">
            {handoffSteps.map((step) => (
              <div
                key={step.id}
                className="rounded-md border border-black/10 bg-secondary/35 p-2 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{step.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {step.agentName}
                    </p>
                  </div>
                  <AgentPill tone={getHandoffStepTone(step)}>{step.status}</AgentPill>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {step.lastTraceAt ? (
                    <AgentPill>{formatDateTime(step.lastTraceAt)}</AgentPill>
                  ) : null}
                  {step.errorCount > 0 ? (
                    <AgentPill tone="red">{`${step.errorCount} errors`}</AgentPill>
                  ) : null}
                </div>
                {step.status === "handoff-target" && step.agentId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 w-full gap-1.5 text-[11px]"
                    onClick={() => onStartHandoff(run, step)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Start Next Agent
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No workflow steps or trace handoffs were found for this run.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">
            Task Timeline
          </h4>
          <AgentPill>{`${traceEntries.length} traces`}</AgentPill>
        </div>
        {traceEntries.length > 0 ? (
          <div className="mt-2 space-y-2">
            {traceEntries.map((entry) => {
              const handoffTarget = entry.handoffTargetAgentId
                ? agents.find((candidate) => candidate.id === entry.handoffTargetAgentId)
                : null;
              return (
                <div
                  key={entry.id}
                  className="rounded-md border border-black/10 bg-white/70 p-2 dark:border-white/10 dark:bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-semibold leading-5 text-foreground">
                      {entry.summary}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {entry.createdAt.slice(11, 16)}
                    </span>
                  </div>
                  <dl className="mt-2 space-y-2 text-[11px]">
                    {[
                      ["Commands", formatTraceList(entry.commandsRun)],
                      ["Tests", formatTraceList(entry.testsRun)],
                      ["Files", formatTraceList(entry.filesTouched)],
                      ["Next", entry.nextAction ?? "Missing next action"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="font-semibold uppercase text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-0.5 break-words text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {handoffTarget || entry.handoffTargetAgentId ? (
                      <AgentPill tone="amber">
                        {`Hand off: ${handoffTarget?.name ?? entry.handoffTargetAgentId}`}
                      </AgentPill>
                    ) : null}
                    {entry.errors.map((error) => (
                      <AgentPill key={error} tone="red">
                        {error}
                      </AgentPill>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-dashed border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
            Waiting for automatic trace entries from {DEVDECK_TRACE_DIRECTORY}.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(["active", "blocked", "paused", "completed", "failed"] as AgentRunStatus[]).map(
          (status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(run.id, status)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                run.status === status
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-black/10 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-background",
              )}
            >
              {status}
            </button>
          ),
        )}
      </div>

      {run.worktreePath ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-8 w-full gap-2 text-xs"
          onClick={() => onCopyValue(run.worktreePath!, "Worktree path copied")}
        >
          <FileText className="h-3.5 w-3.5" />
          Copy Worktree Path
        </Button>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-8 w-full gap-2 text-xs"
        onClick={() => onCopyDiagnostics(run.id)}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy Diagnostics
      </Button>

      <details className="mt-3 rounded-md border border-black/10 bg-secondary/30 p-2 text-xs dark:border-white/10">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase text-muted-foreground">
          Advanced Trace Fallback
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-5 text-muted-foreground">
            DevDeck-launched agents capture traces automatically. Use these only to recover or inspect a run manually.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full gap-2 text-xs"
            onClick={() => onCopyTraceAppendCommand(run.id)}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Trace Append Command
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full gap-2 text-xs"
            onClick={() => onCopyTraceContract(run.id)}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Trace Contract
          </Button>
        </div>
      </details>
    </aside>
  );
}

export default function Agents() {
  const desktopApi = getDesktopApi();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const {
    availability: codingToolAvailability,
    openPreferredTool,
    preferredToolShortLabel,
  } = useCodingTool();
  const workspaceSelection = useWorkspaceSelection();
  const { data: workspaceSnapshot } = useWorkspaceSnapshot();
  const { data, error, isFetching, isLoading, refetch } = useAgentHarness();
  const [favouriteAgentIds, setFavouriteAgentIds] = usePersistentState<string[]>(
    FAVOURITE_AGENTS_STORAGE_KEY,
    [],
  );
  const favouriteAgentIdSet = useMemo(
    () => new Set(favouriteAgentIds),
    [favouriteAgentIds],
  );
  const [dismissedSourceErrorKeys, setDismissedSourceErrorKeys] =
    usePersistentState<string[]>(DISMISSED_SOURCE_ERRORS_STORAGE_KEY, []);
  const dismissedSourceErrorKeySet = useMemo(
    () => new Set(dismissedSourceErrorKeys),
    [dismissedSourceErrorKeys],
  );
  // Collapsed by default so a noisy harness (many unparseable source
  // files) doesn't push the agent list below the fold — expand on demand.
  const [sourceErrorsExpanded, setSourceErrorsExpanded] = useState(false);
  const [agentRuns, setAgentRuns, { error: agentRunStorageError }] =
    useAgentRunsState();
  const [
    tokenUsageEvents,
    setTokenUsageEvents,
    { error: tokenUsageStorageError },
  ] = useTokenUsageEventsState();
  const [
    taskTraceEntries,
    setTaskTraceEntries,
    { error: taskTraceStorageError },
  ] = useTaskTraceEntriesState();
  const [query, setQuery] = useState("");
  // Empty selection means "All Projects" — everything matches.
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const projectFilterKey = [...projectFilter].sort().join(",");
  const [timeRangeRaw, setTimeRange] = usePersistentState<TimeRangeValue>(
    TIME_RANGE_STORAGE_KEY,
    DEFAULT_TIME_RANGE,
  );
  const timeRange: TimeRangeValue = isValidTimeRange(timeRangeRaw)
    ? timeRangeRaw
    : DEFAULT_TIME_RANGE;
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowDefinition | null>(null);
  const [usageIngestionError, setUsageIngestionError] = useState<string | null>(null);
  const [usageSyncedAt, setUsageSyncedAt] = useState<string | null>(null);
  const [traceIngestionError, setTraceIngestionError] = useState<string | null>(null);
  const [traceIngestionSummary, setTraceIngestionSummary] = useState<{
    filesScanned: number;
    newEntryCount: number;
    rejectedCount: number;
  } | null>(null);
  const [traceIngestionSyncedAt, setTraceIngestionSyncedAt] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const telemetryStorageError =
    agentRunStorageError ?? tokenUsageStorageError ?? taskTraceStorageError;

  const agents = data?.agents ?? [];
  const workflows = data?.workflows ?? [];
  const sources = data?.sources ?? [];
  const sourceErrors = sources.filter((source) => source.errors.length > 0);
  const visibleSourceErrors = useMemo(
    () =>
      sourceErrors.filter(
        (source) =>
          !dismissedSourceErrorKeySet.has(
            buildSourceErrorKey(source.sourcePath, source.errors),
          ),
      ),
    [dismissedSourceErrorKeySet, sourceErrors],
  );

  const agentRunsRef = useRef(agentRuns);
  const agentsRef = useRef(agents);
  const workflowsRef = useRef(workflows);
  const workspaceProjectsRefInit = useMemo(
    () =>
      (workspaceSnapshot?.projects ?? []).map((project) => ({
        id: project.id,
        localPath: project.localPath ?? null,
      })),
    [workspaceSnapshot?.projects],
  );
  const workspaceProjectsRef = useRef(workspaceProjectsRefInit);
  const workspaceSelectionRef = useRef(workspaceSelection);
  useEffect(() => {
    agentRunsRef.current = agentRuns;
  }, [agentRuns]);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);
  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);
  useEffect(() => {
    workspaceProjectsRef.current = workspaceProjectsRefInit;
  }, [workspaceProjectsRefInit]);
  useEffect(() => {
    workspaceSelectionRef.current = workspaceSelection;
  }, [workspaceSelection]);
  // Time-range filter. Recomputing the cutoff on every render would
  // invalidate the filter memos and every downstream memo (productivity
  // insights, handoff health, run rollups) even when telemetry inputs
  // are unchanged. Cache the cutoff in state and refresh it on the
  // range change plus a 60s tick, so "Last 24 hours" still tracks the
  // clock without churning memos on unrelated rerenders.
  const [timeRangeCutoffMs, setTimeRangeCutoffMs] = useState<number | null>(
    () => getTimeRangeCutoffMs(timeRange),
  );
  useEffect(() => {
    setTimeRangeCutoffMs(getTimeRangeCutoffMs(timeRange));
    if (timeRange === "all") {
      return;
    }
    const interval = window.setInterval(() => {
      setTimeRangeCutoffMs(getTimeRangeCutoffMs(timeRange));
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [timeRange]);
  const timeFilteredAgentRuns = useMemo(() => {
    if (timeRangeCutoffMs === null) {
      return agentRuns;
    }
    return agentRuns.filter((run) => {
      // Unfinished runs (active/blocked/paused) bypass the cutoff so a
      // long-running job that started before the window doesn't vanish
      // from the list and status totals as time passes.
      if (
        !run.endedAt &&
        (run.status === "active" ||
          run.status === "blocked" ||
          run.status === "paused")
      ) {
        return true;
      }
      // For finished runs prefer endedAt; fall back to startedAt.
      const anchor = run.endedAt ?? run.startedAt;
      const parsed = new Date(anchor).getTime();
      return Number.isFinite(parsed) && parsed >= timeRangeCutoffMs;
    });
  }, [agentRuns, timeRangeCutoffMs]);
  const timeFilteredTokenUsageEvents = useMemo(() => {
    if (timeRangeCutoffMs === null) {
      return tokenUsageEvents;
    }
    return tokenUsageEvents.filter((event) => {
      const parsed = new Date(event.createdAt).getTime();
      return Number.isFinite(parsed) && parsed >= timeRangeCutoffMs;
    });
  }, [tokenUsageEvents, timeRangeCutoffMs]);
  const timeFilteredTaskTraceEntries = useMemo(() => {
    if (timeRangeCutoffMs === null) {
      return taskTraceEntries;
    }
    return taskTraceEntries.filter((entry) => {
      const parsed = new Date(entry.createdAt).getTime();
      return Number.isFinite(parsed) && parsed >= timeRangeCutoffMs;
    });
  }, [taskTraceEntries, timeRangeCutoffMs]);
  const runStatusSummary = useMemo(
    () => summarizeAgentRunsByStatus(timeFilteredAgentRuns),
    [timeFilteredAgentRuns],
  );
  const visibleAgentRuns = useMemo(
    () =>
      timeFilteredAgentRuns
        .filter((run) => {
          const matchesProject =
            projectFilter.length === 0 ||
            projectFilter.includes(
              agents.find((agent) => agent.id === run.agentId)?.projectName ?? "",
            );
          const matchesQuery =
            normalizedQuery.length === 0 ||
            [
              run.taskTitle,
              run.branchName ?? "",
              run.worktreePath ?? "",
              run.status,
              agents.find((agent) => agent.id === run.agentId)?.name ?? "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery);

          return matchesProject && matchesQuery;
        }),
    [timeFilteredAgentRuns, agents, normalizedQuery, projectFilter],
  );
  const agentRunsPagination = usePagination(
    visibleAgentRuns,
    AGENT_RUNS_PAGE_SIZE,
    {
      resetKey: `${projectFilterKey}:${normalizedQuery}:${timeRange}`,
      storageKey: "devdeck:agents:runs-pagination",
    },
  );
  const sourcesPagination = usePagination(sources, HARNESS_SOURCES_PAGE_SIZE, {
    resetKey: sources.length,
    storageKey: "devdeck:agents:sources-pagination",
  });
  const tokenUsageSummaries = useMemo(
    () => summarizeTokenUsageByAgent(timeFilteredTokenUsageEvents),
    [timeFilteredTokenUsageEvents],
  );
  const tokenUsageByAgent = useMemo(
    () =>
      new Map(
        tokenUsageSummaries.map((summary) => [
          summary.agentId ?? "unassigned",
          summary,
        ]),
      ),
    [tokenUsageSummaries],
  );
  const tokenUsageTotal = useMemo(
    () => getTokenUsageSummaryTotal(tokenUsageSummaries),
    [tokenUsageSummaries],
  );
  const tokenUsageByRunId = useMemo(
    () =>
      new Map(
        timeFilteredAgentRuns.map((run) => [
          run.id,
          summarizeTokenUsageForAgentRun(timeFilteredTokenUsageEvents, run),
        ]),
      ),
    [timeFilteredAgentRuns, timeFilteredTokenUsageEvents],
  );
  const productivityInsights = useMemo(
    () =>
      buildAgentProductivityInsights({
        agents,
        agentRuns: timeFilteredAgentRuns,
        taskTraceEntries: timeFilteredTaskTraceEntries,
        tokenUsageEvents: timeFilteredTokenUsageEvents,
        workflows,
      }),
    [
      agents,
      timeFilteredAgentRuns,
      timeFilteredTaskTraceEntries,
      timeFilteredTokenUsageEvents,
      workflows,
    ],
  );
  const harnessQualityReport = useMemo(
    () =>
      buildAgentHarnessQualityReport({
        agents,
        sources,
        workflows,
      }),
    [agents, sources, workflows],
  );
  const handoffHealth = useMemo(
    () =>
      summarizeWorkflowHandoffHealth({
        agentRuns: timeFilteredAgentRuns,
        taskTraceEntries: timeFilteredTaskTraceEntries,
        workflows,
      }),
    [timeFilteredAgentRuns, timeFilteredTaskTraceEntries, workflows],
  );
  const projectOptions = useMemo(
    () => uniqueValues(agents.map((agent) => agent.projectName)),
    [agents],
  );
  const automationStatusCards = useMemo(
    () => [
      {
        detail:
          workflows.length > 0
            ? `${workflows.length} workflows discovered from local harness files.`
            : "Add workflows to make agent handoffs more predictable.",
        icon: Bot,
        label: "Harness",
        tone: agents.length > 0 ? ("green" as const) : ("amber" as const),
        value:
          agents.length > 0
            ? `${agents.length} ${agents.length === 1 ? "agent" : "agents"}`
            : "No agents",
      },
      {
        detail: codingToolAvailability.opencode.available
          ? "Project launches create the worktree, agent run, trace capture, and token budget automatically."
          : codingToolAvailability.opencode.reason ??
            "Install OpenCode to enable automatic project launches.",
        icon: Sparkles,
        label: "OpenCode Launch",
        tone: codingToolAvailability.opencode.available
          ? ("green" as const)
          : ("amber" as const),
        value: codingToolAvailability.opencode.available ? "Ready" : "CLI offline",
      },
      {
        detail: usageIngestionError
          ? usageIngestionError
          : usageSyncedAt
            ? `Last usage sync ${new Date(usageSyncedAt).toLocaleTimeString()}.`
            : "OpenCode token records will be linked by project, run, and agent when available.",
        icon: Gauge,
        label: "Usage Sync",
        tone: usageIngestionError
          ? ("red" as const)
          : usageSyncedAt
            ? ("green" as const)
            : ("blue" as const),
        value: usageIngestionError
          ? "Needs attention"
          : usageSyncedAt
            ? "Synced"
            : "Listening",
      },
      {
        detail: traceIngestionError
          ? traceIngestionError
          : traceIngestionSyncedAt
            ? `${traceIngestionSummary?.newEntryCount ?? 0} new entries, ${
                traceIngestionSummary?.rejectedCount ?? 0
              } rejected.`
            : `Watching ${DEVDECK_TRACE_DIRECTORY} for DevDeck-launched runs.`,
        icon: ClipboardList,
        label: "Trace Capture",
        tone: traceIngestionError
          ? ("red" as const)
          : traceIngestionSyncedAt
            ? ("green" as const)
            : ("blue" as const),
        value: traceIngestionError
          ? "Needs attention"
          : traceIngestionSyncedAt
            ? `${traceIngestionSummary?.filesScanned ?? 0} files`
            : "Automatic",
      },
    ],
    [
      agents.length,
      codingToolAvailability.opencode.available,
      codingToolAvailability.opencode.reason,
      traceIngestionError,
      traceIngestionSummary?.filesScanned,
      traceIngestionSummary?.newEntryCount,
      traceIngestionSummary?.rejectedCount,
      traceIngestionSyncedAt,
      usageIngestionError,
      usageSyncedAt,
      workflows.length,
    ],
  );

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        const matchesProject =
          projectFilter.length === 0 ||
          projectFilter.includes(getProjectLabel(agent.projectName));
        const matchesQuery =
          normalizedQuery.length === 0 ||
          [
            agent.name,
            agent.description ?? "",
            agent.projectName ?? "",
            agent.sourcePath,
            ...agent.responsibilities,
            ...agent.boundaries,
            ...agent.defaultTools,
            ...agent.defaultSkills,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

        return matchesProject && matchesQuery;
      }),
    [agents, normalizedQuery, projectFilter],
  );
  const sortedAgents = useMemo(
    () =>
      [...filteredAgents].sort((left, right) => {
        const leftFavourite = favouriteAgentIdSet.has(left.id) ? 0 : 1;
        const rightFavourite = favouriteAgentIdSet.has(right.id) ? 0 : 1;
        if (leftFavourite !== rightFavourite) {
          return leftFavourite - rightFavourite;
        }
        return left.name.localeCompare(right.name);
      }),
    [favouriteAgentIdSet, filteredAgents],
  );
  const agentsPagination = usePagination(sortedAgents, AGENTS_PAGE_SIZE, {
    resetKey: `${projectFilterKey}:${normalizedQuery}`,
    storageKey: "devdeck:agents:list-pagination",
  });
  const toggleFavouriteAgent = useCallback(
    (agentId: string) => {
      setFavouriteAgentIds((current) =>
        current.includes(agentId)
          ? current.filter((id) => id !== agentId)
          : [...current, agentId],
      );
    },
    [setFavouriteAgentIds],
  );

  const runOpenCodeUsageSync = useCallback(async () => {
    if (!desktopApi?.listOpenCodeUsageRecords) {
      return;
    }

    try {
      const records = await desktopApi.listOpenCodeUsageRecords();
      const currentRuns = normalizeAgentRuns(agentRunsRef.current);
      const linkedRuns = linkAgentRunsToOpenCodeUsageRecords(
        currentRuns,
        records,
      );
      const synthesized = synthesizeAgentRunsFromOpenCodeRecords(records, {
        agents: agentsRef.current,
        existingRuns: linkedRuns,
        projects: workspaceProjectsRef.current,
        workflows: workflowsRef.current,
      });
      const nextRuns = mergeAgentRuns(linkedRuns, synthesized);
      const linksChanged = haveAgentRunLinksChanged(currentRuns, linkedRuns);
      if (linksChanged || synthesized.length > 0) {
        setAgentRuns(nextRuns);
      }

      const events = buildTokenUsageEventsFromOpenCodeRecords(
        records,
        nextRuns,
        agentsRef.current,
      );
      if (events.length > 0) {
        setTokenUsageEvents((currentEvents) =>
          mergeTokenUsageEvents(currentEvents, events).slice(0, 10_000),
        );
      }
      setUsageIngestionError(null);
      setUsageSyncedAt(new Date().toISOString());
    } catch (nextError) {
      setUsageIngestionError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    }
  }, [desktopApi, setAgentRuns, setTokenUsageEvents]);

  const runTaskTraceIngestion = useCallback(async () => {
    if (!desktopApi?.ingestAgentTaskTraces) {
      return;
    }

    try {
      const result = await desktopApi.ingestAgentTaskTraces({
        selection: workspaceSelectionRef.current,
      });
      setTaskTraceEntries((currentEntries) => {
        if (
          result.newEntryCount === 0 &&
          result.taskTraceEntries.length === currentEntries.length
        ) {
          return currentEntries;
        }

        return result.taskTraceEntries;
      });
      const firstFileError =
        result.fileResults.find((fileResult) => fileResult.error)?.error ?? null;
      setTraceIngestionError(
        firstFileError
          ? `${result.errorCount} trace file issue${
              result.errorCount === 1 ? "" : "s"
            }: ${firstFileError}`
          : null,
      );
      setTraceIngestionSummary({
        filesScanned: result.filesScanned,
        newEntryCount: result.newEntryCount,
        rejectedCount: result.rejectedCount,
      });
      setTraceIngestionSyncedAt(new Date().toISOString());
    } catch (nextError) {
      setTraceIngestionError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    }
  }, [desktopApi, setTaskTraceEntries]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        runOpenCodeUsageSync(),
        runTaskTraceIngestion(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, runOpenCodeUsageSync, runTaskTraceIngestion]);

  const hasRunMountRefreshRef = useRef(false);
  useEffect(() => {
    if (hasRunMountRefreshRef.current) {
      return;
    }
    hasRunMountRefreshRef.current = true;
    void runOpenCodeUsageSync();
    void runTaskTraceIngestion();
  }, [runOpenCodeUsageSync, runTaskTraceIngestion]);

  // Keep task-trace ingestion running periodically so long-lived Agents
  // pages pick up new JSONL entries appended by active agents without
  // requiring a manual refresh (the "Watching" banner would otherwise lie).
  useEffect(() => {
    if (!desktopApi?.ingestAgentTaskTraces) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void runTaskTraceIngestion();
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [desktopApi, runTaskTraceIngestion]);

  useEffect(() => {
    if (visibleAgentRuns.length === 0) {
      if (selectedRunId) {
        setSelectedRunId(null);
      }
      return;
    }

    if (!selectedRunId || !visibleAgentRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(visibleAgentRuns[0]?.id ?? null);
    }
  }, [selectedRunId, visibleAgentRuns]);

  const handleRevealSource = async (sourcePath: string) => {
    try {
      await desktopApi?.showItemInFinder(sourcePath);
    } catch (nextError) {
      toast({
        title: "Could not reveal source",
        description:
          nextError instanceof Error ? nextError.message : String(nextError),
        variant: "destructive",
      });
    }
  };

  const handleOpenSource = async (sourcePath: string) => {
    await openPreferredTool(sourcePath);
  };

  const handleCopyValue = async (
    value: string,
    title: string,
    description = value,
  ) => {
    try {
      if (desktopApi?.copyToClipboard) {
        await desktopApi.copyToClipboard(value);
      } else {
        await navigator.clipboard.writeText(value);
      }
      toast({
        title,
        description,
      });
    } catch (nextError) {
      toast({
        title: "Copy failed",
        description:
          nextError instanceof Error ? nextError.message : String(nextError),
        variant: "destructive",
      });
    }
  };

  const handleCopySourcePath = async (sourcePath: string) => {
    await handleCopyValue(sourcePath, "Source path copied");
  };

  const handleCopyAgentBrief = async (agent: AgentDefinition) => {
    await handleCopyValue(
      buildAgentBriefText(agent),
      "Agent brief copied",
      `${agent.name} brief is on the clipboard`,
    );
  };

  const buildTelemetryExportPayload = async () => {
    let storeUpdatedAt: string | null = null;

    if (desktopApi?.getAgentTelemetry) {
      const snapshot = await desktopApi.getAgentTelemetry();
      storeUpdatedAt = snapshot.updatedAt;
    }

    return buildAgentTelemetryExport({
      agents,
      agentRuns,
      now: new Date(),
      sources,
      storeUpdatedAt,
      taskTraceEntries,
      tokenUsageEvents,
      workflows,
    });
  };

  const handleExportTelemetryJson = async () => {
    try {
      const payload = await buildTelemetryExportPayload();
      downloadTextFile(
        `devdeck-agent-telemetry-${getExportTimestamp()}.json`,
        `${JSON.stringify(payload, null, 2)}\n`,
        "application/json;charset=utf-8",
      );
      toast({
        title: "Telemetry JSON exported",
        description: `${payload.telemetry.agentRuns.length} runs included`,
      });
    } catch (nextError) {
      toast({
        title: "JSON export failed",
        description:
          nextError instanceof Error ? nextError.message : String(nextError),
        variant: "destructive",
      });
    }
  };

  const handleExportTelemetryCsv = () => {
    try {
      const csv = serializeAgentTelemetryCsv({
        agents,
        agentRuns,
        now: new Date(),
        tokenUsageEvents,
        workflows,
      });
      downloadTextFile(
        `devdeck-agent-runs-${getExportTimestamp()}.csv`,
        `${csv}\n`,
        "text/csv;charset=utf-8",
      );
      toast({
        title: "Telemetry CSV exported",
        description: `${agentRuns.length} runs included`,
      });
    } catch (nextError) {
      toast({
        title: "CSV export failed",
        description:
          nextError instanceof Error ? nextError.message : String(nextError),
        variant: "destructive",
      });
    }
  };

  const handleExportTraceCsv = () => {
    try {
      const csv = serializeTaskTraceEntriesCsv({
        agentRuns,
        agents,
        taskTraceEntries,
      });
      downloadTextFile(
        `devdeck-agent-traces-${getExportTimestamp()}.csv`,
        `${csv}\n`,
        "text/csv;charset=utf-8",
      );
      toast({
        title: "Trace CSV exported",
        description: `${taskTraceEntries.length} trace entries included`,
      });
    } catch (nextError) {
      toast({
        title: "Trace CSV export failed",
        description:
          nextError instanceof Error ? nextError.message : String(nextError),
        variant: "destructive",
      });
    }
  };

  const handleResetTelemetry = async () => {
    const confirmed = window.confirm(
      "Reset agent telemetry history? This clears agent runs, token usage, and task traces.",
    );
    if (!confirmed) {
      return;
    }

    try {
      await Promise.all([
        desktopApi?.saveAgentRuns?.([]),
        desktopApi?.saveTokenUsageEvents?.([]),
        desktopApi?.saveTaskTraceEntries?.([]),
      ]);
      setAgentRuns([]);
      setTokenUsageEvents([]);
      setTaskTraceEntries([]);
      setSelectedRunId(null);
      setUsageSyncedAt(null);
      setUsageIngestionError(null);
      toast({
        title: "Telemetry reset",
        description: "Agent runs, token usage, and task traces were cleared",
      });
    } catch (nextError) {
      toast({
        title: "Telemetry reset failed",
        description:
          nextError instanceof Error ? nextError.message : String(nextError),
        variant: "destructive",
      });
    }
  };

  const handleCopyRunDiagnostics = async (runId: string) => {
    const runInsight = productivityInsights.runInsights.find(
      (candidate) => candidate.run.id === runId,
    );
    if (!runInsight) {
      return;
    }

    await handleCopyValue(
      buildRunDiagnosticsText(runInsight),
      "Run diagnostics copied",
      `${runInsight.run.taskTitle} diagnostics are on the clipboard`,
    );
  };

  const handleCopyTraceContract = async (runId: string) => {
    const run = agentRuns.find((candidate) => candidate.id === runId) ?? null;
    if (!run) {
      return;
    }

    const agent = run.agentId
      ? agents.find((candidate) => candidate.id === run.agentId) ?? null
      : null;
    const workflow = run.workflowRunId
      ? workflows.find((candidate) => candidate.id === run.workflowRunId) ?? null
      : null;

    await handleCopyValue(
      buildTaskTraceContractText({
        agent,
        run,
        tracePath: run.worktreePath ? buildAgentRunTracePath(run.worktreePath, run.id) : null,
        workflow,
      }),
      "Trace contract copied",
      `${run.taskTitle} trace contract is on the clipboard`,
    );
  };

  const handleCopyTraceAppendCommand = async (runId: string) => {
    const run = agentRuns.find((candidate) => candidate.id === runId) ?? null;
    if (!run) {
      return;
    }

    await handleCopyValue(
      buildTaskTraceAppendCommandText({
        runId: run.id,
        tracePath: run.worktreePath ? buildAgentRunTracePath(run.worktreePath, run.id) : null,
      }),
      "Trace append command copied",
      `${run.taskTitle} trace append command is on the clipboard`,
    );
  };

  const handleStartHandoff = (run: AgentRun, step: AgentRunHandoffStep) => {
    if (!step.agentId) {
      return;
    }
    if (!run.projectId) {
      toast({
        title: "Cannot start handoff",
        description: "This run is not linked to a tracked project.",
        variant: "destructive",
      });
      return;
    }

    const targetAgent =
      agents.find((candidate) => candidate.id === step.agentId) ?? null;
    const targetTraces = getTaskTraceEntriesForRun(taskTraceEntries, run.id).filter(
      (entry) => entry.handoffTargetAgentId === step.agentId,
    );
    const latestTargetTrace = targetTraces[targetTraces.length - 1] ?? null;
    const taskTitle =
      latestTargetTrace?.nextAction ??
      `Continue ${run.taskTitle} with ${targetAgent?.name ?? step.agentName}`;

    navigateInApp(
      buildAgentHandoffLaunchPath({
        agentId: step.agentId,
        baseRef: run.branchName,
        branchName: buildDefaultHandoffBranchName({
          agentId: step.agentId,
          sourceBranchName: run.branchName,
          sourceRunId: run.id,
        }),
        projectId: run.projectId,
        sourceRunId: run.id,
        taskTitle,
        workflowId: run.workflowRunId,
      }),
      setLocation,
    );
    toast({
      title: "Handoff staged",
      description: `${targetAgent?.name ?? step.agentName} is preselected in the OpenCode launcher.`,
    });
  };

  const handleRunStatusChange = (runId: string, status: AgentRunStatus) => {
    setAgentRuns((currentRuns) =>
      updateAgentRunStatus(normalizeAgentRuns(currentRuns), runId, status),
    );
  };
  const selectedRun =
    selectedRunId ? agentRuns.find((run) => run.id === selectedRunId) ?? null : null;
  const selectedRunUsage = selectedRun
    ? tokenUsageByRunId.get(selectedRun.id) ?? null
    : null;
  const selectedRunTraceEntries = selectedRun
    ? getTaskTraceEntriesForRun(taskTraceEntries, selectedRun.id)
    : [];
  const selectedRunWorkflow = selectedRun?.workflowRunId
    ? workflows.find((workflow) => workflow.id === selectedRun.workflowRunId) ?? null
    : null;
  const selectedRunHandoffSteps = selectedRun
    ? buildAgentRunHandoffSteps({
        agents,
        run: selectedRun,
        taskTraceEntries,
        workflow: selectedRunWorkflow,
      })
    : [];

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Agent Registry
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Imported agent responsibilities, tools, skills, and workflow definitions from local harness files.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void handleRefreshAll()}
              disabled={isFetching || isRefreshing}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  (isFetching || isRefreshing) && "animate-spin",
                )}
              />
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  aria-label="Data tools"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Data
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => void handleExportTelemetryJson()}>
                  <Download className="h-3.5 w-3.5" />
                  Export telemetry JSON
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportTelemetryCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Export runs CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportTraceCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Export traces CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={
                    agentRuns.length === 0 &&
                    tokenUsageEvents.length === 0 &&
                    taskTraceEntries.length === 0
                  }
                  onSelect={() => void handleResetTelemetry()}
                  className="text-destructive focus:text-destructive"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset telemetry
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: "Agents", value: agents.length, icon: Bot },
            { label: "Active Runs", value: runStatusSummary.active, icon: Sparkles },
            { label: "Blocked", value: runStatusSummary.blocked, icon: AlertTriangle },
            { label: "Workflows", value: workflows.length, icon: Workflow },
            {
              label: "Tokens Used",
              value: formatTokenCount(tokenUsageTotal.totalTokens),
              icon: Sparkles,
            },
            {
              label: "Est. Cost",
              value: formatEstimatedCost(tokenUsageTotal.estimatedCost),
              icon: ShieldCheck,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-[#1d1d1f]/75"
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <item.icon className="h-3.5 w-3.5 text-primary" />
                {item.label}
              </div>
              <p className="mt-2 text-xl font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-stretch">
          {automationStatusCards.map((card) => (
            <AutomationStatusCard
              key={card.label}
              detail={card.detail}
              icon={card.icon}
              label={card.label}
              tone={card.tone}
              value={card.value}
            />
          ))}
          <Button
            type="button"
            className="h-full min-h-20 gap-2 px-4 text-xs lg:w-36"
            onClick={() => navigateInApp(buildCreateSessionPath(), setLocation)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Start OpenCode
          </Button>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents, responsibilities, tools, skills, or source paths"
              className="h-9 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/50 dark:border-white/10 dark:bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={timeRange}
              onValueChange={(value) => {
                if (isValidTimeRange(value)) {
                  setTimeRange(value);
                }
              }}
            >
              <SelectTrigger
                className="h-9 w-[160px] border-black/10 bg-white text-xs dark:border-white/10 dark:bg-background"
                aria-label="Time range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-xs"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
                  projectFilter.length > 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-black/10 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-background",
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                {projectFilter.length === 0
                  ? "All Projects"
                  : projectFilter.length === 1
                    ? projectFilter[0]
                    : `${projectFilter.length} Projects`}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onSelect={() => setProjectFilter([])}>
                All Projects
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {projectOptions.map((projectName) => {
                const selected = projectFilter.includes(projectName);
                return (
                  <DropdownMenuCheckboxItem
                    key={projectName}
                    checked={selected}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) =>
                      setProjectFilter((current) =>
                        checked
                          ? [...current, projectName]
                          : current.filter((name) => name !== projectName),
                      )
                    }
                  >
                    {projectName}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </section>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </div>
        ) : null}

        {visibleSourceErrors.length > 0 ? (
          <section className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
            <button
              type="button"
              onClick={() => setSourceErrorsExpanded((current) => !current)}
              className="flex w-full items-center gap-2 p-3 text-left text-xs"
              aria-expanded={sourceErrorsExpanded}
            >
              {sourceErrorsExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-semibold">
                {visibleSourceErrors.length} harness source{" "}
                {visibleSourceErrors.length === 1 ? "warning" : "warnings"}
              </span>
            </button>
            {sourceErrorsExpanded ? (
              <div className="space-y-2 border-t border-amber-200 p-3 pt-2 dark:border-amber-900/50">
                {visibleSourceErrors.map((source) => {
                  const dismissKey = buildSourceErrorKey(
                    source.sourcePath,
                    source.errors,
                  );
                  return (
                    <div
                      key={source.sourcePath}
                      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white/60 p-3 text-xs dark:border-amber-900/50 dark:bg-white/5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{formatSourceName(source.sourcePath)}</p>
                        <p className="mt-1 break-words">{source.errors.join(" ")}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-amber-900 hover:text-amber-950 dark:text-amber-200"
                        onClick={() =>
                          setDismissedSourceErrorKeys((current) =>
                            current.includes(dismissKey)
                              ? current
                              : [...current, dismissKey],
                          )
                        }
                        title="Dismiss warning"
                        aria-label="Dismiss warning"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        <HarnessQualitySection report={harnessQualityReport} />

        <ProductivityInsightsSection
          handoffHealth={handoffHealth}
          insights={productivityInsights}
        />

        {isLoading ? (
          <div className="rounded-lg border border-dashed border-black/10 p-10 text-center text-sm text-muted-foreground dark:border-white/10">
            Scanning local harness files...
          </div>
        ) : sortedAgents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/10 bg-white/45 p-10 text-center dark:border-white/10 dark:bg-white/5">
            <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold text-foreground">No agents found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              DevDeck scans for `AGENTS.md`, `agents.json`, `.opencode/*`, and `.codex/*` harness files in connected projects.
            </p>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {agentsPagination.paginatedItems.map((agent) => (
                <AgentCard
                  key={`${agent.sourcePath}:${agent.id}`}
                  agent={agent}
                  isFavourite={favouriteAgentIdSet.has(agent.id)}
                  onCopyBrief={handleCopyAgentBrief}
                  onOpenSource={handleOpenSource}
                  onRevealSource={handleRevealSource}
                  onToggleFavourite={toggleFavouriteAgent}
                  tokenUsage={tokenUsageByAgent.get(agent.id) ?? null}
                />
              ))}
            </section>
            <PaginationControls
              currentPage={agentsPagination.currentPage}
              onPageChange={agentsPagination.setCurrentPage}
              pageSize={agentsPagination.pageSize}
              totalItems={agentsPagination.totalItems}
              label="agents"
            />
          </>
        )}

        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Agent Runs</h2>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {traceIngestionError
                ? `Trace ingest warning: ${traceIngestionError}`
                : traceIngestionSyncedAt
                  ? `Watching ${DEVDECK_TRACE_DIRECTORY}: ${
                      traceIngestionSummary?.filesScanned ?? 0
                    } files scanned, ${
                      traceIngestionSummary?.newEntryCount ?? 0
                    } new, ${
                      traceIngestionSummary?.rejectedCount ?? 0
                    } rejected`
                  : desktopApi?.ingestAgentTaskTraces
                    ? `Watching ${DEVDECK_TRACE_DIRECTORY} for JSONL traces`
                    : "Automatic trace ingest requires the desktop app"}
            </p>
          </div>
          {visibleAgentRuns.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-2">
                {agentRunsPagination.paginatedItems.map((run) => (
                  <AgentRunRow
                    key={run.id}
                    agents={agents}
                    isSelected={selectedRunId === run.id}
                    workflows={workflows}
                    run={run}
                    usage={
                      tokenUsageByRunId.get(run.id) ??
                      summarizeTokenUsageForAgentRun([], run)
                    }
                    onSelect={setSelectedRunId}
                    onStatusChange={handleRunStatusChange}
                  />
                ))}
                <PaginationControls
                  currentPage={agentRunsPagination.currentPage}
                  onPageChange={agentRunsPagination.setCurrentPage}
                  pageSize={agentRunsPagination.pageSize}
                  totalItems={agentRunsPagination.totalItems}
                  label="runs"
                />
              </div>
              <AgentRunDetail
                agents={agents}
                handoffSteps={selectedRunHandoffSteps}
                workflows={workflows}
                run={selectedRun}
                traceEntries={selectedRunTraceEntries}
                usage={selectedRunUsage}
                onCopyDiagnostics={handleCopyRunDiagnostics}
                onCopyTraceAppendCommand={handleCopyTraceAppendCommand}
                onCopyTraceContract={handleCopyTraceContract}
                onCopyValue={handleCopyValue}
                onStartHandoff={handleStartHandoff}
                onStatusChange={handleRunStatusChange}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/10 p-5 text-sm text-muted-foreground dark:border-white/10">
              No agent runs have been recorded yet. Launch OpenCode from Terminals with an agent selected to populate this history.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Token Usage by Agent</h2>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {telemetryStorageError
                ? `History sync failed: ${telemetryStorageError}`
                : usageIngestionError
                ? `OpenCode sync failed: ${usageIngestionError}`
                : usageSyncedAt
                  ? `OpenCode usage synced ${new Date(usageSyncedAt).toLocaleTimeString()}`
                  : "Waiting for OpenCode usage sync"}
            </p>
          </div>
          {tokenUsageSummaries.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b border-black/10 bg-secondary/50 text-[10px] uppercase text-muted-foreground dark:border-white/10">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Agent</th>
                    <th className="px-3 py-2 font-semibold">Events</th>
                    <th className="px-3 py-2 font-semibold">Input</th>
                    <th className="px-3 py-2 font-semibold">Output</th>
                    <th className="px-3 py-2 font-semibold">Reasoning</th>
                    <th className="px-3 py-2 font-semibold">Cache</th>
                    <th className="px-3 py-2 font-semibold">Tools</th>
                    <th className="px-3 py-2 font-semibold">Total</th>
                    <th className="px-3 py-2 font-semibold">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white/70 dark:divide-white/10 dark:bg-white/5">
                  {tokenUsageSummaries.map((summary) => {
                    const agent = summary.agentId
                      ? agents.find((candidate) => candidate.id === summary.agentId)
                      : null;
                    // Prefer the resolved agent name; when the summary
                    // couldn't be matched to a DevDeck agent, show the
                    // model name (bucketed per model by the summarizer)
                    // instead of collapsing every model into "Unassigned".
                    const label =
                      agent?.name ??
                      (summary.model ? summary.model : "Unassigned");
                    const rowKey =
                      summary.agentId ??
                      (summary.model ? `model:${summary.model}` : "unassigned");
                    return (
                      <tr key={rowKey}>
                        <td className="px-3 py-2 font-medium text-foreground">
                          <div className="flex flex-col">
                            <span>{label}</span>
                            {!agent && summary.model ? (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                model
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{summary.eventCount}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatTokenCount(summary.inputTokens)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatTokenCount(summary.outputTokens)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatTokenCount(summary.reasoningTokens)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatTokenCount(summary.cacheReadTokens + summary.cacheWriteTokens)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatTokenCount(summary.toolCallTokens)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-foreground">
                          {formatTokenCount(summary.totalTokens)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-foreground">
                          {formatEstimatedCost(summary.estimatedCost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/10 p-5 text-sm text-muted-foreground dark:border-white/10">
              No token usage events have been recorded yet. Provider or OpenCode ingestion can attach events to these agent IDs.
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Workflow Definitions</h2>
            </div>
            {workflows.length > 0 ? (
              <div className="space-y-2">
                {workflows.map((workflow) => (
                  <WorkflowRow
                    key={`${workflow.sourcePath}:${workflow.id}`}
                    workflow={workflow}
                    onSelect={setSelectedWorkflow}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-dashed border-black/10 p-5 text-sm text-muted-foreground dark:border-white/10">
                <p className="text-foreground">
                  No workflow definitions were imported yet.
                </p>
                <p className="leading-6">
                  Workflows describe the ordered agent handoffs a task should
                  follow (for example, <em>planner → coder → reviewer</em>).
                  DevDeck reads them from harness files inside each project.
                </p>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-foreground/80">
                    Where to add one
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-6">
                    <li>
                      <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">
                        .opencode/workflows.json
                      </code>{" "}
                      or{" "}
                      <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">
                        .opencode/harness.json
                      </code>{" "}
                      with a{" "}
                      <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">
                        workflows
                      </code>{" "}
                      array
                    </li>
                    <li>
                      <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">
                        agents.json
                      </code>{" "}
                      with a top-level{" "}
                      <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">
                        workflows
                      </code>{" "}
                      field
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-foreground/80">
                    Minimal shape
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-secondary/60 p-2 text-[11px] leading-5 text-foreground">
{`{
  "workflows": [
    {
      "id": "review-loop",
      "name": "Review Loop",
      "steps": [
        { "id": "plan",   "name": "Plan",   "agentId": "planner",  "nextStepIds": ["build"] },
        { "id": "build",  "name": "Build",  "agentId": "coder",    "nextStepIds": ["review"] },
        { "id": "review", "name": "Review", "agentId": "reviewer" }
      ]
    }
  ]
}`}
                  </pre>
                </div>
                <p className="text-xs">
                  After saving, click Refresh to re-scan.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Harness Sources</h2>
            </div>
            <div className="space-y-2">
              {sourcesPagination.paginatedItems.map((source) => (
                <div
                  key={source.sourcePath}
                  className="rounded-lg border border-black/10 bg-white/70 p-3 text-xs dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {formatSourceName(source.sourcePath)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {source.agentCount} agents, {source.workflowCount} workflows
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => void handleCopySourcePath(source.sourcePath)}
                      title="Copy source path"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-2 truncate text-[10px] text-muted-foreground">
                    {source.sourcePath}
                  </p>
                </div>
              ))}
              {sources.length === 0 ? (
                <div className="rounded-lg border border-dashed border-black/10 p-4 text-xs text-muted-foreground dark:border-white/10">
                  No harness source files found.
                </div>
              ) : null}
              <PaginationControls
                currentPage={sourcesPagination.currentPage}
                onPageChange={sourcesPagination.setCurrentPage}
                pageSize={sourcesPagination.pageSize}
                totalItems={sourcesPagination.totalItems}
                label="sources"
              />
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Source definitions open with {preferredToolShortLabel}; reveal uses Finder.
            </p>
          </div>
        </section>
      </div>

      <WorkflowDiagramDialog
        agents={agents}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedWorkflow(null);
          }
        }}
        workflow={selectedWorkflow}
      />
    </AppLayout>
  );
}
