import { useEffect, useState } from "react";

export function usePagination<T>(
  items: T[],
  pageSize: number,
  resetKey?: string | number | null,
) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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
