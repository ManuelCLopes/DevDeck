import type { AgentDefinition, WorkflowDefinition } from "@shared/agents";

export interface AgentLaunchProjectContext {
  id: string | null;
  name: string;
}

export interface AgentLaunchRecommendation {
  agent: AgentDefinition | null;
  reason: string;
}

export interface AgentLaunchTaskTemplate {
  id: string;
  title: string;
}

function tokenize(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

function countTokenMatches(searchTokens: Set<string>, values: string[]) {
  if (searchTokens.size === 0) {
    return 0;
  }

  const haystackTokens = tokenize(values.join(" "));
  let matches = 0;
  for (const token of Array.from(searchTokens)) {
    if (haystackTokens.has(token)) {
      matches += 1;
    }
  }
  return matches;
}

function getWorkflowAgentIds(workflow: WorkflowDefinition | null) {
  return (workflow?.steps ?? [])
    .map((step) => step.agentId)
    .filter((agentId): agentId is string => Boolean(agentId));
}

function scoreAgentForLaunch(
  agent: AgentDefinition,
  options: {
    project: AgentLaunchProjectContext | null;
    taskTitle: string;
    workflow: WorkflowDefinition | null;
  },
) {
  let score = 0;
  const workflowAgentIds = getWorkflowAgentIds(options.workflow);
  const workflowPosition = workflowAgentIds.indexOf(agent.id);
  if (workflowPosition >= 0) {
    score += 200 - workflowPosition;
  }

  if (options.project?.id && agent.projectId === options.project.id) {
    score += 100;
  } else if (agent.projectId === null) {
    score += 20;
  }

  score += countTokenMatches(tokenize(options.taskTitle), [
    agent.name,
    agent.description ?? "",
    ...agent.responsibilities,
    ...agent.boundaries,
    ...agent.defaultSkills,
    ...agent.defaultTools,
  ]) * 12;

  if (agent.tokenBudget) {
    score += 3;
  }

  return score;
}

export function recommendAgentForLaunch(
  agents: AgentDefinition[],
  options: {
    project: AgentLaunchProjectContext | null;
    taskTitle: string;
    workflow: WorkflowDefinition | null;
  },
): AgentLaunchRecommendation {
  if (agents.length === 0) {
    return {
      agent: null,
      reason: "No harness agents are available for this repository.",
    };
  }

  const workflowAgentIds = getWorkflowAgentIds(options.workflow);
  const workflowAgent = workflowAgentIds
    .map((agentId) => agents.find((agent) => agent.id === agentId) ?? null)
    .find((agent): agent is AgentDefinition => Boolean(agent));
  if (workflowAgent) {
    return {
      agent: workflowAgent,
      reason: `${options.workflow?.name ?? "Selected workflow"} starts with ${workflowAgent.name}.`,
    };
  }

  const rankedAgents = [...agents].sort(
    (left, right) =>
      scoreAgentForLaunch(right, options) - scoreAgentForLaunch(left, options),
  );
  const recommendedAgent = rankedAgents[0] ?? null;
  if (!recommendedAgent) {
    return {
      agent: null,
      reason: "No harness agents are available for this repository.",
    };
  }

  if (options.taskTitle.trim()) {
    return {
      agent: recommendedAgent,
      reason: "Selected from task text, responsibilities, tools, and project scope.",
    };
  }

  if (options.project?.id && recommendedAgent.projectId === options.project.id) {
    return {
      agent: recommendedAgent,
      reason: `Best project-specific match for ${options.project.name}.`,
    };
  }

  return {
    agent: recommendedAgent,
    reason: "Best available harness match for this launch.",
  };
}

function shortTemplateTitle(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

export function buildAgentLaunchTaskTemplates(options: {
  agent: AgentDefinition | null;
  projectName: string;
  workflow: WorkflowDefinition | null;
}): AgentLaunchTaskTemplate[] {
  const templates: AgentLaunchTaskTemplate[] = [];
  if (options.workflow && options.agent) {
    templates.push({
      id: "workflow-agent",
      title: `${options.workflow.name}: ${options.agent.name} on ${options.projectName}`,
    });
  }
  if (options.workflow) {
    templates.push({
      id: "workflow",
      title: `${options.workflow.name} for ${options.projectName}`,
    });
  }
  if (options.agent?.responsibilities[0]) {
    templates.push({
      id: "responsibility",
      title: shortTemplateTitle(
        `${options.agent.name}: ${options.agent.responsibilities[0]} in ${options.projectName}`,
      ),
    });
  }
  if (options.agent) {
    templates.push({
      id: "agent",
      title: `${options.agent.name} on ${options.projectName}`,
    });
  }
  templates.push({
    id: "default",
    title: `OpenCode workspace for ${options.projectName}`,
  });

  const seenTitles = new Set<string>();
  return templates.filter((template) => {
    if (seenTitles.has(template.title)) {
      return false;
    }
    seenTitles.add(template.title);
    return true;
  });
}

export function parseLaunchTokenBudget(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}
