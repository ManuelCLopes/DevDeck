import type {
  TerminalCursorStyle,
  TerminalFontFamilyKey,
  TerminalPreferences,
  TerminalThemeName,
} from "@/lib/app-preferences";

export interface TerminalColorTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalThemeDefinition {
  key: TerminalThemeName;
  label: string;
  surface: "light" | "dark";
  colors: TerminalColorTheme;
}

export interface TerminalFontFamilyDefinition {
  key: TerminalFontFamilyKey;
  label: string;
  stack: string;
}

export const TERMINAL_FONT_FAMILIES: TerminalFontFamilyDefinition[] = [
  {
    key: "sf-mono",
    label: "SF Mono",
    stack:
      "'SF Mono', 'SFMono-Regular', Menlo, Monaco, 'JetBrains Mono', 'Fira Code', monospace",
  },
  {
    key: "jetbrains-mono",
    label: "JetBrains Mono",
    stack:
      "'JetBrains Mono', 'SF Mono', Menlo, Monaco, 'Fira Code', monospace",
  },
  {
    key: "fira-code",
    label: "Fira Code",
    stack:
      "'Fira Code', 'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace",
  },
  {
    key: "menlo",
    label: "Menlo",
    stack: "Menlo, Monaco, 'SF Mono', 'Fira Code', monospace",
  },
  {
    key: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack:
      "'IBM Plex Mono', 'SF Mono', Menlo, Monaco, 'JetBrains Mono', monospace",
  },
];

export const TERMINAL_THEMES: TerminalThemeDefinition[] = [
  {
    key: "devdeck",
    label: "DevDeck",
    surface: "light",
    colors: {
      background: "#fbfbfb",
      foreground: "#1f2430",
      cursor: "#2f6feb",
      cursorAccent: "#fbfbfb",
      selectionBackground: "rgba(47, 111, 235, 0.22)",
      black: "#1f2430",
      red: "#d73a49",
      green: "#22863a",
      yellow: "#b08800",
      blue: "#2f6feb",
      magenta: "#6f42c1",
      cyan: "#1b7c83",
      white: "#e1e4e8",
      brightBlack: "#6a737d",
      brightRed: "#cb2431",
      brightGreen: "#28a745",
      brightYellow: "#dbab09",
      brightBlue: "#005cc5",
      brightMagenta: "#8a63d2",
      brightCyan: "#3192aa",
      brightWhite: "#f6f8fa",
    },
  },
  {
    key: "dark",
    label: "Midnight",
    surface: "dark",
    colors: {
      background: "#0f1115",
      foreground: "#e6e6e6",
      cursor: "#7aa2f7",
      cursorAccent: "#0f1115",
      selectionBackground: "rgba(122, 162, 247, 0.3)",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#ff7a93",
      brightGreen: "#b9f27c",
      brightYellow: "#ff9e64",
      brightBlue: "#7da6ff",
      brightMagenta: "#bb9af7",
      brightCyan: "#0db9d7",
      brightWhite: "#c0caf5",
    },
  },
  {
    key: "light",
    label: "Paper",
    surface: "light",
    colors: {
      background: "#fefefe",
      foreground: "#1a1a1a",
      cursor: "#0969da",
      cursorAccent: "#fefefe",
      selectionBackground: "rgba(9, 105, 218, 0.16)",
      black: "#24292f",
      red: "#cf222e",
      green: "#116329",
      yellow: "#9a6700",
      blue: "#0969da",
      magenta: "#8250df",
      cyan: "#1b7c83",
      white: "#eaeef2",
      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#1a7f37",
      brightYellow: "#4d2d00",
      brightBlue: "#0550ae",
      brightMagenta: "#6639ba",
      brightCyan: "#3192aa",
      brightWhite: "#f6f8fa",
    },
  },
  {
    key: "solarized",
    label: "Solarized",
    surface: "light",
    colors: {
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#586e75",
      cursorAccent: "#fdf6e3",
      selectionBackground: "rgba(88, 110, 117, 0.22)",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
];

export function getTerminalTheme(name: TerminalThemeName): TerminalThemeDefinition {
  return (
    TERMINAL_THEMES.find((theme) => theme.key === name) ?? TERMINAL_THEMES[0]
  );
}

export function getTerminalFontFamily(
  key: TerminalFontFamilyKey,
): TerminalFontFamilyDefinition {
  return (
    TERMINAL_FONT_FAMILIES.find((font) => font.key === key) ??
    TERMINAL_FONT_FAMILIES[0]
  );
}

export function clampFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return 13;
  }
  return Math.min(22, Math.max(10, Math.round(value)));
}

export function clampScrollback(value: number) {
  if (!Number.isFinite(value)) {
    return 5000;
  }
  return Math.min(50_000, Math.max(500, Math.round(value)));
}

export function xtermCursorStyleFromPreferences(style: TerminalCursorStyle) {
  switch (style) {
    case "bar":
      return "bar" as const;
    case "underline":
      return "underline" as const;
    default:
      return "block" as const;
  }
}

export interface XtermOptionsFromPreferencesInput {
  preferences: TerminalPreferences;
}

export function getXtermOptionsFromPreferences({
  preferences,
}: XtermOptionsFromPreferencesInput) {
  const theme = getTerminalTheme(preferences.theme);
  const fontFamily = getTerminalFontFamily(preferences.fontFamily).stack;

  return {
    allowProposedApi: true,
    cursorBlink: preferences.cursorBlink,
    cursorStyle: xtermCursorStyleFromPreferences(preferences.cursorStyle),
    fontFamily,
    fontSize: clampFontSize(preferences.fontSize),
    scrollback: clampScrollback(preferences.scrollback),
    theme: theme.colors,
  };
}
