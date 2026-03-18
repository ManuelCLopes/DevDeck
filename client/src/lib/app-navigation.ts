import { useEffect, useState } from "react";

type NavigateFn = (targetPath: string) => void;

const historyEntries: string[] = [];
const listeners = new Set<() => void>();
let currentIndex = -1;

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function getCurrentState() {
  return {
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex >= 0 && currentIndex < historyEntries.length - 1,
  };
}

function pushRoute(routeKey: string) {
  historyEntries.splice(currentIndex + 1);
  historyEntries.push(routeKey);
  currentIndex = historyEntries.length - 1;
}

export function syncAppRoute(routeKey: string) {
  if (!routeKey) {
    return;
  }

  if (currentIndex === -1) {
    pushRoute(routeKey);
    notifyListeners();
    return;
  }

  if (historyEntries[currentIndex] === routeKey) {
    return;
  }

  if (historyEntries[currentIndex - 1] === routeKey) {
    currentIndex -= 1;
    notifyListeners();
    return;
  }

  if (historyEntries[currentIndex + 1] === routeKey) {
    currentIndex += 1;
    notifyListeners();
    return;
  }

  pushRoute(routeKey);
  notifyListeners();
}

export function goBackInApp(navigate: NavigateFn) {
  if (currentIndex <= 0) {
    return;
  }

  currentIndex -= 1;
  notifyListeners();
  navigate(historyEntries[currentIndex]);
}

export function goForwardInApp(navigate: NavigateFn) {
  if (currentIndex < 0 || currentIndex >= historyEntries.length - 1) {
    return;
  }

  currentIndex += 1;
  notifyListeners();
  navigate(historyEntries[currentIndex]);
}

export function useAppNavigation(routeKey: string) {
  const [navigationState, setNavigationState] = useState(getCurrentState);

  useEffect(() => {
    syncAppRoute(routeKey);
    setNavigationState(getCurrentState());

    const listener = () => {
      setNavigationState(getCurrentState());
    };

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [routeKey]);

  return navigationState;
}
