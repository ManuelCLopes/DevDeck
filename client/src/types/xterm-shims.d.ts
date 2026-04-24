// Minimal ambient type shims so the renderer typechecks before
// `npm install` has fetched the real @xterm/* packages. Once the packages
// are installed, the real declarations take precedence and this file
// becomes a no-op. Safe to delete once everyone's lockfile is up to date.

declare module "@xterm/xterm/css/xterm.css";

declare module "@xterm/xterm" {
  export interface ITheme {
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  }

  export interface ITerminalOptions {
    allowProposedApi?: boolean;
    cursorBlink?: boolean;
    cursorStyle?: "block" | "bar" | "underline";
    fontFamily?: string;
    fontSize?: number;
    scrollback?: number;
    theme?: ITheme;
  }

  export interface IDisposable {
    dispose(): void;
  }

  export interface ITerminalAddon {
    activate(terminal: Terminal): void;
    dispose(): void;
  }

  export class Terminal {
    constructor(options?: ITerminalOptions);
    readonly cols: number;
    readonly rows: number;
    readonly options: ITerminalOptions;
    open(container: HTMLElement): void;
    loadAddon(addon: ITerminalAddon): void;
    write(data: string): void;
    focus(): void;
    dispose(): void;
    clear(): void;
    clearSelection(): void;
    paste(data: string): void;
    getSelection(): string;
    hasSelection(): boolean;
    onData(listener: (data: string) => void): IDisposable;
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
  }
}

declare module "@xterm/addon-fit" {
  import type { ITerminalAddon } from "@xterm/xterm";

  export class FitAddon implements ITerminalAddon {
    activate(): void;
    dispose(): void;
    fit(): void;
  }
}

declare module "@xterm/addon-web-links" {
  import type { ITerminalAddon } from "@xterm/xterm";

  export class WebLinksAddon implements ITerminalAddon {
    constructor(handler?: (event: MouseEvent, uri: string) => void);
    activate(): void;
    dispose(): void;
  }
}
