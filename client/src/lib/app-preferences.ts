import { useMemo } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

export interface AppPreferences {
  alertFailingBuilds: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  highlightStalePrs: boolean;
  launchAtLogin: boolean;
  notifyApproved: boolean;
  notifyChangesRequested: boolean;
  notifyReviewRequired: boolean;
  refreshOnWindowFocus: boolean;
}

const APP_PREFERENCES_KEY = "devdeck_app_preferences";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  alertFailingBuilds: true,
  autoRefreshEnabled: true,
  autoRefreshIntervalSeconds: 30,
  highlightStalePrs: true,
  launchAtLogin: false,
  notifyApproved: true,
  notifyChangesRequested: true,
  notifyReviewRequired: true,
  refreshOnWindowFocus: true,
};

function mergeAppPreferences(
  rawPreferences: Partial<AppPreferences> | null | undefined,
) {
  return {
    ...DEFAULT_APP_PREFERENCES,
    ...(rawPreferences ?? {}),
  };
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
    return mergeAppPreferences(JSON.parse(rawPreferences) as Partial<AppPreferences>);
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
        mergeAppPreferences(JSON.parse(value) as Partial<AppPreferences>),
    },
  );
  const normalizedPreferences = useMemo(
    () => mergeAppPreferences(preferences),
    [preferences],
  );

  return useMemo(
    () => ({
      preferences: normalizedPreferences,
      setPreference<Key extends keyof AppPreferences>(
        key: Key,
        value: AppPreferences[Key],
      ) {
        setPreferences((currentPreferences) => ({
          ...currentPreferences,
          [key]: value,
        }));
      },
      setPreferences,
    }),
    [normalizedPreferences, setPreferences],
  );
}
