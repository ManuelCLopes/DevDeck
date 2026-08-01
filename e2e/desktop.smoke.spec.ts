import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

interface ManagedProjectSelection {
  projects: Array<{
    collectionId: string;
    collectionName: string;
    id: string;
    localPath: string;
    name: string;
    order: number;
    repositoryCount: number;
    workspaceName: string;
    workspacePath: string;
  }>;
  rootName: string;
}

function createCommittedRepository(repositoryPath: string) {
  mkdirSync(repositoryPath, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repositoryPath,
    stdio: "ignore",
  });
  writeFileSync(join(repositoryPath, "README.md"), "# Repo\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=DevDeck E2E",
      "-c",
      "user.email=e2e@devdeck.local",
      "commit",
      "-m",
      "initial commit",
    ],
    {
      cwd: repositoryPath,
      stdio: "ignore",
    },
  );
}

function writeAgentHarness(repositoryPath: string) {
  writeFileSync(
    join(repositoryPath, "agents.json"),
    JSON.stringify(
      {
        agents: [
          {
            boundaries: ["Keep changes scoped to the selected repository"],
            defaultModel: "gpt-5",
            id: "builder",
            name: "Builder Agent",
            responsibilities: [
              "Implement scoped changes",
              "Run focused verification",
            ],
            skills: ["typescript"],
            tokenBudget: 120000,
            tools: ["shell"],
          },
        ],
        workflows: [
          {
            id: "feature",
            name: "Feature Build",
            steps: [
              {
                agent: "builder",
                id: "implement",
                name: "Implement",
                verification: ["npm test"],
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

function createTestWorkspace() {
  const tempDir = mkdtempSync(join(tmpdir(), "devdeck-e2e-"));
  const rootDir = join(tempDir, "workspace");
  const userHome = join(tempDir, "home");
  mkdirSync(rootDir, { recursive: true });
  mkdirSync(userHome, { recursive: true });
  const alphaPath = join(rootDir, "alpha");
  createCommittedRepository(alphaPath);
  writeAgentHarness(alphaPath);
  createCommittedRepository(join(rootDir, "beta"));

  return { rootDir, tempDir, userHome };
}

function createWorkspaceSelection(rootDir: string): ManagedProjectSelection {
  return {
    projects: [
      {
        collectionId: "collection:alpha",
        collectionName: "Alpha Collection",
        id: "alpha",
        localPath: join(rootDir, "alpha"),
        name: "alpha",
        order: 0,
        repositoryCount: 1,
        workspaceName: "Alpha Workspace",
        workspacePath: rootDir,
      },
      {
        collectionId: "collection:beta",
        collectionName: "Beta Collection",
        id: "beta",
        localPath: join(rootDir, "beta"),
        name: "beta",
        order: 1,
        repositoryCount: 1,
        workspaceName: "Beta Workspace",
        workspacePath: rootDir,
      },
    ],
    rootName: "Multiple Workspaces",
  };
}

async function launchDesktopApp(
  userHome: string,
  selection: ManagedProjectSelection,
) {
  const electronApp = await electron.launch({
    args: [join(process.cwd(), "dist-electron", "main.cjs")],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEVDECK_E2E_BOOTSTRAP_SELECTION: JSON.stringify(selection),
      DEVDECK_GITHUB_CLIENT_ID: "",
      DEVDECK_GITHUB_STORAGE: "file",
      DEVDECK_GITHUB_TOKEN_PATH: join(userHome, "github-token.json"),
      DEVDECK_USER_DATA_PATH: join(userHome, "devdeck-data"),
      HOME: userHome,
    },
  });
  const page = await electronApp.firstWindow();
  page.on("pageerror", (error) => {
    console.error("desktop pageerror:", error.stack ?? error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("desktop console error:", message.text());
    }
  });
  await page.waitForURL((url) => url.protocol !== "about:", {
    timeout: 15_000,
  });
  await page.waitForLoadState("domcontentloaded");
  return { electronApp, page };
}

async function navigateDesktopApp(page: Page, targetPath: string) {
  await page.evaluate((nextPath) => {
    const normalizedTarget = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
    const [pathnamePart, searchPart = ""] = normalizedTarget
      .replace(/^#?\/?/, "")
      .split("?");
    const oldURL = window.location.href;
    const url = new URL(oldURL);
    url.hash = `/${pathnamePart}`;
    url.search = searchPart ? `?${searchPart}` : "";
    window.history.pushState(null, "", url.href);

    const event =
      typeof HashChangeEvent !== "undefined"
        ? new HashChangeEvent("hashchange", { newURL: url.href, oldURL })
        : new Event("hashchange");
    window.dispatchEvent(event);
  }, targetPath);
}

test("desktop app loads overview for a prepared local workspace", async () => {
  const workspace = createTestWorkspace();
  const selection = createWorkspaceSelection(workspace.rootDir);
  const { electronApp, page } = await launchDesktopApp(
    workspace.userHome,
    selection,
  );

  try {
    await expect(
      page.getByRole("heading", { name: /Overview$/ }),
    ).toBeVisible();
    await expect(page.locator("aside")).toContainText("alpha");
    await expect(page.locator("aside")).toContainText("beta");
    await expect(page.getByText(/Monitored Repos|Branch Context/)).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(workspace.tempDir, { force: true, recursive: true });
  }
});

test("preferences supports hide and restore curation", async () => {
  const workspace = createTestWorkspace();
  const selection = createWorkspaceSelection(workspace.rootDir);
  const { electronApp, page } = await launchDesktopApp(
    workspace.userHome,
    selection,
  );

  try {
    await page.getByRole("button", { name: "Preferences", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Preferences", exact: true }),
    ).toBeVisible();

    const collectionInputs = page.locator('input[id^="collection-"]');
    await expect
      .poll(() =>
        collectionInputs.evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
      )
      .toEqual(["Alpha Collection", "Beta Collection"]);

    await expect(page.getByTitle("Drag to reorder collection")).toHaveCount(2);

    await page.getByRole("button", { name: "Hide alpha", exact: true }).click();
    await expect(
      page.getByText("Hidden Repositories", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("aside")).not.toContainText("alpha");

    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.locator("aside")).toContainText("alpha");
  } finally {
    await electronApp.close();
    rmSync(workspace.tempDir, { force: true, recursive: true });
  }
});

test("preferences exposes the production token fallback when device flow is unavailable", async () => {
  const workspace = createTestWorkspace();
  const selection = createWorkspaceSelection(workspace.rootDir);
  const { electronApp, page } = await launchDesktopApp(
    workspace.userHome,
    selection,
  );

  try {
    await page.getByRole("button", { name: "Preferences", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Preferences", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Connect GitHub" }).click();

    await expect(
      page.getByRole("heading", { name: "Connect GitHub" }),
    ).toBeVisible();
    await expect(page.getByText("Device Sign-In Unavailable")).toBeVisible();
    await expect(
      page.getByText("DEVDECK_GITHUB_CLIENT_ID", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Paste a GitHub Token")).toBeVisible();
    await expect(
      page.getByText(/local DevDeck credential file/),
    ).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(workspace.tempDir, { force: true, recursive: true });
  }
});

test("agent registry imports harness definitions and tracking surfaces", async () => {
  const workspace = createTestWorkspace();
  const selection = createWorkspaceSelection(workspace.rootDir);
  const { electronApp, page } = await launchDesktopApp(
    workspace.userHome,
    selection,
  );

  try {
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agent Registry", exact: true }),
    ).toBeVisible();

    await expect(page.getByText("Builder Agent", { exact: true })).toBeVisible();
    await expect(page.getByText("Implement scoped changes")).toBeVisible();
    await expect(page.getByText("120,000")).toBeVisible();
    await expect(page.getByText("Feature Build", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Agent Runs", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Token Usage by Agent", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/No agent runs have been recorded yet/),
    ).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(workspace.tempDir, { force: true, recursive: true });
  }
});

test("terminal launcher exposes agent-aware OpenCode setup before launch", async () => {
  const workspace = createTestWorkspace();
  const selection = createWorkspaceSelection(workspace.rootDir);
  const { electronApp, page } = await launchDesktopApp(
    workspace.userHome,
    selection,
  );

  try {
    await expect(
      page.getByRole("heading", { name: /Overview$/ }),
    ).toBeVisible();
    const alphaProjectId = await page.evaluate(async () => {
      const desktopApi = (window as any).devdeck;
      const persistedSelection = JSON.parse(
        window.localStorage.getItem("devdeck_workspace_selection") ?? "null",
      );
      const snapshot = await desktopApi.loadWorkspaceSnapshot(persistedSelection);
      return snapshot.projects.find((project: { name: string }) => project.name === "alpha")?.id ?? null;
    });
    expect(alphaProjectId).toBeTruthy();

    await navigateDesktopApp(
      page,
      `/terminals?launch=opencode&project=${encodeURIComponent(alphaProjectId!)}`,
    );

    await expect(
      page.locator("main").getByRole("heading", { name: "alpha", exact: true }),
    ).toBeVisible();

    await expect(page.getByText("Task Title", { exact: true })).toBeVisible();
    await expect(page.getByText("Workflow", { exact: true })).toBeVisible();
    await expect(page.getByText("Agent", { exact: true })).toBeVisible();
    await expect(page.getByText("Feature Build", { exact: true })).toBeVisible();
    await expect(
      page.locator("main").getByText("Builder Agent", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .locator("main")
        .getByText(/Implement scoped changes \| Run focused verification/),
    ).toBeVisible();
    await expect(page.getByText("Token Budget", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Launch OpenCode Workspace", exact: true }),
    ).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(workspace.tempDir, { force: true, recursive: true });
  }
});
