import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAgentHarness } from "@/hooks/use-agent-harness";
import { useAgentRunsState, useTokenUsageEventsState } from "@/hooks/use-agent-telemetry";
import { useCodingTool } from "@/hooks/use-coding-tool";
import {
  haveAgentRunLinksChanged,
  linkAgentRunsToOpenCodeUsageRecords,
  normalizeAgentRuns,
  summarizeAgentRunsByStatus,
  updateAgentRunStatus,
} from "@/lib/agent-runs";
import { getDesktopApi } from "@/lib/desktop";
import {
  buildTokenUsageEventsFromOpenCodeRecords,
  getTokenUsageSummaryTotal,
  mergeTokenUsageEvents,
  summarizeTokenUsageByAgent,
  type TokenUsageSummary,
} from "@/lib/token-usage";
import {
  getAgentRunBudgetUsagePercent,
  summarizeTokenUsageForAgentRun,
  type AgentRunUsageSummary,
} from "@/lib/agent-run-detail";
import { cn } from "@/lib/utils";
import type {
  AgentDefinition,
  AgentRun,
  AgentRunStatus,
  WorkflowDefinition,
} from "@shared/agents";

function formatSourceName(sourcePath: string) {
  return sourcePath.split("/").filter(Boolean).slice(-2).join("/");
}

function formatTokenBudget(tokenBudget: number | null) {
  if (!tokenBudget) {
    return "No budget";
  }

  return new Intl.NumberFormat().format(tokenBudget);
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

function AgentCard({
  agent,
  onOpenSource,
  onRevealSource,
  tokenUsage,
}: {
  agent: AgentDefinition;
  onOpenSource: (sourcePath: string) => void;
  onRevealSource: (sourcePath: string) => void;
  tokenUsage: TokenUsageSummary | null;
}) {
  const primaryResponsibilities =
    agent.responsibilities.length > 0
      ? agent.responsibilities
      : agent.description
        ? [agent.description]
        : ["No responsibilities were parsed from the harness source."];

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

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-black/10 bg-secondary/35 px-3 py-2 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Token Budget
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {formatTokenBudget(agent.tokenBudget)}
          </p>
        </div>
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

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-black/10 pt-3 dark:border-white/10">
        {agent.defaultTools.slice(0, 4).map((tool) => (
          <AgentPill key={`tool:${tool}`}>{tool}</AgentPill>
        ))}
        {agent.defaultSkills.slice(0, 4).map((skill) => (
          <AgentPill key={`skill:${skill}`} tone="blue">
            {skill}
          </AgentPill>
        ))}
        {agent.defaultTools.length === 0 && agent.defaultSkills.length === 0 ? (
          <AgentPill>No tools parsed</AgentPill>
        ) : null}
      </div>

      <p className="mt-3 truncate text-[10px] text-muted-foreground">
        Source: {formatSourceName(agent.sourcePath)}
      </p>
    </article>
  );
}

