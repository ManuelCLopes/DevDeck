import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentLaunchTaskTemplates,
  buildRecommendedOpenCodeLaunchDefaults,
  buildRecommendedOpenCodeLaunchPath,
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
} satisfies AgentDefinition;

const reviewer = {
  ...builder,
  defaultSkills: ["review"],
  id: "reviewer",
  name: "Reviewer",
  responsibilities: ["Review diffs", "Identify regressions"],
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

test("buildRecommendedOpenCodeLaunchPath preselects project harness defaults", () => {
  const launchPath = buildRecommendedOpenCodeLaunchPath({
    agents: [builder, reviewer],
    project: { id: "repo", name: "Repo" },
    workflows: [workflow],
  });
  const url = new URL(launchPath, "https://example.test");

  assert.equal(url.pathname, "/terminals");
  assert.equal(url.searchParams.get("launch"), "opencode");
  assert.equal(url.searchParams.get("project"), "repo");
  assert.equal(url.searchParams.get("workflow"), "feature");
  assert.equal(url.searchParams.get("agent"), "reviewer");
  assert.equal(url.searchParams.get("task"), "Feature Build: Reviewer on Repo");
});

test("buildRecommendedOpenCodeLaunchDefaults returns reusable launcher defaults", () => {
  const defaults = buildRecommendedOpenCodeLaunchDefaults({
    agents: [builder, reviewer],
    project: { id: "repo", name: "Repo" },
    workflows: [workflow],
  });

  assert.equal(defaults.agent?.id, "reviewer");
  assert.equal(defaults.workflow?.id, "feature");
  assert.equal(defaults.taskTitle, "Feature Build: Reviewer on Repo");
});

test("buildRecommendedOpenCodeLaunchPath keeps unrelated harness entries manual", () => {
  const launchPath = buildRecommendedOpenCodeLaunchPath({
    agents: [{ ...builder, projectId: "other", projectName: "Other" }],
    project: { id: "repo", name: "Repo" },
    workflows: [{ ...workflow, projectId: "other", projectName: "Other" }],
  });
  const url = new URL(launchPath, "https://example.test");

  assert.equal(url.searchParams.get("project"), "repo");
  assert.equal(url.searchParams.get("agent"), null);
  assert.equal(url.searchParams.get("workflow"), null);
  assert.equal(url.searchParams.get("task"), "OpenCode workspace for Repo");
});
