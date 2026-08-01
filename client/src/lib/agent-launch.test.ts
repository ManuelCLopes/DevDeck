import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentLaunchTaskTemplates,
  parseLaunchTokenBudget,
  recommendAgentForLaunch,
} from "./agent-launch";
import type { AgentDefinition, WorkflowDefinition } from "@shared/agents";

const builder = {
  boundaries: [],
  defaultModel: "gpt-5-codex",
  defaultProvider: null,
  defaultSkills: ["typescript"],
  defaultTools: ["shell"],
  description: "Implements scoped changes",
  handoffTargets: [],
  id: "builder",
  name: "Builder",
  projectId: "repo",
  projectName: "Repo",
  responsibilities: ["Implement scoped changes", "Run focused verification"],
  sourceFormat: "json",
  sourcePath: "/tmp/repo/agents.json",
  tokenBudget: 120000,
} satisfies AgentDefinition;

const reviewer = {
  ...builder,
  defaultSkills: ["review"],
  id: "reviewer",
  name: "Reviewer",
  responsibilities: ["Review diffs", "Identify regressions"],
  tokenBudget: 60000,
} satisfies AgentDefinition;

const workflow = {
  description: null,
  id: "feature",
  name: "Feature Build",
  projectId: "repo",
  projectName: "Repo",
  sourceFormat: "json",
  sourcePath: "/tmp/repo/agents.json",
  steps: [
    {
      agentId: "reviewer",
      expectedOutput: null,
      id: "review",
      name: "Review",
      nextStepIds: [],
      verificationCommandIds: ["npm test"],
    },
  ],
} satisfies WorkflowDefinition;

test("recommendAgentForLaunch follows the selected workflow first agent", () => {
  const recommendation = recommendAgentForLaunch([builder, reviewer], {
    project: { id: "repo", name: "Repo" },
    taskTitle: "Implement project changes",
    workflow,
  });

  assert.equal(recommendation.agent?.id, "reviewer");
  assert.match(recommendation.reason, /Feature Build/);
});

test("recommendAgentForLaunch uses task text when no workflow agent is selected", () => {
  const recommendation = recommendAgentForLaunch([builder, reviewer], {
    project: { id: "repo", name: "Repo" },
    taskTitle: "review regression risk",
    workflow: null,
  });

  assert.equal(recommendation.agent?.id, "reviewer");
});

test("buildAgentLaunchTaskTemplates creates compact launch titles", () => {
  const templates = buildAgentLaunchTaskTemplates({
    agent: builder,
    projectName: "Repo",
    workflow,
  });

  assert.deepEqual(
    templates.map((template) => template.id),
    ["workflow-agent", "workflow", "responsibility", "agent", "default"],
  );
  assert.match(templates[0]?.title ?? "", /Feature Build/);
});

test("parseLaunchTokenBudget accepts commas and rejects invalid input", () => {
  assert.equal(parseLaunchTokenBudget("120,000"), 120000);
  assert.equal(parseLaunchTokenBudget("0"), null);
  assert.equal(parseLaunchTokenBudget("bad"), null);
});
