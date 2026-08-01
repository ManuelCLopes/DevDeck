import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_THEME_PRESET_OPTIONS,
  DEFAULT_APP_PREFERENCES,
  normalizeAppPreferences,
} from "./app-preferences";

test("normalizeAppPreferences defaults to the classic DevDeck theme", () => {
  const preferences = normalizeAppPreferences(null);

  assert.equal(preferences.themePreset, "classic");
});

test("normalizeAppPreferences preserves supported DevDeck theme presets", () => {
  const preferences = normalizeAppPreferences({
    themePreset: "circuit",
  });

  assert.equal(preferences.themePreset, "circuit");
});

test("normalizeAppPreferences rejects unknown theme presets", () => {
  const preferences = normalizeAppPreferences({
    themePreset: "unknown",
  } as Partial<typeof DEFAULT_APP_PREFERENCES>);

  assert.equal(preferences.themePreset, DEFAULT_APP_PREFERENCES.themePreset);
});

test("APP_THEME_PRESET_OPTIONS exposes every supported theme once", () => {
  const themeIds = APP_THEME_PRESET_OPTIONS.map((theme) => theme.id);

  assert.deepEqual(themeIds, ["classic", "graphite", "circuit", "signal"]);
  assert.equal(new Set(themeIds).size, themeIds.length);
});
