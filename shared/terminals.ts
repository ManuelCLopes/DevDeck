export interface SpawnPtyRequest {
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  label?: string;
}

export interface SpawnPtyResult {
  id: string;
  pid: number;
  shell: string;
  label: string;
  cwd: string;
}

export interface PtyAvailability {
  available: boolean;
  reason: string | null;
  platform: NodeJS.Platform | null;
  defaultShell: string | null;
  homeDir: string | null;
}

export interface PtyDataPayload {
  id: string;
  chunk: string;
}

export interface PtyExitPayload {
  id: string;
  exitCode: number;
  signal: number | null;
}
