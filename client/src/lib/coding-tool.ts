import { getDesktopApi } from "@/lib/desktop";
import type { AppPreferences } from "@/lib/app-preferences";

export type CodingToolId = "opencode" | "vscode";

export interface CodingToolAvailabilityEntry {
  available: boolean;
  reason: string | null;
}

export interface DesktopCodingToolAvailability {
  opencode: CodingToolAvailabilityEntry;
  vscode: CodingToolAvailabilityEntry;
}

export const DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY: DesktopCodingToolAvailability = {
  opencode: { available: false, reason: null },
  vscode: { available: true, reason: null },
};

export function isCodingToolAvailable(
  availability: DesktopCodingToolAvailability,
  tool: CodingToolId,
) {
  return availability[tool]?.available ?? false;
}

export function getCodingToolLabel(tool: CodingToolId) {
  return tool === "opencode" ? "OpenCode" : "VS Code";
}

export function getCodingToolShortLabel(tool: CodingToolId) {
  return tool === "opencode" ? "OpenCode" : "Code";
}

export function getCodingToolInstallHint(tool: CodingToolId) {
  if (tool === "opencode") {
    return "Install the OpenCode CLI from https://opencode.ai and make sure the `opencode` binary is on your PATH.";
  }

  return "Install Visual Studio Code from https://code.visualstudio.com. On macOS, run the \u201CInstall 'code' command in PATH\u201D action from the command palette.";
}

export function resolvePreferredCodingTool(
  preferences: Pick<AppPreferences, "preferredCodingTool">,
  availability: DesktopCodingToolAvailability,
): CodingToolId {
  if (
    preferences.preferredCodingTool === "opencode" &&
    availability.opencode?.available
  ) {
    return "opencode";
  }

  if (
    preferences.preferredCodingTool === "vscode" &&
    availability.vscode?.available
  ) {
    return "vscode";
  }

  // Graceful fallback: use whichever tool is actually available.
  if (availability.opencode?.available) {
    return "opencode";
  }

  return "vscode";
}

export async function openInCodingTool(
  targetPath: string,
  tool: CodingToolId,
) {
  const desktopApi = getDesktopApi();
  if (!desktopApi) {
    return;
  }

  if (tool === "opencode") {
    if (desktopApi.openInOpencode) {
      await desktopApi.openInOpencode(targetPath);
      return;
    }

    throw new Error(getCodingToolInstallHint("opencode"));
  }

  await desktopApi.openInCode?.(targetPath);
}
