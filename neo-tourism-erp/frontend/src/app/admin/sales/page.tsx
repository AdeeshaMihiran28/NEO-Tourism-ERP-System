"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { SaleSubmissionListResponse } from "@/types/sale";

export default function AdminSalesQueuePage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<SaleSubmissionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setResult(await apiFetch<SaleSubmissionListResponse>("/admin/sales-queue?limit=100"));
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load Admin sales queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission("admin.sale_queue.view")) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(load);
  }, [hasPermission, load]);

  if (!hasPermission("admin.sale_queue.view")) return <div className="p-12 text-amber-800">You do not have permission to view New Sales.</div>;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Admin / Operations</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">New Sales / Payment Cards</h1><p className="mt-2 text-sm text-slate-600">Submitted sales awaiting Admin acceptance, oldest first.</p></header>
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading new sales…</div>}
        {!loading && result?.data.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No submitted sales are waiting for Admin.</div>}
        {!loading && result && result.data.length > 0 && <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm"><thead className="bg-emerald-50 text-xs uppercase tracking-wider text-slate-600"><tr>{["Customer", "Advisor", "Destination", "Travel Dates", "Selling Price", "Submitted", "Action"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.data.map((item) => <tr key={item.id}><td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-950">{item.customer.firstName} {item.customer.lastName}</td><td className="whitespace-nowrap px-4 py-4 text-slate-700">{item.submittedBy.firstName} {item.submittedBy.lastName}</td><td className="px-4 py-4 text-slate-700">{item.destination}</td><td className="whitespace-nowrap px-4 py-4 text-slate-600">{item.travelStartDate ? new Date(item.travelStartDate).toLocaleDateString("en-GB") : "—"}{item.travelEndDate ? ` – ${new Date(item.travelEndDate).toLocaleDateString("en-GB")}` : ""}</td><td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">{item.currency} {item.sellingPrice}</td><td className="whitespace-nowrap px-4 py-4 text-slate-600">{item.submittedAt ? new Date(item.submittedAt).toLocaleString("en-GB") : "—"}</td><td className="px-4 py-4"><Link href={`/admin/sales/${item.id}`} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Review</Link></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
