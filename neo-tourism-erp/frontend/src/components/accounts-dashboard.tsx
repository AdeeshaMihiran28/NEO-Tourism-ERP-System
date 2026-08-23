"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export function AccountsDashboard() {
  const [summary, setSummary] = useState({ reconciliationPending: 0, inReview: 0, discrepancies: 0, reconciledToday: 0 });
  useEffect(() => { void apiFetch<typeof summary>("/accounts/summary").then(setSummary).catch(() => undefined); }, []);
  const cards = [
    ["Reconciliation Pending", summary.reconciliationPending, "/accounts/reconciliation"],
    ["In Review", summary.inReview, "/accounts/reconciliation?status=RECONCILIATION_PENDING"],
    ["Discrepancies", summary.discrepancies, "/accounts/discrepancies"],
    ["Reconciled Today", summary.reconciledToday, "/accounts/reconciled"],
  ] as const;
  return <section className="mt-8"><h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Accounts overview</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, count, href]) => <Link key={label} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-violet-300"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold">{count}</p></Link>)}</div></section>;
}
