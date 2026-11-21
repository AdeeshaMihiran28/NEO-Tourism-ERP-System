"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const activated = useSearchParams().get("activated") === "true";
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#020617] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      <section className="relative grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] md:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-cyan-800 via-cyan-900 to-slate-950 p-10 text-white md:flex md:flex-col md:justify-between">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full border border-white/10" />

          <div className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-lg font-black text-cyan-800 shadow-lg">
              N
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">
                Neo Tourism
              </p>
              <p className="text-sm text-white/70">ERP 2.0</p>
            </div>
          </div>

          <div className="relative my-16">
            <p className="text-sm font-semibold text-cyan-200">
              Built for better operations
            </p>
            <h2 className="mt-3 max-w-xs text-4xl font-semibold leading-tight">
              One workspace. Every operation.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
              Manage teams, customers, bookings, and finance from one secure
              platform.
            </p>
          </div>

          <p className="relative flex items-center gap-2 text-xs text-white/60">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Secure internal access
          </p>
        </aside>

        <div className="p-7 sm:p-10 md:p-12">
          <div className="flex items-center gap-3 md:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-800 font-black text-white">
              N
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-700">
                Neo Tourism
              </p>
              <p className="text-xs text-slate-500">ERP 2.0</p>
            </div>
          </div>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 md:mt-0">
            Secure workspace
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Welcome back
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Enter your credentials to access the Neo Tourism ERP.
          </p>
          {activated && (
            <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Your password has been created successfully. You can now log
              in.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-slate-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                disabled={submitting}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-slate-700"
              >
                Password
              </label>
              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={submitting}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-16 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100 disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-cyan-700 transition hover:text-cyan-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div aria-live="polite">
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-3.5 font-semibold text-white shadow-lg shadow-cyan-900/15 transition hover:-translate-y-0.5 hover:bg-cyan-800 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {submitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {submitting ? "Signing in…" : "Sign in to ERP"}
            </button>
          </form>

          <p className="mt-8 border-t border-slate-200 pt-5 text-center text-xs leading-5 text-slate-500">
            Authorized personnel only. Account activity is monitored and
            audited.
          </p>
        </div>
      </section>
    </main>
  );
}
