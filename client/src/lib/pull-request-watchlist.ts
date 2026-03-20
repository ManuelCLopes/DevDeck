export interface PullRequestWatchlistEntry {
  markedAt: string;
}

export type PullRequestWatchlist = Record<string, PullRequestWatchlistEntry>;

const PULL_REQUEST_WATCHLIST_KEY = "devdeck:pull-request-watchlist";
const PULL_REQUEST_WATCHLIST_EVENT = "devdeck:pull-request-watchlist-updated";
const EMPTY_PULL_REQUEST_WATCHLIST = Object.freeze({}) as PullRequestWatchlist;

let cachedWatchlistRaw: string | null = null;
let cachedWatchlist: PullRequestWatchlist = EMPTY_PULL_REQUEST_WATCHLIST;

function normalizePullRequestWatchlist(
  value: PullRequestWatchlist | string[] | null | undefined,
) {
  if (!value) {
    return EMPTY_PULL_REQUEST_WATCHLIST;
  }

  if (Array.isArray(value)) {
    return value.reduce<PullRequestWatchlist>((watchlist, pullRequestId) => {
      if (typeof pullRequestId !== "string" || pullRequestId.length === 0) {
        return watchlist;
      }

      watchlist[pullRequestId] = {
        markedAt: new Date().toISOString(),
      };
      return watchlist;
    }, {});
  }

  return Object.entries(value).reduce<PullRequestWatchlist>(
    (watchlist, [pullRequestId, entry]) => {
      if (typeof pullRequestId !== "string" || pullRequestId.length === 0) {
        return watchlist;
      }

      watchlist[pullRequestId] = {
        markedAt:
          typeof entry?.markedAt === "string" && entry.markedAt.length > 0
            ? entry.markedAt
            : new Date().toISOString(),
      };
      return watchlist;
    },
    {},
  );
}

function dispatchPullRequestWatchlistChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(PULL_REQUEST_WATCHLIST_EVENT));
}

function persistPullRequestWatchlist(watchlist: PullRequestWatchlist) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedWatchlist = normalizePullRequestWatchlist(watchlist);
  const rawWatchlist = JSON.stringify(normalizedWatchlist);
  cachedWatchlistRaw = rawWatchlist;
  cachedWatchlist = normalizedWatchlist;
  localStorage.setItem(PULL_REQUEST_WATCHLIST_KEY, rawWatchlist);
  dispatchPullRequestWatchlistChanged();
}

export function subscribePullRequestWatchlist(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => listener();
  window.addEventListener(PULL_REQUEST_WATCHLIST_EVENT, handleChange);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(PULL_REQUEST_WATCHLIST_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function getPullRequestWatchlist() {
  if (typeof window === "undefined") {
    return EMPTY_PULL_REQUEST_WATCHLIST;
  }

  const rawWatchlist = localStorage.getItem(PULL_REQUEST_WATCHLIST_KEY);
  if (!rawWatchlist) {
    cachedWatchlistRaw = null;
    cachedWatchlist = EMPTY_PULL_REQUEST_WATCHLIST;
    return cachedWatchlist;
  }

  if (rawWatchlist === cachedWatchlistRaw) {
    return cachedWatchlist;
  }

  try {
    cachedWatchlistRaw = rawWatchlist;
    cachedWatchlist = normalizePullRequestWatchlist(
      JSON.parse(rawWatchlist) as PullRequestWatchlist | string[],
    );
    return cachedWatchlist;
  } catch {
    cachedWatchlistRaw = null;
    cachedWatchlist = EMPTY_PULL_REQUEST_WATCHLIST;
    return cachedWatchlist;
  }
}

export function getMarkedPullRequestIds(
  watchlist: PullRequestWatchlist = getPullRequestWatchlist(),
) {
  return new Set(Object.keys(watchlist));
}

export function isPullRequestMarkedForReview(
  pullRequestId: string,
  watchlist: PullRequestWatchlist = getPullRequestWatchlist(),
) {
  return Object.prototype.hasOwnProperty.call(watchlist, pullRequestId);
}

export function setPullRequestMarkedForReview(
  pullRequestId: string,
  marked: boolean,
) {
  if (typeof window === "undefined" || pullRequestId.length === 0) {
    return;
  }

  const currentWatchlist = getPullRequestWatchlist();
  if (marked) {
    persistPullRequestWatchlist({
      ...currentWatchlist,
      [pullRequestId]: currentWatchlist[pullRequestId] ?? {
        markedAt: new Date().toISOString(),
      },
    });
    return;
  }

  const { [pullRequestId]: _removedEntry, ...nextWatchlist } = currentWatchlist;
  persistPullRequestWatchlist(nextWatchlist);
}
