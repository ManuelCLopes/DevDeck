import type {
  AgentDefinition,
  AgentHarnessSource,
  WorkflowDefinition,
} from "./agents";

export type AgentHarnessQualitySeverity = "critical" | "warning" | "info";

export interface AgentHarnessQualityIssue {
  category:
    | "agent"
    | "handoff"
    | "source"
    | "verification"
    | "workflow";
  entityLabel: string;
  message: string;
  severity: AgentHarnessQualitySeverity;
  sourcePath: string | null;
}

export interface AgentHarnessQualityReport {
  agentCoverage: {
    totalAgents: number;
    withBoundaries: number;
    withHandoffTargets: number;
    withResponsibilities: number;
    withToolsOrSkills: number;
  };
  criticalCount: number;
  infoCount: number;
  issues: AgentHarnessQualityIssue[];
  score: number;
  warningCount: number;
  workflowCoverage: {
    stepsWithAgents: number;
    stepsWithVerification: number;
    totalSteps: number;
    totalWorkflows: number;
    verificationCoverageRate: number;
    withSteps: number;
  };
}

function getRate(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((part / total) * 100);
}

function scoreReport(options: {
  criticalCount: number;
  infoCount: number;
  warningCount: number;
}) {
  return Math.max(
    0,
    100 -
      options.criticalCount * 20 -
      options.warningCount * 8 -
      options.infoCount * 3,
  );
}

export function buildAgentHarnessQualityReport(input: {
  agents: AgentDefinition[];
  sources?: AgentHarnessSource[];
  workflows: WorkflowDefinition[];
}): AgentHarnessQualityReport {
  const agentsById = new Map<string, AgentDefinition[]>();
  const issuesByKey = new Map<string, AgentHarnessQualityIssue>();
  const addIssue = (issue: AgentHarnessQualityIssue) => {
    const key = [
      issue.severity,
      issue.category,
      issue.entityLabel,
      issue.sourcePath ?? "",
      issue.message,
    ].join("|");
    issuesByKey.set(key, issue);
  };

  for (const agent of input.agents) {
    const matchingAgents = agentsById.get(agent.id) ?? [];
    matchingAgents.push(agent);
    agentsById.set(agent.id, matchingAgents);

    if (agent.responsibilities.length === 0 && !agent.description) {
      addIssue({
        category: "agent",
        entityLabel: agent.name,
        message: "No responsibilities or description are defined.",
        severity: "warning",
        sourcePath: agent.sourcePath,
      });
    }
    if (agent.boundaries.length === 0) {
      addIssue({
        category: "agent",
        entityLabel: agent.name,
        message: "No boundaries are defined.",
        severity: "warning",
        sourcePath: agent.sourcePath,
      });
    }
    if (agent.defaultTools.length === 0 && agent.defaultSkills.length === 0) {
      addIssue({
        category: "agent",
        entityLabel: agent.name,
        message: "No tools or skills are defined.",
        severity: "info",
        sourcePath: agent.sourcePath,
      });
    }
    if (!agent.tokenBudget) {
      addIssue({
        category: "agent",
        entityLabel: agent.name,
        message: "No default token budget is defined.",
        severity: "info",
        sourcePath: agent.sourcePath,
      });
    }
  }

  for (const duplicateAgents of Array.from(agentsById.values())) {
    if (duplicateAgents.length <= 1) {
      continue;
    }

    for (const agent of duplicateAgents) {
      addIssue({
        category: "agent",
        entityLabel: agent.name,
        message: `Agent id "${agent.id}" is duplicated.`,
        severity: "critical",
        sourcePath: agent.sourcePath,
      });
    }
  }

  for (const agent of input.agents) {
    for (const handoffTarget of agent.handoffTargets) {
      if (!agentsById.has(handoffTarget)) {
        addIssue({
          category: "handoff",
          entityLabel: agent.name,
          message: `Handoff target "${handoffTarget}" does not match an agent id.`,
          severity: "critical",
          sourcePath: agent.sourcePath,
        });
      }
    }
  }

  for (const workflow of input.workflows) {
    if (workflow.steps.length === 0) {
      addIssue({
        category: "workflow",
        entityLabel: workflow.name,
        message: "Workflow has no steps.",
        severity: "critical",
        sourcePath: workflow.sourcePath,
      });
    }

    for (const step of workflow.steps) {
      if (!step.agentId) {
        addIssue({
          category: "workflow",
          entityLabel: `${workflow.name} / ${step.name}`,
          message: "Workflow step has no assigned agent.",
          severity: "warning",
          sourcePath: workflow.sourcePath,
        });
      } else if (!agentsById.has(step.agentId)) {
        addIssue({
          category: "workflow",
          entityLabel: `${workflow.name} / ${step.name}`,
          message: `Workflow step references unknown agent "${step.agentId}".`,
          severity: "critical",
          sourcePath: workflow.sourcePath,
        });
      }

      if (step.verificationCommandIds.length === 0) {
        addIssue({
          category: "verification",
          entityLabel: `${workflow.name} / ${step.name}`,
          message: "Workflow step has no verification command.",
          severity: "warning",
          sourcePath: workflow.sourcePath,
        });
      }
    }
  }

  for (const source of input.sources ?? []) {
    for (const error of source.errors) {
      addIssue({
        category: "source",
        entityLabel: source.sourcePath,
        message: error,
        severity: "warning",
        sourcePath: source.sourcePath,
      });
    }
  }

  const issues = Array.from(issuesByKey.values()).sort(
    (left, right) =>
      getSeverityRank(left.severity) - getSeverityRank(right.severity) ||
      left.category.localeCompare(right.category) ||
      left.entityLabel.localeCompare(right.entityLabel),
  );
  const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "info").length;
  const totalSteps = input.workflows.reduce(
    (count, workflow) => count + workflow.steps.length,
    0,
  );
  const stepsWithVerification = input.workflows.reduce(
    (count, workflow) =>
      count +
      workflow.steps.filter((step) => step.verificationCommandIds.length > 0).length,
    0,
  );

  return {
    agentCoverage: {
      totalAgents: input.agents.length,
      withBoundaries: input.agents.filter((agent) => agent.boundaries.length > 0).length,
      withHandoffTargets: input.agents.filter((agent) => agent.handoffTargets.length > 0).length,
      withResponsibilities: input.agents.filter(
        (agent) => agent.responsibilities.length > 0 || Boolean(agent.description),
      ).length,
      withToolsOrSkills: input.agents.filter(
        (agent) => agent.defaultTools.length > 0 || agent.defaultSkills.length > 0,
      ).length,
    },
    criticalCount,
    infoCount,
    issues,
    score: scoreReport({ criticalCount, infoCount, warningCount }),
    warningCount,
    workflowCoverage: {
      stepsWithAgents: input.workflows.reduce(
        (count, workflow) => count + workflow.steps.filter((step) => step.agentId).length,
        0,
      ),
      stepsWithVerification,
      totalSteps,
      totalWorkflows: input.workflows.length,
      verificationCoverageRate: getRate(stepsWithVerification, totalSteps),
      withSteps: input.workflows.filter((workflow) => workflow.steps.length > 0).length,
    },
  };
}

function getSeverityRank(severity: AgentHarnessQualitySeverity) {
  if (severity === "critical") {
    return 0;
  }
  if (severity === "warning") {
    return 1;
  }

  return 2;
}
