import Link from "next/link";

export default function DashboardLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-4"
        >
          <Link className="mr-auto font-semibold tracking-tight" href="/">
            Bug Detective
          </Link>
          <Link className="text-sm text-zinc-600 hover:text-zinc-950" href="/repositories">
            Repositories
          </Link>
          <Link className="text-sm text-zinc-600 hover:text-zinc-950" href="/settings">
            Settings
          </Link>
        </nav>
      </header>
      {children}
    </>
  );
}
