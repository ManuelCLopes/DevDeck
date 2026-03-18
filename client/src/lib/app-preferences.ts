import { useMemo } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

export interface AppPreferences {
  alertFailingBuilds: boolean;
  highlightStalePrs: boolean;
  launchAtLogin: boolean;
  notifyApproved: boolean;
  notifyChangesRequested: boolean;
  notifyReviewRequired: boolean;
}

const APP_PREFERENCES_KEY = "devdeck_app_preferences";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  alertFailingBuilds: true,
  highlightStalePrs: true,
  launchAtLogin: false,
  notifyApproved: true,
  notifyChangesRequested: true,
  notifyReviewRequired: true,
};

export function getAppPreferences() {
  if (typeof window === "undefined") {
    return DEFAULT_APP_PREFERENCES;
  }

  const rawPreferences = localStorage.getItem(APP_PREFERENCES_KEY);
  if (!rawPreferences) {
    return DEFAULT_APP_PREFERENCES;
  }

  try {
    return {
      ...DEFAULT_APP_PREFERENCES,
      ...(JSON.parse(rawPreferences) as Partial<AppPreferences>),
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function useAppPreferences() {
  const [preferences, setPreferences] = usePersistentState<AppPreferences>(
    APP_PREFERENCES_KEY,
    DEFAULT_APP_PREFERENCES,
  );

  return useMemo(
    () => ({
      preferences,
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
    [preferences, setPreferences],
  );
}
