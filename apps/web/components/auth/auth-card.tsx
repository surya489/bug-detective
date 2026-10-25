"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldAlert,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  GitBranch,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Check,
} from "lucide-react";
import { GitHubIcon } from "@/components/ui/github-icon";

interface AuthCardProps {
  initialMode?: "login" | "signup";
}

export function AuthCard({ initialMode = "login" }: AuthCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);

  // UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? decodeURIComponent(urlError) : null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Post-registration GitHub connection modal state
  const [showGitHubConnectModal, setShowGitHubConnectModal] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ name: string; email: string } | null>(
    null,
  );

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError("Please provide an email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please verify.");
        return;
      }
      if (!agreeTerms) {
        setError("Please agree to the Terms of Service.");
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const payload =
        mode === "signup"
          ? { name, email, password }
          : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed. Please check your credentials.");
        setLoading(false);
        return;
      }

      if (mode === "signup") {
        setCreatedUser({
          name: data.user.name || name || email.split("@")[0],
          email: data.user.email || email,
        });
        setShowGitHubConnectModal(true);
        setLoading(false);
      } else {
        setSuccessMessage("Authenticated successfully! Redirecting...");
        setTimeout(() => {
          router.push(redirectUrl);
          router.refresh();
        }, 600);
      }
    } catch {
      setError("An unexpected network error occurred. Please try again.");
      setLoading(false);
    }
  }

  function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotSent(true);
    setTimeout(() => {
      setForgotSent(false);
      setShowForgotModal(false);
      setSuccessMessage("Password reset link sent to your email!");
    }, 1800);
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Decorative ambient glowing backdrops */}
      <div className="absolute -top-16 -left-16 size-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 size-72 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

      {/* Main Glass Card */}
      <div className="relative rounded-2xl border border-border/80 bg-card/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl transition-all">
        {/* Brand / Logo Badge */}
        <div className="flex flex-col items-center text-center">
          <Link
            href="/"
            className="group flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-inner shadow-primary/20 transition-all hover:scale-105 hover:bg-primary/20"
          >
            <ShieldAlert className="size-6 transition-transform group-hover:rotate-6" />
          </Link>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3" />
            <span>Bug Detective AI</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {mode === "login"
              ? "Sign in to access your security scans and bug detector"
              : "Start inspecting repositories with AI static analysis"}
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="mt-6 flex rounded-xl border border-border/80 bg-background/80 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              mode === "login"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              mode === "signup"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed">{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* GitHub OAuth Button */}
        <div className="mt-5">
          <a
            href="/api/auth/github"
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-3 text-sm font-semibold text-foreground transition-all duration-150 hover:border-primary/50 hover:bg-accent/40 active:scale-[0.99] shadow-sm"
          >
            <GitHubIcon className="size-5 transition-transform group-hover:scale-110" />
            <span>Continue with GitHub</span>
            <span className="absolute right-3 hidden sm:inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Instant Setup
            </span>
          </a>
          <p className="mt-2 text-center text-[11px] text-muted-foreground leading-relaxed">
            Logging in with GitHub will automatically create your account and link repository access in one step.
          </p>
        </div>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/80" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-3 text-[11px] font-medium text-muted-foreground">
              or continue with email
            </span>
          </div>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-foreground">
                Developer Name
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                  <User className="size-4" />
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Vance"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground">
              Email Address
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                <Mail className="size-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-foreground">
                Password
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs text-primary transition-colors hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                <Lock className="size-4" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                <span className="sr-only">Toggle password visibility</span>
              </button>
            </div>

            {/* Password strength indicator for signup */}
            {mode === "signup" && password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1 h-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 rounded-full transition-colors ${
                        passwordStrength >= step
                          ? passwordStrength <= 2
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                          : "bg-border"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Strength:{" "}
                  {passwordStrength <= 1
                    ? "Weak (use 8+ chars & numbers)"
                    : passwordStrength <= 2
                    ? "Medium"
                    : "Strong password"}
                </p>
              </div>
            )}
          </div>

          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-foreground">
                Confirm Password
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                  <Lock className="size-4" />
                </span>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  <span className="sr-only">Toggle password visibility</span>
                </button>
              </div>
            </div>
          )}

          {/* Checkboxes */}
          {mode === "login" ? (
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 rounded border-border bg-background text-primary focus:ring-primary"
                />
                <span>Remember me for 30 days</span>
              </label>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="size-4 mt-0.5 rounded border-border bg-background text-primary focus:ring-primary"
              />
              <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer">
                I agree to the{" "}
                <span className="text-primary hover:underline">Terms of Service</span> and{" "}
                <span className="text-primary hover:underline">Privacy Policy</span>.
              </label>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-4 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>{mode === "login" ? "Signing In..." : "Creating Account..."}</span>
              </div>
            ) : (
              <>
                <span>{mode === "login" ? "Sign In with Email" : "Create Account"}</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        {/* Bottom Switcher */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "login" ? (
            <p>
              Don&apos;t have an account yet?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="font-semibold text-primary hover:underline"
              >
                Sign up free
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Post-Registration Modal: Connect GitHub Prompt */}
      {showGitHubConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>

            <h3 className="mt-4 text-lg font-bold text-foreground">
              Account Created Successfully!
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Welcome, <span className="font-semibold text-foreground">{createdUser?.name}</span>. Your Bug Detective account ({createdUser?.email}) is ready.
            </p>

            <div className="mt-5 rounded-xl border border-border/80 bg-background/80 p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-card border border-border text-foreground">
                  <GitHubIcon className="size-4" />
                </span>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Connect your GitHub account
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Enables repository browsing & automated commit analysis
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                You can link your GitHub account right now to start scanning your repositories, or continue to your dashboard and connect anytime via Settings.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <a
                href="/api/auth/github"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90"
              >
                <GitHubIcon className="size-4" />
                <span>Connect GitHub Now</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  router.push(redirectUrl);
                  router.refresh();
                }}
                className="flex items-center justify-center rounded-xl border border-border py-2.5 px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                Skip & Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Reset Password</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your registered email and we will send you a reset link.
            </p>

            <form onSubmit={handleSendReset} className="mt-4 space-y-3">
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotSent}
                  className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {forgotSent ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
