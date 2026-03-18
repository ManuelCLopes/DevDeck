import type { PullRequestFocus } from "@/lib/pull-request-utils";

export const REVIEW_FOCUS_STORAGE_KEY = "devdeck:reviews:focus-filter";

export function setStoredReviewFocus(focus: PullRequestFocus) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(REVIEW_FOCUS_STORAGE_KEY, JSON.stringify(focus));
}
