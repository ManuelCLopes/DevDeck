import { useEffect } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

interface PaginationOptions {
  resetKey?: string | number | null;
  storageKey?: string;
}

function isPaginationOptions(value: unknown): value is PaginationOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("resetKey" in value || "storageKey" in value)
  );
}

export function usePagination<T>(
  items: T[],
  pageSize: number,
  options?: PaginationOptions | string | number | null,
) {
  const normalizedOptions: PaginationOptions =
    isPaginationOptions(options)
      ? options
      : {
          resetKey:
            typeof options === "string" || typeof options === "number" || options == null
              ? options
              : undefined,
        };
  const [currentPage, setCurrentPage] = usePersistentState<number>(
    normalizedOptions.storageKey ?? `devdeck:pagination:${pageSize}`,
    1,
    { persist: Boolean(normalizedOptions.storageKey) },
  );
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedOptions.resetKey, setCurrentPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [setCurrentPage, totalPages]);

  return {
    currentPage,
    endItem: totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems),
    paginatedItems,
    pageSize,
    setCurrentPage,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    totalItems,
    totalPages,
  };
}
