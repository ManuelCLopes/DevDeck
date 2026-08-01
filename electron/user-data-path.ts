import { homedir } from "os";
import path from "path";

export function getDevDeckUserDataPath() {
  const explicitPath = process.env.DEVDECK_USER_DATA_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const homeDirectory = homedir();
  if (process.platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support", "DevDeck");
  }

  return path.join(homeDirectory, ".devdeck");
}
