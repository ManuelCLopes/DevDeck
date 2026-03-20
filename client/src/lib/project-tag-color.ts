import { cn } from "@/lib/utils";

const PROJECT_TAG_PALETTES = [
  "border-sky-200 bg-sky-50 text-sky-800",
  "border-emerald-200 bg-emerald-50 text-emerald-800",
  "border-amber-200 bg-amber-50 text-amber-800",
  "border-violet-200 bg-violet-50 text-violet-800",
  "border-rose-200 bg-rose-50 text-rose-800",
  "border-cyan-200 bg-cyan-50 text-cyan-800",
  "border-teal-200 bg-teal-50 text-teal-800",
  "border-orange-200 bg-orange-50 text-orange-800",
];

function hashProjectName(projectName: string) {
  let hash = 0;

  for (const character of projectName.trim().toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function getProjectTagClassName(projectName: string, className?: string) {
  const palette =
    PROJECT_TAG_PALETTES[hashProjectName(projectName) % PROJECT_TAG_PALETTES.length] ??
    PROJECT_TAG_PALETTES[0];

  return cn(
    "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium",
    palette,
    className,
  );
}
