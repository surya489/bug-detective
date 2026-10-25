import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ArrowLeft, Radar } from "lucide-react";

export const metadata: Metadata = {
  title: "Create Account - Bug Detective",
  description: "Create your Bug Detective account to start scanning repositories for vulnerabilities.",
};

function AuthCardFallback() {
  return (
    <div className="w-full max-w-md mx-auto rounded-2xl border border-border/80 bg-card/90 p-8 shadow-2xl animate-pulse">
      <div className="mx-auto size-12 rounded-2xl bg-muted" />
      <div className="mx-auto mt-4 h-6 w-32 rounded bg-muted" />
      <div className="mx-auto mt-2 h-4 w-48 rounded bg-muted" />
      <div className="mt-8 space-y-4">
        <div className="h-10 rounded-xl bg-muted" />
        <div className="h-10 rounded-xl bg-muted" />
        <div className="h-10 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <main className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8 bg-background overflow-hidden selection:bg-primary/30">
      {/* Background Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />

      {/* Top Navigation Link */}
      <div className="absolute top-6 left-6 z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md transition-all hover:border-primary/50 hover:bg-card hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <div className="relative z-10 w-full">
        <Suspense fallback={<AuthCardFallback />}>
          <AuthCard initialMode="signup" />
        </Suspense>
      </div>

      {/* Footer Info */}
      <footer className="relative z-10 mt-8 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-1.5">
          <Radar className="size-3.5 text-primary" />
          <span>Bug Detective AI &bull; Secure Local Static Analysis</span>
        </p>
      </footer>
    </main>
  );
}
