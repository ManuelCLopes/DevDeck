import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";

interface UsePersistentStateOptions<T> {
  persist?: boolean;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
}

export function usePersistentState<T>(
  storageKey: string,
  initialValue: T,
  options?: UsePersistentStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const persist = options?.persist ?? true;
  const deserialize = useMemo(
    () => options?.deserialize ?? ((value: string) => JSON.parse(value) as T),
    [options?.deserialize],
  );
  const serialize = useMemo(
    () => options?.serialize ?? ((value: T) => JSON.stringify(value)),
    [options?.serialize],
  );

  const [state, setState] = useState<T>(() => {
    if (!persist || typeof window === "undefined") {
      return initialValue;
    }

    const rawValue = localStorage.getItem(storageKey);
    if (!rawValue) {
      return initialValue;
    }

    try {
      return deserialize(rawValue);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (!persist || typeof window === "undefined") {
      return;
    }

    localStorage.setItem(storageKey, serialize(state));
  }, [persist, serialize, state, storageKey]);

  return [state, setState];
}
