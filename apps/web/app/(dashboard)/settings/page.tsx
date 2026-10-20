export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Coming in a later phase
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Workspace settings are not available yet.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Analyzer limits and fixture access are configured by the local
          service. This page does not expose controls that are not implemented.
        </p>
      </div>
    </main>
  );
}
