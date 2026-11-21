"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { LeadListResponse } from "@/types/lead";
import { useAuth } from "./auth-provider";
import { AttendanceControl } from "./attendance-control";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({
  children,
  environment,
}: {
  children: React.ReactNode;
  environment: "uat" | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, hasPermission } = useAuth();
  const isPublicAuthPage =
    pathname === "/login" || pathname === "/setup-password";
  const [attentionCount, setAttentionCount] = useState(0);
  const environmentBanner =
    environment === "uat" ? (
      <div
        role="status"
        className="bg-amber-300 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-amber-950"
      >
        UAT Environment <span aria-hidden="true">—</span>{" "}
        <span className="normal-case tracking-normal">
          Test data only. Do not enter real payment credentials or passwords.
        </span>
      </div>
    ) : null;
  const navClass = (active: boolean) =>
    `flex items-center justify-between gap-3 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all ${active ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-transparent text-slate-300 hover:border-slate-700/70 hover:bg-white/5 hover:text-white"}`;

  const loadAttentionCount = useCallback(async () => {
    if (!hasPermission("lead.attention.view")) return;
    try {
      const response = await apiFetch<LeadListResponse>(
        "/leads/attention?limit=1",
      );
      setAttentionCount(response.pagination.total);
    } catch {
      setAttentionCount(0);
    }
  }, [hasPermission]);

  useEffect(() => {
    if (!loading && !user && !isPublicAuthPage) {
      router.replace("/login");
    }
    if (!loading && user && isPublicAuthPage) {
      router.replace("/");
    }
  }, [isPublicAuthPage, loading, router, user]);

  useEffect(() => {
    if (!user || !hasPermission("lead.attention.view")) return;
    void Promise.resolve().then(loadAttentionCount);
    const interval = window.setInterval(() => void loadAttentionCount(), 60000);
    window.addEventListener("neo-attention-changed", loadAttentionCount);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("neo-attention-changed", loadAttentionCount);
    };
  }, [hasPermission, loadAttentionCount, user]);

  if (isPublicAuthPage) {
    return (
      <>
        {environmentBanner}
        <div className="fixed right-5 top-5 z-50">
          <ThemeToggle />
        </div>
        {children}
      </>
    );
  }

  if (loading || !user) {
    return (
      <>
        {environmentBanner}
        <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">
          Loading workspace…
        </main>
      </>
    );
  }

  return (
    <>
      {environmentBanner}
      <div className="min-h-screen bg-slate-50 lg:flex">
        <aside
          className={`border-b border-slate-800/80 bg-gradient-to-b from-slate-950 via-[#07111f] to-slate-950 text-white shadow-2xl shadow-slate-950/20 lg:fixed lg:bottom-0 lg:flex lg:w-64 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r ${environment === "uat" ? "lg:top-8" : "lg:top-0"}`}
        >
          <div className="flex items-center justify-between border-slate-800/70 px-5 py-4 lg:shrink-0 lg:border-b lg:px-5 lg:py-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-lg font-black text-slate-950 shadow-lg shadow-cyan-950/40">
                N
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Neo Tourism
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  ERP 2.0
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 lg:hidden"
            >
              Sign out
            </button>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:block lg:min-h-0 lg:flex-1 lg:space-y-1 lg:overflow-x-hidden lg:overflow-y-auto lg:px-4 lg:py-5">
            <p className="mb-2 hidden px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
              Workspace
            </p>
            <Link
              href="/dashboard"
              className={navClass(
                pathname === "/" || pathname === "/dashboard",
              )}
            >
              Overview
            </Link>
            {hasPermission("dashboard.management.view") && (
              <Link
                href="/dashboard/management"
                className={navClass(pathname === "/dashboard/management")}
              >
                Management
              </Link>
            )}
            {hasPermission("deposit.approval.view") && (
              <Link
                href="/management/deposits"
                className={navClass(pathname === "/management/deposits")}
              >
                Deposit Approvals
              </Link>
            )}
            {(hasPermission("lead.view") ||
              hasPermission("customer.view") ||
              hasPermission("sale.view_own") ||
              hasPermission("marketing.deal.sales_view") ||
              hasPermission("marketing.sales_signal.create")) && (
              <Link
                href="/sales"
                className={navClass(
                  pathname.startsWith("/sales") ||
                    pathname.startsWith("/leads") ||
                    pathname.startsWith("/customers"),
                )}
              >
                <span>Sales CRM</span>
                {attentionCount > 0 && hasPermission("lead.attention.view") && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                    {attentionCount}
                  </span>
                )}
              </Link>
            )}
            {(hasPermission("marketing.pulse.view") ||
              hasPermission("marketing.neotrio.view") ||
              hasPermission("marketing.signal.view") ||
              hasPermission("marketing.radar.view") ||
              hasPermission("marketing.deal.view") ||
              hasPermission("marketing.content.view") ||
              hasPermission("marketing.approval.view") ||
              hasPermission("marketing.calendar.view")) && (
              <Link
                href="/marketing"
                className={navClass(pathname.startsWith("/marketing"))}
              >
                Marketing
              </Link>
            )}
            {(hasPermission("admin.sale_queue.view") ||
              hasPermission("booking.view")) && (
              <Link
                href="/operations"
                className={navClass(
                  pathname.startsWith("/operations") ||
                    pathname.startsWith("/admin/sales") ||
                    pathname.startsWith("/bookings"),
                )}
              >
                Admin / Operations
              </Link>
            )}
            {hasPermission("finance.view") && (
              <Link
                href="/accounts"
                className={navClass(pathname.startsWith("/accounts"))}
              >
                Finance
              </Link>
            )}
            {(hasPermission("hr.employee.view") ||
              hasPermission("hr.leave.view_own") ||
              hasPermission("hr.directory.view") ||
              hasPermission("hr.org_chart.view") ||
              hasPermission("hr.team.view") ||
              hasPermission("hr.attendance.view") ||
              hasPermission("hr.leave.manage") ||
              hasPermission("hr.leave.calendar.view") ||
              hasPermission("hr.shift.view") ||
              hasPermission("hr.onboarding.view") ||
              hasPermission("hr.offboarding.view") ||
              hasPermission("hr.document.view_own") ||
              hasPermission("hr.document.view_all") ||
              hasPermission("hr.report.view") ||
              hasPermission("dashboard.hr.view")) && (
              <Link href="/hr" className={navClass(pathname.startsWith("/hr"))}>
                Human Resources
              </Link>
            )}
            {(hasPermission("it.asset.view") ||
              hasPermission("it.ticket.view_own") ||
              hasPermission("it.ticket.view_all") ||
              hasPermission("it.access_request.create") ||
              hasPermission("it.access_request.view") ||
              hasPermission("user.view") ||
              hasPermission("role.view")) && (
              <Link href="/it" className={navClass(pathname.startsWith("/it"))}>
                IT & Access Management
              </Link>
            )}
            {hasPermission("audit.view") && (
              <Link
                href="/audit"
                className={navClass(pathname.startsWith("/audit"))}
              >
                Audit Log
              </Link>
            )}
            {hasPermission("integration.view") && (
              <Link
                href="/settings/integrations"
                className={navClass(pathname === "/settings/integrations")}
              >
                Integrations
              </Link>
            )}
          </nav>

          <div className="hidden border-t border-slate-800/70 bg-black/10 p-4 lg:block lg:shrink-0">
            <Link
              href="/hr/me"
              aria-label="Open my HR profile"
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-white/[0.03] p-3 transition hover:border-cyan-800 hover:bg-cyan-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-cyan-300 ring-1 ring-slate-700">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {user.firstName} {user.lastName}
                </p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-3 w-full rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 lg:ml-64">
          <div className="sticky top-0 z-20 flex h-16 items-center justify-end gap-2 border-b border-slate-200 bg-slate-50/95 px-5 backdrop-blur sm:px-8">
            <ThemeToggle />
            <AttendanceControl />
            <NotificationBell />
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
