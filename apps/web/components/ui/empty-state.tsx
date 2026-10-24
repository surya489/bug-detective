import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-border py-14 px-4 text-center ${className}`}
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-background/80 text-muted-foreground/70 shadow-sm">
        <Icon className="size-6" />
      </div>

      <h3 className="mt-3.5 text-sm font-semibold text-foreground sm:text-base">
        {title}
      </h3>

      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>

      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
