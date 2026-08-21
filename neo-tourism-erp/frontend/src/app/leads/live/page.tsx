"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { LeadListResponse } from "@/types/lead";

function ageLabel(createdAt: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function LiveLeadsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<LeadListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<LeadListResponse>("/leads/live?limit=50");
      setResult(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load live leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission("lead.view")) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(load);
    const interval = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(interval);
  }, [hasPermission, load]);

  async function claim(id: string) {
    if (!window.confirm("Take this lead?")) return;
    setClaimingId(id);
    setMessage("");
    try {
      await apiFetch(`/leads/${id}/claim`, { method: "POST" });
      setResult((current) =>
        current
          ? {
              ...current,
              data: current.data.filter((lead) => lead.id !== id),
              pagination: {
                ...current.pagination,
                total: Math.max(0, current.pagination.total - 1),
              },
            }
          : current,
      );
      setMessage("Lead assigned to you successfully.");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setMessage("This lead has already been taken by another agent.");
        await load();
      } else {
        setError(caught instanceof ApiError ? caught.message : "Unable to take lead.");
      }
    } finally {
      setClaimingId(null);
    }
  }

  if (!hasPermission("lead.view")) {
    return <div className="mx-auto max-w-5xl px-5 py-12 text-amber-800">You do not have permission to view leads.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Live New Leads</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Fresh enquiries waiting for an agent</h1>
          <p className="mt-2 text-sm text-slate-600">Oldest enquiries appear first. This list refreshes every 30 seconds.</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Refresh</button>
      </header>

      {message && <div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">{message}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading live leads…</div>}
        {!loading && error && <div className="p-12 text-center text-sm text-red-700">{error}</div>}
        {!loading && !error && result?.data.length === 0 && <div className="p-12 text-center"><p className="font-medium text-slate-900">No unclaimed leads</p><p className="mt-1 text-sm text-slate-500">New enquiries will appear here automatically.</p></div>}
        {!loading && !error && result && result.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Customer", "Destination", "Source", "Contact", "Created", "Action"].map((item) => <th key={item} className="px-5 py-3 font-semibold">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">{lead.customer.firstName} {lead.customer.lastName}</td>
                    <td className="px-5 py-4 text-slate-700">{lead.destination ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{lead.source ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600"><p>{lead.customer.phone ?? "—"}</p><p className="text-xs">{lead.customer.email ?? "—"}</p></td>
                    <td className="whitespace-nowrap px-5 py-4"><p className="font-semibold text-emerald-700">{ageLabel(lead.createdAt)}</p><p className="text-xs text-slate-500">{new Date(lead.createdAt).toLocaleString("en-GB")}</p></td>
                    <td className="px-5 py-4"><button type="button" disabled={claimingId !== null || !hasPermission("lead.assign")} onClick={() => void claim(lead.id)} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40">{claimingId === lead.id ? "Taking…" : "Take Lead"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {message.includes("successfully") && <button type="button" onClick={() => router.push("/leads/pipeline")} className="mt-4 text-sm font-semibold text-cyan-700">Open My Pipeline →</button>}
    </div>
  );
}
