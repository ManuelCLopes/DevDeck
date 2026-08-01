import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.skip(
  process.env.DEVDECK_RUN_NATIVE_E2E !== "true",
  "Native Electron smoke tests are opt-in because runner PTY support varies.",
);

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

test("@native embedded terminal support can report availability", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "devdeck-native-e2e-"));
  const rootDir = join(tempDir, "workspace");
  const userHome = join(tempDir, "home");
  const alphaPath = join(rootDir, "alpha");
  mkdirSync(rootDir, { recursive: true });
  mkdirSync(userHome, { recursive: true });
  createCommittedRepository(alphaPath);

  const selection = {
    projects: [
      {
        collectionId: "collection:alpha",
        collectionName: "Alpha Collection",
        id: "alpha",
        localPath: alphaPath,
        name: "alpha",
        order: 0,
        repositoryCount: 1,
        workspaceName: "Alpha Workspace",
        workspacePath: rootDir,
      },
    ],
    rootName: "Native Workspace",
  };

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

  try {
    const page = await electronApp.firstWindow();
    await page.waitForURL((url) => url.protocol !== "about:", {
      timeout: 15_000,
    });
    await page.waitForLoadState("domcontentloaded");

    const availability = await page.evaluate(() => (window as any).devdeck.terminal.available());
    expect(availability).toEqual(
      expect.objectContaining({
        available: expect.any(Boolean),
        homeDir: expect.any(String),
        platform: expect.any(String),
      }),
    );
  } finally {
    await electronApp.close();
    rmSync(tempDir, { force: true, recursive: true });
  }
});
