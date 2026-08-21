"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { SalesDashboard } from "@/components/sales-dashboard";

export default function Home() {
  const { user, hasPermission } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
      <p className="text-sm font-medium text-cyan-700">System workspace</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        Welcome back, {user?.firstName}
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Neo Tourism ERP 2.0 is connected and ready for internal development.
      </p>

      {hasPermission("lead.view") && <SalesDashboard />}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {hasPermission("customer.view") && (
          <Link
            href="/customers"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-cyan-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
              CRM
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Customer 360
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Search, create, and maintain permanent customer records and notes.
            </p>
          </Link>
        )}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Environment
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Frontend Status: Running
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as {user?.email}
          </p>
        </section>
      </div>
    </div>
  );
}
