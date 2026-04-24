// Minimal ambient type shim so the electron main typechecks before
// `npm install` has fetched node-pty. The real package ships its own
// declarations; once installed, TypeScript prefers those. Safe to
// delete once lockfiles are synced.

declare module "node-pty" {
  export interface IDisposable {
    dispose(): void;
  }

  export interface IPty {
    readonly pid: number;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    onData(listener: (data: string) => void): IDisposable;
    onExit(
      listener: (event: { exitCode: number; signal?: number }) => void,
    ): IDisposable;
  }

  export interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
    encoding?: string | null;
    handleFlowControl?: boolean;
  }

  export function spawn(
    file: string,
    args: string[] | string,
    options?: IPtyForkOptions,
  ): IPty;
}
