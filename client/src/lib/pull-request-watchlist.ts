export type PullRequestWatchStatus = "marked" | "in_review" | "done";

export interface PullRequestWatchlistEntry {
  markedAt: string;
  status: PullRequestWatchStatus;
  updatedAt: string;
}

export type PullRequestWatchlist = Record<string, PullRequestWatchlistEntry>;

const PULL_REQUEST_WATCHLIST_KEY = "devdeck:pull-request-watchlist";
const PULL_REQUEST_WATCHLIST_EVENT = "devdeck:pull-request-watchlist-updated";
const EMPTY_PULL_REQUEST_WATCHLIST = Object.freeze({}) as PullRequestWatchlist;

let cachedWatchlistRaw: string | null = null;
let cachedWatchlist: PullRequestWatchlist = EMPTY_PULL_REQUEST_WATCHLIST;

function isPullRequestWatchStatus(value: string): value is PullRequestWatchStatus {
  return value === "marked" || value === "in_review" || value === "done";
}

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

      const timestamp = new Date().toISOString();
      watchlist[pullRequestId] = {
        markedAt: timestamp,
        status: "marked",
        updatedAt: timestamp,
      };
      return watchlist;
    }, {});
  }

  return Object.entries(value).reduce<PullRequestWatchlist>(
    (watchlist, [pullRequestId, entry]) => {
      if (typeof pullRequestId !== "string" || pullRequestId.length === 0) {
        return watchlist;
      }

      const markedAt =
        typeof entry?.markedAt === "string" && entry.markedAt.length > 0
          ? entry.markedAt
          : new Date().toISOString();
      watchlist[pullRequestId] = {
        markedAt,
        status:
          typeof entry?.status === "string" && isPullRequestWatchStatus(entry.status)
            ? entry.status
            : "marked",
        updatedAt:
          typeof entry?.updatedAt === "string" && entry.updatedAt.length > 0
            ? entry.updatedAt
            : markedAt,
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
  return new Set(
    Object.entries(watchlist)
      .filter(([, entry]) => entry.status === "marked")
      .map(([pullRequestId]) => pullRequestId),
  );
}

export function getPullRequestQueueIds(
  watchlist: PullRequestWatchlist = getPullRequestWatchlist(),
  status?: PullRequestWatchStatus,
) {
  return new Set(
    Object.entries(watchlist)
      .filter(([, entry]) => (status ? entry.status === status : true))
      .map(([pullRequestId]) => pullRequestId),
  );
}

export function getPullRequestWatchStatus(
  pullRequestId: string,
  watchlist: PullRequestWatchlist = getPullRequestWatchlist(),
) {
  return watchlist[pullRequestId]?.status ?? null;
}

export function isPullRequestMarkedForReview(
  pullRequestId: string,
  watchlist: PullRequestWatchlist = getPullRequestWatchlist(),
) {
  return watchlist[pullRequestId]?.status === "marked";
}

export function setPullRequestWatchStatus(
  pullRequestId: string,
  status: PullRequestWatchStatus | null,
) {
  if (typeof window === "undefined" || pullRequestId.length === 0) {
    return;
  }

  const currentWatchlist = getPullRequestWatchlist();
  if (!status) {
    const { [pullRequestId]: _removedEntry, ...nextWatchlist } = currentWatchlist;
    persistPullRequestWatchlist(nextWatchlist);
    return;
  }

  const timestamp = new Date().toISOString();
  persistPullRequestWatchlist({
    ...currentWatchlist,
    [pullRequestId]: {
      markedAt: currentWatchlist[pullRequestId]?.markedAt ?? timestamp,
      status,
      updatedAt: timestamp,
    },
  });
}

export function setPullRequestMarkedForReview(
  pullRequestId: string,
  marked: boolean,
) {
  setPullRequestWatchStatus(pullRequestId, marked ? "marked" : null);
}
