import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_THEME_PRESET_OPTIONS,
  DEFAULT_APP_PREFERENCES,
  getAppPreferences,
  normalizeAppPreferences,
} from "./app-preferences";

class MemoryStorage {
  private storage = new Map<string, string>();

  getItem(key: string) {
    return this.storage.has(key) ? this.storage.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.storage.set(key, value);
  }

  removeItem(key: string) {
    this.storage.delete(key);
  }

  clear() {
    this.storage.clear();
  }
}

function withMockedWindow(run: (localStorage: Storage) => void) {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const localStorage = new MemoryStorage() as unknown as Storage;
  const fakeWindow = { localStorage } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });

  try {
    run(localStorage);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    });
  }
}

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

test("getAppPreferences migrates a persisted legacy 30s auto-refresh interval to the new default", () => {
  withMockedWindow((localStorage) => {
    localStorage.setItem(
      "devdeck_app_preferences",
      JSON.stringify({ autoRefreshIntervalSeconds: 30, themePreset: "circuit" }),
    );

    const preferences = getAppPreferences();

    assert.equal(
      preferences.autoRefreshIntervalSeconds,
      DEFAULT_APP_PREFERENCES.autoRefreshIntervalSeconds,
    );
    // Untouched fields survive the migration.
    assert.equal(preferences.themePreset, "circuit");
    // The corrected value is persisted, not just returned in-memory.
    const persisted = JSON.parse(
      localStorage.getItem("devdeck_app_preferences") ?? "{}",
    );
    assert.equal(
      persisted.autoRefreshIntervalSeconds,
      DEFAULT_APP_PREFERENCES.autoRefreshIntervalSeconds,
    );
  });
});

test("getAppPreferences runs the legacy auto-refresh migration only once", () => {
  withMockedWindow((localStorage) => {
    localStorage.setItem(
      "devdeck_app_preferences",
      JSON.stringify({ autoRefreshIntervalSeconds: 30 }),
    );
    getAppPreferences();

    // A deliberate post-migration choice of "every 30 seconds" must not
    // be clobbered by a second migration pass.
    localStorage.setItem(
      "devdeck_app_preferences",
      JSON.stringify({ autoRefreshIntervalSeconds: 30 }),
    );
    const preferences = getAppPreferences();

    assert.equal(preferences.autoRefreshIntervalSeconds, 30);
  });
});

test("getAppPreferences leaves an explicitly chosen non-legacy auto-refresh interval alone", () => {
  withMockedWindow((localStorage) => {
    localStorage.setItem(
      "devdeck_app_preferences",
      JSON.stringify({ autoRefreshIntervalSeconds: 120 }),
    );

    const preferences = getAppPreferences();

    assert.equal(preferences.autoRefreshIntervalSeconds, 120);
  });
});
