import DashboardOverview from "@/components/dashboard/dashboard-overview";
import DashboardShell from "@/components/dashboard/dashboard-shell";

export default function Home() {
  return (
    <DashboardShell>
      <DashboardOverview />
    </DashboardShell>
  );
}
