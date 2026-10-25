import { cn } from "cn";
import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "card" | "text" | "circle" | "button";
}

/**
 * Atomic skeleton placeholder element with animation and styling variants.
 */
export function Skeleton({
  className,
  variant = "default",
  ...props
}: SkeletonProps) {
  const variantStyles = {
    default: "rounded-lg bg-card/60",
    card: "rounded-2xl border border-border/60 bg-card/60",
    text: "rounded-md bg-muted/40",
    circle: "rounded-full bg-muted/40",
    button: "rounded-xl border border-border bg-card",
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

/**
 * Reusable page header skeleton (title + subtitle + optional status badge).
 */
export function PageHeaderSkeleton({
  titleWidth = "w-48",
  subtitleWidth = "w-72",
  hasBadge = false,
  className,
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  hasBadge?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className={cn("h-8", titleWidth)} />
        {hasBadge && <Skeleton variant="circle" className="h-6 w-20" />}
      </div>
      {subtitleWidth && <Skeleton variant="text" className={cn("h-4", subtitleWidth)} />}
    </div>
  );
}

/**
 * Reusable metric cards skeleton grid (e.g. Total, Critical, AI detected, etc.).
 */
export function MetricCardsSkeleton({
  count = 4,
  columns = 4,
  className,
}: {
  count?: number;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const colClass =
    columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className={cn("grid gap-3 sm:gap-4", colClass, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <Skeleton variant="text" className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Reusable card grid skeleton (e.g. repositories, scan cards).
 */
export function CardGridSkeleton({
  count = 6,
  columns = 3,
  cardHeight = "h-44",
  className,
}: {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  cardHeight?: string;
  className?: string;
}) {
  const colClass =
    columns === 3
      ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
      : columns === 4
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        : columns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1";

  return (
    <div className={cn("grid gap-4", colClass, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border border-border/60 bg-card/60 p-5",
            cardHeight
          )}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton variant="text" className="h-4 w-3/4" />
              <Skeleton variant="text" className="h-3 w-1/2" />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <Skeleton variant="text" className="h-3 w-full" />
            <Skeleton variant="text" className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Reusable list skeleton for vertical lists (e.g. findings, scans history, commits).
 */
export function ListSkeleton({
  count = 4,
  itemHeight = "h-24",
  className,
}: {
  count?: number;
  itemHeight?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3.5", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border border-border/60 bg-card/60 p-5",
            itemHeight
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3">
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" className="h-4 w-48" />
                <Skeleton variant="text" className="h-3 w-32" />
              </div>
            </div>
            <Skeleton variant="circle" className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface PageSkeletonProps {
  variant?: "cards" | "metrics" | "detail" | "list";
  count?: number;
  className?: string;
}

/**
 * Full page loading skeleton for route Suspense fallbacks and page loading states.
 */
export function PageSkeleton({
  variant = "cards",
  count = 6,
  className,
}: PageSkeletonProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8",
        className
      )}
    >
      <PageHeaderSkeleton hasBadge={variant === "detail"} />

      {variant === "detail" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="h-5 w-64" />
                <Skeleton variant="text" className="h-3 w-48" />
              </div>
            </div>
          </div>
          <MetricCardsSkeleton count={4} columns={4} />
          <ListSkeleton count={3} itemHeight="h-28" />
        </div>
      )}

      {variant === "metrics" && (
        <div className="space-y-6">
          <MetricCardsSkeleton count={4} columns={4} />
          <ListSkeleton count={count} itemHeight="h-28" />
        </div>
      )}

      {variant === "cards" && (
        <CardGridSkeleton count={count} columns={3} cardHeight="h-44" />
      )}

      {variant === "list" && (
        <ListSkeleton count={count} itemHeight="h-24" />
      )}
    </main>
  );
}

export default Skeleton;
