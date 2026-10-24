"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function generatePaginationPages(
  currentPage: number,
  totalPages: number,
): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  itemLabel = "items",
  className = "",
}: PaginationProps) {
  if (totalPages <= 1 && totalItems === undefined) {
    return null;
  }

  const pages = generatePaginationPages(currentPage, totalPages);

  const startItem =
    totalItems !== undefined && pageSize !== undefined
      ? Math.min((currentPage - 1) * pageSize + 1, totalItems)
      : undefined;

  const endItem =
    totalItems !== undefined && pageSize !== undefined
      ? Math.min(currentPage * pageSize, totalItems)
      : undefined;

  return (
    <nav
      role="navigation"
      aria-label="Pagination Navigation"
      className={`flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row ${className}`}
    >
      {/* Items count summary and optional per-page selector */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {totalItems !== undefined && startItem !== undefined && endItem !== undefined ? (
          <p>
            Showing <span className="font-semibold text-foreground">{startItem}</span> to{" "}
            <span className="font-semibold text-foreground">{endItem}</span> of{" "}
            <span className="font-semibold text-foreground">{totalItems}</span> {itemLabel}
          </p>
        ) : (
          <p>
            Page <span className="font-semibold text-foreground">{currentPage}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </p>
        )}

        {pageSizeOptions && onPageSizeChange && pageSize && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-border">
            <span className="text-[11px] text-muted-foreground">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Items per page"
              className="h-7 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Page navigation controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className="gap-1 rounded-xl text-xs font-medium"
            aria-label="Go to previous page"
          >
            <ChevronLeft className="size-3.5" />
            <span>Previous</span>
          </Button>

          <div className="flex items-center gap-1">
            {pages.map((p, index) => {
              if (p === "...") {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    aria-hidden="true"
                    className="grid size-8 place-items-center text-xs font-bold tracking-widest text-muted-foreground select-none"
                  >
                    …
                  </span>
                );
              }

              const isActive = currentPage === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className={`size-8 rounded-xl text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                      : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            className="gap-1 rounded-xl text-xs font-medium"
            aria-label="Go to next page"
          >
            <span>Next</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </nav>
  );
}
