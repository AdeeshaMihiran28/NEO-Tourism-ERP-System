"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import { leadStatusLabel, type LeadListResponse } from "@/types/lead";

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
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [draftDestination, setDraftDestination] = useState("");
  const [filters, setFilters] = useState({ search: "", source: "", destination: "" });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (filters.search) params.set("search", filters.search);
    if (filters.source) params.set("source", filters.source);
    if (filters.destination) params.set("destination", filters.destination);
    try {
      const data = await apiFetch<LeadListResponse>(`/leads/live?${params}`);
      setResult(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load live leads.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

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
    setError("");
    try {
      await apiFetch(`/leads/${id}/claim`, { method: "POST" });
      setResult((current) =>
        current ? (() => {
              const total = Math.max(0, current.pagination.total - 1);
              return {
              ...current,
              data: current.data.filter((lead) => lead.id !== id),
              pagination: {
                ...current.pagination,
                total,
                totalPages: Math.ceil(total / current.pagination.limit),
              },
            }; })()
          : current,
      );
      if (result?.data.length === 1 && page > 1) setPage((value) => value - 1);
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

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setLoading(true);
    setFilters({
      search: draftSearch.trim(),
      source: draftSource.trim(),
      destination: draftDestination.trim(),
    });
  }

  if (!hasPermission("lead.view")) {
    return <div className="mx-auto max-w-5xl px-5 py-12 text-amber-800">You do not have permission to view leads.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Pending Leads</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Unassigned enquiries waiting for an agent</h1>
          <p className="mt-2 text-sm text-slate-600">Oldest received enquiries appear first. This list refreshes every 30 seconds.{result ? ` ${result.pagination.total} currently pending.` : ""}</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Refresh</button>
      </header>

      {message && <div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">{message}</div>}
      <form onSubmit={applyFilters} className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
        <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search lead, customer or contact" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <input value={draftDestination} onChange={(event) => setDraftDestination(event.target.value)} placeholder="Destination" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <input value={draftSource} onChange={(event) => setDraftSource(event.target.value)} placeholder="Marketing Medium" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Filter</button>
      </form>
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading live leads…</div>}
        {!loading && error && <div className="p-12 text-center text-sm text-red-700">{error}</div>}
        {!loading && !error && result?.data.length === 0 && <div className="p-12 text-center"><p className="font-medium text-slate-900">No unclaimed leads</p><p className="mt-1 text-sm text-slate-500">New enquiries will appear here automatically.</p></div>}
        {!loading && !error && result && result.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Lead", "Received", "Customer / Contact", "Destination / Travel", "Marketing Medium", "Status", "Action"].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-4 font-mono text-xs" title={lead.id}>{lead.id.slice(0, 8).toUpperCase()}</td>
                    <td className="whitespace-nowrap px-4 py-4"><p className="font-semibold text-emerald-700">{ageLabel(lead.receivedAt ?? lead.createdAt)}</p><p className="text-xs text-slate-500">{new Date(lead.receivedAt ?? lead.createdAt).toLocaleString("en-GB")}</p></td>
                    <td className="px-4 py-4"><p className="font-semibold text-slate-950">{hasPermission("customer.view") ? <Link href={`/customers/${lead.customer.id}`} className="hover:text-cyan-700">{lead.customer.firstName} {lead.customer.lastName}</Link> : <>{lead.customer.firstName} {lead.customer.lastName}</>}</p><p className="text-xs text-slate-500">{lead.customer.phone ?? "—"} · {lead.customer.email ?? "—"}</p></td>
                    <td className="px-4 py-4"><p>{lead.destination ?? "—"}</p><p className="text-xs text-slate-500">{lead.travelDate ? new Date(lead.travelDate).toLocaleDateString("en-GB") : "—"}{lead.travelEndDate ? ` – ${new Date(lead.travelEndDate).toLocaleDateString("en-GB")}` : ""}</p></td>
                    <td className="px-4 py-4 text-slate-600">{lead.source ?? "—"}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{leadStatusLabel(lead.status)}</span></td>
                    <td className="whitespace-nowrap px-4 py-4"><Link href={`/leads/${lead.id}`} className="mr-3 text-xs font-semibold text-cyan-700">Open</Link><button type="button" disabled={claimingId !== null || !hasPermission("lead.assign")} onClick={() => void claim(lead.id)} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40">{claimingId === lead.id ? "Taking…" : "Take Lead"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {result && result.pagination.totalPages > 1 && <div className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {result.pagination.page} of {result.pagination.totalPages} · {result.pagination.total} pending</span><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
      {message.includes("successfully") && <button type="button" onClick={() => router.push("/leads/pipeline")} className="mt-4 text-sm font-semibold text-cyan-700">Open My Pipeline →</button>}
    </div>
  );
}