function WorkflowRow({ workflow }: { workflow: WorkflowDefinition }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{workflow.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {workflow.description ?? `${workflow.steps.length} workflow steps imported`}
          </p>
        </div>
        <AgentPill tone="green">{getProjectLabel(workflow.projectName)}</AgentPill>
      </div>
      {workflow.steps.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {workflow.steps.slice(0, 6).map((step) => (
            <AgentPill key={step.id} tone="blue">
              {step.name}
            </AgentPill>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const budgetPercent = getAgentRunBudgetUsagePercent(run, usage);
  const budgetTone =
    budgetPercent === null
      ? "neutral"
      : budgetPercent >= 100
        ? "red"
        : budgetPercent >= 80
          ? "amber"
          : "green";

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
        <AgentPill>
          {run.tokenBudget ? `${run.tokenBudget.toLocaleString()} budget` : "No budget"}
        </AgentPill>
        {usage.totalTokens > 0 ? (
          <AgentPill tone={budgetTone}>
            {formatTokenCount(usage.totalTokens)} used
          </AgentPill>
        ) : null}
        {budgetPercent !== null ? (
          <AgentPill tone={budgetTone}>{`${budgetPercent}% budget`}</AgentPill>
        ) : null}
        {run.terminalPaneId ? <AgentPill>{run.terminalPaneId}</AgentPill> : null}
      </div>
    </div>
  );
}

function AgentRunDetail({
  agents,
  onCopyValue,
  onStatusChange,
  run,
  usage,
  workflows,
}: {
  agents: AgentDefinition[];
  onCopyValue: (value: string, title: string) => void;
  onStatusChange: (runId: string, status: AgentRunStatus) => void;
  run: AgentRun | null;
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
  const budgetPercent = getAgentRunBudgetUsagePercent(run, usage);
  const budgetTone =
    budgetPercent === null
      ? "neutral"
      : budgetPercent >= 100
        ? "red"
        : budgetPercent >= 80
          ? "amber"
          : "green";

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
          <p className="text-[10px] uppercase text-muted-foreground">Budget</p>
          <p className="mt-1 font-semibold text-foreground">
            {budgetPercent === null ? "No budget" : `${budgetPercent}%`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {run.tokenBudget ? (
          <AgentPill tone={budgetTone}>
            {`${usage.totalTokens.toLocaleString()} / ${run.tokenBudget.toLocaleString()}`}
          </AgentPill>
        ) : null}
        <AgentPill>{`${usage.eventCount} usage events`}</AgentPill>
        <AgentPill>{formatEstimatedCost(usage.estimatedCost)}</AgentPill>
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
    </aside>
  );
}

export default function Agents() {
  const desktopApi = getDesktopApi();
  const { toast } = useToast();
  const { openPreferredTool, preferredToolShortLabel } = useCodingTool();
  const { data, error, isFetching, isLoading, refetch } = useAgentHarness();
  const [agentRuns, setAgentRuns, { error: agentRunStorageError }] =
    useAgentRunsState();
  const [
    tokenUsageEvents,
    setTokenUsageEvents,
    { error: tokenUsageStorageError },
  ] = useTokenUsageEventsState();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [usageIngestionError, setUsageIngestionError] = useState<string | null>(null);
  const [usageSyncedAt, setUsageSyncedAt] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const telemetryStorageError = agentRunStorageError ?? tokenUsageStorageError;

  const agents = data?.agents ?? [];
  const workflows = data?.workflows ?? [];
  const sources = data?.sources ?? [];
  const sourceErrors = sources.filter((source) => source.errors.length > 0);
  const runStatusSummary = useMemo(
    () => summarizeAgentRunsByStatus(agentRuns),
    [agentRuns],
  );
  const visibleAgentRuns = useMemo(
    () =>
      agentRuns
        .filter((run) => {
          const matchesProject =
            projectFilter === "all" ||
            agents.find((agent) => agent.id === run.agentId)?.projectName === projectFilter;
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
        })
        .slice(0, 8),
    [agentRuns, agents, normalizedQuery, projectFilter],
  );
  const tokenUsageSummaries = useMemo(
    () => summarizeTokenUsageByAgent(tokenUsageEvents),
    [tokenUsageEvents],
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
        agentRuns.map((run) => [
          run.id,
          summarizeTokenUsageForAgentRun(tokenUsageEvents, run),
        ]),
      ),
    [agentRuns, tokenUsageEvents],
  );
  const projectOptions = useMemo(
    () => uniqueValues(agents.map((agent) => agent.projectName)),
    [agents],
  );

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        const matchesProject =
          projectFilter === "all" || getProjectLabel(agent.projectName) === projectFilter;
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

  useEffect(() => {
    if (!desktopApi?.listOpenCodeUsageRecords) {
      return;
    }

    let cancelled = false;
    void desktopApi
      .listOpenCodeUsageRecords()
      .then((records) => {
        if (cancelled) {
          return;
        }

        const normalizedRuns = normalizeAgentRuns(agentRuns);
        const linkedRuns = linkAgentRunsToOpenCodeUsageRecords(
          normalizedRuns,
          records,
        );
        if (haveAgentRunLinksChanged(normalizedRuns, linkedRuns)) {
          setAgentRuns(linkedRuns);
        }

        const events = buildTokenUsageEventsFromOpenCodeRecords(records, linkedRuns);
        if (events.length > 0) {
          setTokenUsageEvents((currentEvents) =>
            mergeTokenUsageEvents(currentEvents, events).slice(0, 10_000),
          );
        }
        setUsageIngestionError(null);
        setUsageSyncedAt(new Date().toISOString());
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setUsageIngestionError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [agentRuns, desktopApi, setAgentRuns, setTokenUsageEvents]);

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

  const handleCopyValue = async (value: string, title: string) => {
    try {
      if (desktopApi?.copyToClipboard) {
        await desktopApi.copyToClipboard(value);
      } else {
        await navigator.clipboard.writeText(value);
      }
      toast({
        title,
        description: value,
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
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
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
          <div className="flex flex-wrap gap-2">
            {["all", ...projectOptions].map((projectName) => {
              const selected = projectFilter === projectName;
              return (
                <button
                  key={projectName}
                  type="button"
                  onClick={() => setProjectFilter(projectName)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-black/10 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-background",
                  )}
                >
                  {projectName === "all" ? "All Projects" : projectName}
                </button>
              );
            })}
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </div>
        ) : null}

        {sourceErrors.length > 0 ? (
          <section className="space-y-2">
            {sourceErrors.map((source) => (
              <div
                key={source.sourcePath}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{formatSourceName(source.sourcePath)}</p>
                  <p className="mt-1 break-words">{source.errors.join(" ")}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {isLoading ? (
          <div className="rounded-lg border border-dashed border-black/10 p-10 text-center text-sm text-muted-foreground dark:border-white/10">
            Scanning local harness files...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/10 bg-white/45 p-10 text-center dark:border-white/10 dark:bg-white/5">
            <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold text-foreground">No agents found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              DevDeck scans for `AGENTS.md`, `agents.json`, `.opencode/*`, and `.codex/*` harness files in connected repositories.
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={`${agent.sourcePath}:${agent.id}`}
                agent={agent}
                onOpenSource={handleOpenSource}
                onRevealSource={handleRevealSource}
                tokenUsage={tokenUsageByAgent.get(agent.id) ?? null}
              />
            ))}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Agent Runs</h2>
          </div>
          {visibleAgentRuns.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-2">
                {visibleAgentRuns.map((run) => (
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
              </div>
              <AgentRunDetail
                agents={agents}
                workflows={workflows}
                run={selectedRun}
                usage={selectedRunUsage}
                onCopyValue={handleCopyValue}
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
                    return (
                      <tr key={summary.agentId ?? "unassigned"}>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {agent?.name ?? "Unassigned"}
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
                  <WorkflowRow key={`${workflow.sourcePath}:${workflow.id}`} workflow={workflow} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-black/10 p-5 text-sm text-muted-foreground dark:border-white/10">
                No workflow definitions were imported yet.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Harness Sources</h2>
            </div>
            <div className="space-y-2">
              {sources.map((source) => (
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
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Source definitions open with {preferredToolShortLabel}; reveal uses Finder.
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
