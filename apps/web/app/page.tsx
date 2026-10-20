import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-6 py-20">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600">
        Bug Detective
      </p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Find bugs before they ship.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
        Connect a repository, scan a commit, and investigate actionable
        findings in one place.
      </p>
      <Link
        className="mt-8 inline-flex w-fit rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        href="/repositories"
      >
        Browse repositories
      </Link>
    </main>
  );
}
