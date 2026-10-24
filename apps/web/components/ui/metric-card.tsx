import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type MetricVariant =
  | "default"
  | "critical"
  | "warning"
  | "success"
  | "purple"
  | "sky";

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: MetricVariant;
  className?: string;
}

const VARIANT_VALUE_COLORS: Record<MetricVariant, string> = {
  default: "text-foreground",
  critical: "text-rose-400",
  warning: "text-amber-300",
  success: "text-emerald-400",
  purple: "text-purple-400",
  sky: "text-sky-400",
};

const VARIANT_ICON_COLORS: Record<MetricVariant, string> = {
  default: "bg-muted text-muted-foreground",
  critical: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  warning: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  purple: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  sky: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
};

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  className = "",
}: MetricCardProps) {
  const valueColor = VARIANT_VALUE_COLORS[variant];
  const iconStyle = VARIANT_ICON_COLORS[variant];

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/30 sm:p-5 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">
          {title}
        </p>
        {Icon && (
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}
          >
            <Icon className="size-3.5" />
          </div>
        )}
      </div>

      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>

      {subtitle && (
        <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
