const ONBOARDING_COMPLETED_KEY = "devdeck_onboarding_completed";
const LEGACY_ONBOARDING_COMPLETED_KEY = "oversight_onboarding_completed";

export function hasCompletedOnboarding() {
  return (
    localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true" ||
    localStorage.getItem(LEGACY_ONBOARDING_COMPLETED_KEY) === "true"
  );
}

export function setCompletedOnboarding() {
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  localStorage.removeItem(LEGACY_ONBOARDING_COMPLETED_KEY);
}

export function clearCompletedOnboarding() {
  localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  localStorage.removeItem(LEGACY_ONBOARDING_COMPLETED_KEY);
}
