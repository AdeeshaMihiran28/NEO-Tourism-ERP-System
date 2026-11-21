"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api/client";

export default function SetupPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
          Loading invitation…
        </main>
      }
    >
      <SetupPasswordForm />
    </Suspense>
  );
}

function SetupPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void apiFetch<{ valid: boolean; email: string }>(
      `/auth/invitation-status?token=${encodeURIComponent(token)}`,
    )
      .then((result) => {
        if (!cancelled) setLoginEmail(result.email);
      })
      .catch(() => {
        if (!cancelled) setLinkInvalid(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/activate-account", {
        method: "POST",
        token: null,
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to activate this account.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-8">
      <section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
          Neo Tourism ERP 2.0
        </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Create your password
          </h1>
          {loginEmail && (
            <p className="mt-2 text-sm text-slate-600">
              Login: <strong>{loginEmail}</strong>
            </p>
          )}
          {linkInvalid && (
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              This invitation link is invalid or has expired. Contact HR/IT
              to request a new invitation.
            </p>
          )}
        {complete ? (
          <div className="mt-6">
            <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
              Password created successfully. Your Neo Tourism ERP account is
              now active.
            </p>
            <Link
              href="/login?activated=true"
              className="mt-5 block rounded-xl bg-cyan-700 px-4 py-3 text-center font-semibold text-white"
            >
              Go to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-5">
            {!token && (
              <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                This invitation link is incomplete.
              </p>
            )}
            <label className="block text-sm font-semibold text-slate-700">
              New password
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Confirm password
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>
            {error && (
              <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy || !token}
              className="w-full rounded-xl bg-cyan-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Activating…" : "Activate account"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
