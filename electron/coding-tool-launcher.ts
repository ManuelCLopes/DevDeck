import { execFile, spawn } from "child_process";
import { promisify } from "util";

export type CodingToolId = "opencode" | "vscode";

export interface CodingToolAvailabilityEntry {
  available: boolean;
  reason: string | null;
}

export interface DesktopCodingToolAvailability {
  opencode: CodingToolAvailabilityEntry;
  vscode: CodingToolAvailabilityEntry;
}

const execFileAsync = promisify(execFile);

const LINUX_TERMINAL_CANDIDATES = [
  "x-terminal-emulator",
  "gnome-terminal",
  "konsole",
  "xterm",
  "alacritty",
  "kitty",
];

async function commandExists(command: string): Promise<boolean> {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(lookup, [command]);
    return true;
  } catch {
    return false;
  }
}

async function firstAvailableCommand(commands: string[]) {
  for (const command of commands) {
    // eslint-disable-next-line no-await-in-loop
    if (await commandExists(command)) {
      return command;
    }
  }

  return null;
}

async function resolveOpenCodeAvailability(): Promise<CodingToolAvailabilityEntry> {
  if (await commandExists("opencode")) {
    return { available: true, reason: null };
  }

  return {
    available: false,
    reason:
      "Install OpenCode (https://opencode.ai) and make sure the `opencode` binary is on your PATH.",
  };
}

async function resolveVsCodeAvailability(): Promise<CodingToolAvailabilityEntry> {
  if (process.platform === "darwin") {
    try {
      await execFileAsync("open", ["-Ra", "Visual Studio Code"]);
      return { available: true, reason: null };
    } catch {
      return {
        available: false,
        reason:
          "Visual Studio Code was not found. Install it from https://code.visualstudio.com.",
      };
    }
  }

  if (await commandExists("code")) {
    return { available: true, reason: null };
  }

  return {
    available: false,
    reason:
      "VS Code's `code` command was not found. Install VS Code and run the \u201CInstall 'code' command in PATH\u201D action.",
  };
}

export async function getDesktopCodingToolAvailability(): Promise<DesktopCodingToolAvailability> {
  const [opencode, vscode] = await Promise.all([
    resolveOpenCodeAvailability(),
    resolveVsCodeAvailability(),
  ]);

  return { opencode, vscode };
}

function escapeAppleScriptString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function openInOpenCodeMac(targetPath: string) {
  const escapedPath = escapeAppleScriptString(targetPath);
  await execFileAsync("osascript", [
    "-e",
    `set targetPath to "${escapedPath}"`,
    "-e",
    'tell application "Terminal"',
    "-e",
    "activate",
    "-e",
    'do script "cd " & quoted form of targetPath & " && clear && opencode ."',
    "-e",
    "end tell",
  ]);
}

function quoteForPosixShell(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function openInOpenCodeLinux(targetPath: string) {
  const terminalCommand = await firstAvailableCommand(LINUX_TERMINAL_CANDIDATES);
  if (!terminalCommand) {
    throw new Error(
      "No supported terminal emulator (x-terminal-emulator, gnome-terminal, konsole, xterm, …) was found on PATH.",
    );
  }

  const shellCommand = `cd ${quoteForPosixShell(targetPath)} && clear && opencode .`;

  const args = (() => {
    switch (terminalCommand) {
      case "gnome-terminal":
        return ["--", "bash", "-lc", shellCommand];
      case "konsole":
        return ["-e", "bash", "-lc", shellCommand];
      case "alacritty":
      case "kitty":
        return ["-e", "bash", "-lc", shellCommand];
      default:
        // x-terminal-emulator and xterm both accept -e
        return ["-e", `bash -lc ${quoteForPosixShell(shellCommand)}`];
    }
  })();

  const child = spawn(terminalCommand, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function openInOpenCodeWindows(targetPath: string) {
  const child = spawn(
    "cmd.exe",
    ["/c", "start", "cmd.exe", "/k", `cd /d ${targetPath} && opencode .`],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

export async function openInOpenCode(targetPath: string) {
  const availability = await resolveOpenCodeAvailability();
  if (!availability.available) {
    throw new Error(
      availability.reason ?? "OpenCode is not available on this machine.",
    );
  }

  if (process.platform === "darwin") {
    await openInOpenCodeMac(targetPath);
    return;
  }

  if (process.platform === "win32") {
    await openInOpenCodeWindows(targetPath);
    return;
  }

  await openInOpenCodeLinux(targetPath);
}

export async function openInVsCode(targetPath: string) {
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-a", "Visual Studio Code", targetPath]);
    return;
  }

  if (await commandExists("code")) {
    const child = spawn("code", [targetPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  throw new Error(
    "VS Code's `code` command is not available. Install VS Code or add the `code` CLI to your PATH.",
  );
}

export async function openInCodingTool(
  targetPath: string,
  tool: CodingToolId,
) {
  if (tool === "opencode") {
    await openInOpenCode(targetPath);
    return;
  }

  await openInVsCode(targetPath);
}
