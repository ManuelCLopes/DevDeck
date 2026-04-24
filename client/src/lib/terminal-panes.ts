export type TerminalLayout = "single" | "columns" | "rows" | "grid";

export type TerminalPaneAccent =
  | "slate"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

export interface TerminalPaneAccentDefinition {
  key: TerminalPaneAccent;
  label: string;
  dotClassName: string;
  headerClassName: string;
  panelClassName: string;
  ringClassName: string;
}

export interface TerminalPaneConfig {
  id: string;
  label: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  accent?: TerminalPaneAccent;
}

export const TERMINAL_PANE_ACCENTS: TerminalPaneAccentDefinition[] = [
  {
    key: "slate",
    label: "Slate",
    dotClassName: "bg-slate-500",
    headerClassName: "bg-slate-50 text-slate-700",
    panelClassName: "border-slate-200/80 bg-slate-50/30",
    ringClassName: "ring-slate-300/70",
  },
  {
    key: "blue",
    label: "Blue",
    dotClassName: "bg-blue-500",
    headerClassName: "bg-blue-50 text-blue-700",
    panelClassName: "border-blue-200/80 bg-blue-50/30",
    ringClassName: "ring-blue-300/70",
  },
  {
    key: "emerald",
    label: "Emerald",
    dotClassName: "bg-emerald-500",
    headerClassName: "bg-emerald-50 text-emerald-700",
    panelClassName: "border-emerald-200/80 bg-emerald-50/30",
    ringClassName: "ring-emerald-300/70",
  },
  {
    key: "amber",
    label: "Amber",
    dotClassName: "bg-amber-500",
    headerClassName: "bg-amber-50 text-amber-700",
    panelClassName: "border-amber-200/80 bg-amber-50/30",
    ringClassName: "ring-amber-300/70",
  },
  {
    key: "rose",
    label: "Rose",
    dotClassName: "bg-rose-500",
    headerClassName: "bg-rose-50 text-rose-700",
    panelClassName: "border-rose-200/80 bg-rose-50/30",
    ringClassName: "ring-rose-300/70",
  },
  {
    key: "violet",
    label: "Violet",
    dotClassName: "bg-violet-500",
    headerClassName: "bg-violet-50 text-violet-700",
    panelClassName: "border-violet-200/80 bg-violet-50/30",
    ringClassName: "ring-violet-300/70",
  },
];

export function getDefaultTerminalPaneAccent(index: number): TerminalPaneAccent {
  return TERMINAL_PANE_ACCENTS[index % TERMINAL_PANE_ACCENTS.length]?.key ?? "slate";
}

export function getTerminalPaneAccentDefinition(
  accent: TerminalPaneAccent | undefined,
) {
  return (
    TERMINAL_PANE_ACCENTS.find((candidate) => candidate.key === accent) ??
    TERMINAL_PANE_ACCENTS[0]
  );
}
