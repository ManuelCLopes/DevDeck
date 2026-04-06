import { _electron as electron, expect, test } from "@playwright/test";
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

function createTestWorkspace() {
  const tempDir = mkdtempSync(join(tmpdir(), "devdeck-e2e-"));
  const rootDir = join(tempDir, "workspace");
  const userHome = join(tempDir, "home");
  mkdirSync(rootDir, { recursive: true });
  mkdirSync(userHome, { recursive: true });
  createCommittedRepository(join(rootDir, "alpha"));
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

test("desktop app loads overview for a prepared local workspace", async () => {
  const workspace = createTestWorkspace();
  const selection = createWorkspaceSelection(workspace.rootDir);
  const { electronApp, page } = await launchDesktopApp(
    workspace.userHome,
    selection,
  );

  try {
    await expect(page.getByText("Repository Overview")).toBeVisible();
    await expect(page.locator("aside")).toContainText("alpha");
    await expect(page.locator("aside")).toContainText("beta");
    await expect(
      page.getByRole("heading", { name: "Monitored Repos" }),
    ).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(workspace.tempDir, { force: true, recursive: true });
  }
});

test("preferences supports drag reordering and hide/restore curation", async () => {
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

    const dragHandles = page.getByTitle("Drag to reorder collection");
    await dragHandles.nth(1).dragTo(dragHandles.nth(0));

    await expect
      .poll(() =>
        collectionInputs.evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
      )
      .toEqual(["Beta Collection", "Alpha Collection"]);

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
