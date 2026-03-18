export function getDesktopApi() {
  return window.devdeck ?? null;
}

export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.devdeck);
}
