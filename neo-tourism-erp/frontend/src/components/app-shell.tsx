"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, hasPermission } = useAuth();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace("/login");
    }
    if (!loading && user && isLoginPage) {
      router.replace("/");
    }
  }, [isLoginPage, loading, router, user]);

  if (isLoginPage) {
    return children;
  }

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">
        Loading workspace…
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="border-b border-slate-800 bg-slate-950 text-white lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Neo Tourism
            </p>
            <p className="mt-1 text-lg font-semibold">ERP 2.0</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 lg:hidden"
          >
            Sign out
          </button>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-6 lg:overflow-visible lg:px-4">
          <Link
            href="/"
            className={`block rounded-lg px-3 py-2 text-sm ${pathname === "/" ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"}`}
          >
            Overview
          </Link>
          {(hasPermission("lead.view") || hasPermission("customer.view")) && (
            <div className="lg:space-y-1">
              <p className="hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:block">
                Sales CRM
              </p>
              {hasPermission("lead.view") && (
                <>
                  <Link
                    href="/leads/live"
                    className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${pathname === "/leads/live" ? "bg-cyan-500/15 text-cyan-300" : "text-slate-300 hover:bg-slate-900"}`}
                  >
                    Live New Leads
                  </Link>
                  <Link
                    href="/leads/pipeline"
                    className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${pathname === "/leads/pipeline" || /^\/leads\/[^/]+$/.test(pathname) ? "bg-cyan-500/15 text-cyan-300" : "text-slate-300 hover:bg-slate-900"}`}
                  >
                    My Pipeline
                  </Link>
                </>
              )}
              {hasPermission("customer.view") && (
                <Link
                  href="/customers"
                  className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${pathname.startsWith("/customers") ? "bg-cyan-500/15 text-cyan-300" : "text-slate-300 hover:bg-slate-900"}`}
                >
                  Customers
                </Link>
              )}
            </div>
          )}
        </nav>

        <div className="hidden px-6 py-5 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-3 text-xs font-medium text-slate-300 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 lg:ml-64">{children}</main>
    </div>
  );
}
