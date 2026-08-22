"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import { saleStatusLabel, type SaleSubmissionListResponse } from "@/types/sale";

export default function SaleSubmissionsPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<SaleSubmissionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setResult(await apiFetch<SaleSubmissionListResponse>("/sale-submissions/my?limit=100"));
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load Sale Submissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission("sale.view_own")) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(load);
  }, [hasPermission, load]);

  if (!hasPermission("sale.view_own")) return <div className="p-12 text-amber-800">You do not have permission to view Sale Submissions.</div>;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Sales handover</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Sale Submissions</h1><p className="mt-2 text-sm text-slate-600">Your draft and submitted Payment Cards.</p></header>
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading submissions…</div>}
        {!loading && result?.data.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No Sale Submissions yet. Start one from an active lead.</div>}
        {!loading && result && result.data.length > 0 && <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600"><tr>{["Customer", "Destination", "Value", "Status", "Submitted", "Action"].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.data.map((item) => <tr key={item.id}><td className="px-5 py-4 font-semibold text-slate-950">{item.customer.firstName} {item.customer.lastName}</td><td className="px-5 py-4 text-slate-700">{item.destination ?? "—"}</td><td className="px-5 py-4 text-slate-700">{item.sellingPrice ? `${item.currency ?? ""} ${item.sellingPrice}` : "—"}</td><td className="px-5 py-4"><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">{saleStatusLabel(item.status)}</span></td><td className="px-5 py-4 text-slate-600">{item.submittedAt ? new Date(item.submittedAt).toLocaleString("en-GB") : "Not submitted"}</td><td className="px-5 py-4"><Link href={`/sales/submissions/${item.id}`} className="font-semibold text-cyan-700">Open →</Link></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
