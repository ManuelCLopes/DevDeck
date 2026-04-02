import test from "node:test";
import assert from "node:assert/strict";
import {
  getPullRequestWatchStatus,
  getPullRequestWatchlist,
  setPullRequestMarkedForReview,
  setPullRequestWatchStatus,
} from "./pull-request-watchlist";

class MemoryStorage {
  private storage = new Map<string, string>();

  getItem(key: string) {
    return this.storage.has(key) ? this.storage.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.storage.set(key, value);
  }

  removeItem(key: string) {
    this.storage.delete(key);
  }

  clear() {
    this.storage.clear();
  }
}

test("getPullRequestWatchlist returns a stable empty snapshot when nothing is stored", () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const localStorage = new MemoryStorage() as unknown as Storage;
  const fakeWindow = {
    addEventListener() {},
    dispatchEvent() {
      return true;
    },
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });

  try {
    const firstSnapshot = getPullRequestWatchlist();
    const secondSnapshot = getPullRequestWatchlist();

    assert.equal(firstSnapshot, secondSnapshot);
    assert.deepEqual(firstSnapshot, {});
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});

test("setPullRequestMarkedForReview persists and removes local watchlist entries", () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const localStorage = new MemoryStorage() as unknown as Storage;
  const fakeWindow = {
    addEventListener() {},
    dispatchEvent() {
      return true;
    },
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });

  try {
    setPullRequestMarkedForReview("repo#12", true);
    assert.deepEqual(Object.keys(getPullRequestWatchlist()), ["repo#12"]);
    assert.equal(getPullRequestWatchStatus("repo#12"), "marked");

    setPullRequestMarkedForReview("repo#12", false);
    assert.deepEqual(getPullRequestWatchlist(), {});
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});

test("setPullRequestWatchStatus persists the reviewed stage", () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const localStorage = new MemoryStorage() as unknown as Storage;
  const fakeWindow = {
    addEventListener() {},
    dispatchEvent() {
      return true;
    },
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });

  try {
    setPullRequestWatchStatus("repo#99", "reviewed");
    assert.equal(getPullRequestWatchStatus("repo#99"), "reviewed");

    setPullRequestWatchStatus("repo#99", null);
    assert.equal(getPullRequestWatchStatus("repo#99"), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});

test("getPullRequestWatchlist normalizes legacy queue statuses to reviewed", () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const localStorage = new MemoryStorage() as unknown as Storage;
  const fakeWindow = {
    addEventListener() {},
    dispatchEvent() {
      return true;
    },
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });

  try {
    localStorage.setItem(
      "devdeck:pull-request-watchlist",
      JSON.stringify({
        "repo#12": {
          markedAt: "2026-03-18T20:00:00.000Z",
          status: "in_review",
          updatedAt: "2026-03-18T20:30:00.000Z",
        },
        "repo#13": {
          markedAt: "2026-03-18T21:00:00.000Z",
          status: "done",
          updatedAt: "2026-03-18T21:30:00.000Z",
        },
      }),
    );

    const watchlist = getPullRequestWatchlist();

    assert.equal(watchlist["repo#12"]?.status, "reviewed");
    assert.equal(watchlist["repo#13"]?.status, "reviewed");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});
