import DashboardShell from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({
  children,
}: LayoutProps<"/">) {
  return <DashboardShell>{children}</DashboardShell>;
}
