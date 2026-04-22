import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY,
  getCodingToolInstallHint,
  getCodingToolLabel,
  getCodingToolShortLabel,
  isCodingToolAvailable,
  resolvePreferredCodingTool,
  type DesktopCodingToolAvailability,
} from "./coding-tool";

test("default availability treats VS Code as present and OpenCode as missing", () => {
  assert.equal(DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY.vscode.available, true);
  assert.equal(DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY.opencode.available, false);
});

test("resolvePreferredCodingTool honors the user preference when the tool is available", () => {
  const availability: DesktopCodingToolAvailability = {
    opencode: { available: true, reason: null },
    vscode: { available: true, reason: null },
  };

  assert.equal(
    resolvePreferredCodingTool({ preferredCodingTool: "opencode" }, availability),
    "opencode",
  );
  assert.equal(
    resolvePreferredCodingTool({ preferredCodingTool: "vscode" }, availability),
    "vscode",
  );
});

test("resolvePreferredCodingTool falls back to an available tool when the preferred one is missing", () => {
  const onlyVsCode: DesktopCodingToolAvailability = {
    opencode: { available: false, reason: null },
    vscode: { available: true, reason: null },
  };
  const onlyOpenCode: DesktopCodingToolAvailability = {
    opencode: { available: true, reason: null },
    vscode: { available: false, reason: null },
  };

  assert.equal(
    resolvePreferredCodingTool({ preferredCodingTool: "opencode" }, onlyVsCode),
    "vscode",
  );
  assert.equal(
    resolvePreferredCodingTool({ preferredCodingTool: "vscode" }, onlyOpenCode),
    "opencode",
  );
});

test("resolvePreferredCodingTool defaults to VS Code when nothing is available", () => {
  const nothing: DesktopCodingToolAvailability = {
    opencode: { available: false, reason: null },
    vscode: { available: false, reason: null },
  };

  assert.equal(
    resolvePreferredCodingTool({ preferredCodingTool: "opencode" }, nothing),
    "vscode",
  );
});

test("isCodingToolAvailable reads availability entries safely", () => {
  const availability: DesktopCodingToolAvailability = {
    opencode: { available: true, reason: null },
    vscode: { available: false, reason: "Missing" },
  };

  assert.equal(isCodingToolAvailable(availability, "opencode"), true);
  assert.equal(isCodingToolAvailable(availability, "vscode"), false);
});

test("label helpers surface the expected human strings", () => {
  assert.equal(getCodingToolLabel("opencode"), "OpenCode");
  assert.equal(getCodingToolLabel("vscode"), "VS Code");
  assert.equal(getCodingToolShortLabel("opencode"), "OpenCode");
  assert.equal(getCodingToolShortLabel("vscode"), "Code");
});

test("install hints include actionable guidance", () => {
  assert.match(getCodingToolInstallHint("opencode"), /opencode\.ai/);
  assert.match(getCodingToolInstallHint("vscode"), /code\.visualstudio\.com/);
});
