import { useMemo } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

export type TerminalThemeName = "devdeck" | "dark" | "light" | "solarized";
export type TerminalCursorStyle = "block" | "bar" | "underline";
export type TerminalFontFamilyKey =
  | "sf-mono"
  | "jetbrains-mono"
  | "fira-code"
  | "menlo"
  | "ibm-plex-mono";
export type AppThemePreset = "classic" | "graphite" | "circuit" | "signal";
export type AppThemeMode = "light" | "dark" | "system";

export interface AppThemePresetOption {
  accentClassName: string;
  description: string;
  id: AppThemePreset;
  label: string;
  swatches: string[];
}

export interface TerminalPreferences {
  cursorBlink: boolean;
  cursorStyle: TerminalCursorStyle;
  defaultShell: string | null;
  fontFamily: TerminalFontFamilyKey;
  fontSize: number;
  scrollback: number;
  theme: TerminalThemeName;
}

export interface AppPreferences {
  alertFailingBuilds: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  highlightStalePrs: boolean;
  keepRunningInBackground: boolean;
  launchAtLogin: boolean;
  notifyApproved: boolean;
  notifyChangesRequested: boolean;
  notifyReviewRequired: boolean;
  preferredCodingTool: "opencode" | "vscode";
  refreshOnWindowFocus: boolean;
  showMenuBarIcon: boolean;
  themeMode: AppThemeMode;
  themePreset: AppThemePreset;
  terminal: TerminalPreferences;
}

export const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  cursorBlink: true,
  cursorStyle: "block",
  defaultShell: null,
  fontFamily: "sf-mono",
  fontSize: 13,
  scrollback: 5000,
  theme: "devdeck",
};

const APP_PREFERENCES_KEY = "devdeck_app_preferences";

export const APP_THEME_PRESET_OPTIONS: AppThemePresetOption[] = [
  {
    accentClassName: "bg-zinc-900",
    description: "Neutral macOS workbench with high contrast controls.",
    id: "classic",
    label: "Classic",
    swatches: ["bg-zinc-950", "bg-zinc-200", "bg-emerald-500", "bg-sky-500"],
  },
  {
    accentClassName: "bg-stone-800",
    description: "Graphite surfaces with muted steel accents.",
    id: "graphite",
    label: "Graphite",
    swatches: ["bg-stone-900", "bg-stone-300", "bg-cyan-500", "bg-amber-500"],
  },
  {
    accentClassName: "bg-emerald-700",
    description: "Sharper execution theme with terminal-inspired greens.",
    id: "circuit",
    label: "Circuit",
    swatches: ["bg-emerald-700", "bg-teal-200", "bg-lime-500", "bg-orange-500"],
  },
  {
    accentClassName: "bg-rose-700",
    description: "Signal-forward theme with warmer priority accents.",
    id: "signal",
    label: "Signal",
    swatches: ["bg-rose-700", "bg-sky-300", "bg-teal-500", "bg-amber-500"],
  },
];

const APP_THEME_PRESET_IDS = new Set<AppThemePreset>(
  APP_THEME_PRESET_OPTIONS.map((option) => option.id),
);
const APP_THEME_MODES = new Set<AppThemeMode>(["light", "dark", "system"]);

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  alertFailingBuilds: true,
  autoRefreshEnabled: true,
  // 1 hour — was 30s. GitHub's API rate limit is shared across every
  // tracked repo's PR/CI/review lookups in one refresh; polling every
  // 30s made it easy to burn through that budget over a session. Still
  // user-adjustable in Settings for anyone who wants tighter feedback.
  autoRefreshIntervalSeconds: 3600,
  highlightStalePrs: true,
  keepRunningInBackground: true,
  launchAtLogin: false,
  notifyApproved: true,
  notifyChangesRequested: true,
  notifyReviewRequired: true,
  preferredCodingTool: "vscode",
  refreshOnWindowFocus: true,
  showMenuBarIcon: true,
  themeMode: "system",
  themePreset: "classic",
  terminal: DEFAULT_TERMINAL_PREFERENCES,
};

function normalizeThemePreset(value: unknown): AppThemePreset {
  return typeof value === "string" && APP_THEME_PRESET_IDS.has(value as AppThemePreset)
    ? (value as AppThemePreset)
    : DEFAULT_APP_PREFERENCES.themePreset;
}

function normalizeThemeMode(value: unknown): AppThemeMode {
  return typeof value === "string" && APP_THEME_MODES.has(value as AppThemeMode)
    ? (value as AppThemeMode)
    : DEFAULT_APP_PREFERENCES.themeMode;
}

export function normalizeAppPreferences(
  rawPreferences: Partial<AppPreferences> | null | undefined,
) {
  const mergedTerminal: TerminalPreferences = {
    ...DEFAULT_TERMINAL_PREFERENCES,
    ...((rawPreferences?.terminal ?? {}) as Partial<TerminalPreferences>),
  };

  const mergedPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    ...(rawPreferences ?? {}),
    terminal: mergedTerminal,
  };

  return {
    ...mergedPreferences,
    themeMode: normalizeThemeMode(mergedPreferences.themeMode),
    themePreset: normalizeThemePreset(mergedPreferences.themePreset),
  };
}

export function applyAppThemePreferences(
  preferences: Pick<AppPreferences, "themeMode" | "themePreset">,
) {
  if (typeof window === "undefined") {
    return;
  }

  const root = window.document.documentElement;
  root.dataset.theme = normalizeThemePreset(preferences.themePreset);

  const effectiveTheme =
    normalizeThemeMode(preferences.themeMode) === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : normalizeThemeMode(preferences.themeMode);
  root.classList.toggle("dark", effectiveTheme === "dark");
}

export function getAppPreferences() {
  if (typeof window === "undefined") {
    return DEFAULT_APP_PREFERENCES;
  }

  const rawPreferences = localStorage.getItem(APP_PREFERENCES_KEY);
  if (!rawPreferences) {
    return DEFAULT_APP_PREFERENCES;
  }

  try {
    return normalizeAppPreferences(JSON.parse(rawPreferences) as Partial<AppPreferences>);
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function useAppPreferences() {
  const [preferences, setPreferences] = usePersistentState<AppPreferences>(
    APP_PREFERENCES_KEY,
    DEFAULT_APP_PREFERENCES,
    {
      deserialize: (value) =>
        normalizeAppPreferences(JSON.parse(value) as Partial<AppPreferences>),
    },
  );
  const normalizedPreferences = useMemo(
    () => normalizeAppPreferences(preferences),
    [preferences],
  );

  return useMemo(
    () => ({
      preferences: normalizedPreferences,
      setPreference<Key extends keyof AppPreferences>(
        key: Key,
        value: AppPreferences[Key],
      ) {
        const nextPreferences = normalizeAppPreferences({
          ...normalizedPreferences,
          [key]: value,
        });
        setPreferences(nextPreferences);

        if (key === "themeMode" || key === "themePreset") {
          applyAppThemePreferences(nextPreferences);
        }
      },
      setPreferences,
    }),
    [normalizedPreferences, setPreferences],
  );
}
