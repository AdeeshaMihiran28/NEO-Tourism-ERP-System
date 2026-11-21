"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import { LEGACY_LEAD_STATUSES, leadStatusLabel, type LeadListResponse, type LeadStatus } from "@/types/lead";

const PIPELINE_STATUSES: LeadStatus[] = ["FOLLOW_UP", "GOING_TO_BOOK", "TRAVEL_IN_FUTURE"];
const LEGACY_PIPELINE_STATUSES = LEGACY_LEAD_STATUSES.filter((status) => status !== "NO_RESPONSE");

function relative(value: string | null) {
  if (!value) return "No activity yet";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function PipelinePage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<LeadListResponse | null>(null);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "100" });
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    if (source) params.set("source", source);
    try {
      setResult(await apiFetch<LeadListResponse>(`/leads/my?${params}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load pipeline.");
    } finally {
      setLoading(false);
    }
  }, [page, search, source, status]);

  useEffect(() => {
    if (!hasPermission("lead.view")) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(load);
  }, [hasPermission, load]);

  function searchPipeline(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSearch(draftSearch.trim());
    setSource(draftSource.trim());
  }

  const displayedStatuses = [...PIPELINE_STATUSES, ...LEGACY_PIPELINE_STATUSES.filter((item) => result?.data.some((lead) => lead.status === item))];
  const grouped = displayedStatuses.map((columnStatus) => ({
    status: columnStatus,
    leads: result?.data.filter((lead) => lead.status === columnStatus) ?? [],
  }));

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">My Pipeline</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Your active sales leads</h1><p className="mt-2 text-sm text-slate-600">{result ? `${result.pagination.total} assigned active leads.` : "Only leads assigned to you are shown."}</p></div>{hasPermission("lead.assign") && <Link href="/leads/live" className="rounded-xl border border-cyan-300 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800">Open Pending Leads</Link>}</div>
      <form onSubmit={searchPipeline} className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
        <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search customer or destination…" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <input value={draftSource} onChange={(event) => setDraftSource(event.target.value)} placeholder="Marketing Medium" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <select value={status} onChange={(event) => { setLoading(true); setPage(1); setStatus(event.target.value as LeadStatus | ""); }} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"><option value="">All active statuses</option><optgroup label="Current business statuses">{PIPELINE_STATUSES.map((item) => <option key={item} value={item}>{leadStatusLabel(item)}</option>)}</optgroup><optgroup label="Historical legacy statuses">{LEGACY_PIPELINE_STATUSES.map((item) => <option key={item} value={item}>{leadStatusLabel(item)}</option>)}</optgroup></select>
        <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Filter</button>
      </form>

      {loading && <div className="py-16 text-center text-sm text-slate-500">Loading your pipeline…</div>}
      {!loading && error && <div className="py-16 text-center text-sm text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="mt-6 grid gap-4 xl:grid-cols-5">
          {grouped.filter((group) => !status || group.status === status).map((group) => (
            <section key={group.status} className="min-w-0 rounded-2xl bg-slate-100 p-3">
              <div className="flex items-center justify-between px-1 py-2"><h2 className="text-sm font-bold text-slate-800">{leadStatusLabel(group.status)}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{group.leads.length}</span></div>
              <div className="mt-2 space-y-3">
                {group.leads.map((lead) => (
                  <article key={lead.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3"><p className="font-semibold text-slate-950">{hasPermission("customer.view") ? <Link href={`/customers/${lead.customer.id}`} className="hover:text-cyan-700">{lead.customer.firstName} {lead.customer.lastName}</Link> : <>{lead.customer.firstName} {lead.customer.lastName}</>}</p><span className="font-mono text-[10px] text-slate-400" title={lead.id}>{lead.id.slice(0, 8).toUpperCase()}</span></div>
                    <p className="mt-1 text-xs text-slate-500">{lead.customer.phone ?? "—"} · {lead.customer.email ?? "—"}</p>
                    <p className="mt-2 text-sm text-slate-700">{lead.destination ?? "Destination not set"}</p>
                    <dl className="mt-3 space-y-1 text-xs text-slate-500"><div className="flex justify-between gap-2"><dt>Marketing Medium</dt><dd className="text-right">{lead.source ?? "—"}</dd></div><div className="flex justify-between gap-2"><dt>Travel</dt><dd className="text-right">{lead.travelDate ? new Date(lead.travelDate).toLocaleDateString("en-GB") : "—"}{lead.travelEndDate ? ` – ${new Date(lead.travelEndDate).toLocaleDateString("en-GB")}` : ""}</dd></div><div className="flex justify-between gap-2"><dt>Advisor</dt><dd className="text-right">{lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : "Unassigned"}</dd></div><div className="flex justify-between gap-2"><dt>Last activity</dt><dd>{relative(lead.lastMeaningfulActivityAt)}</dd></div><div className="flex justify-between gap-2"><dt>Next follow-up</dt><dd className="text-right">{lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString("en-GB") : "—"}</dd></div></dl>
                    <Link href={`/leads/${lead.id}`} className="mt-3 inline-block text-xs font-semibold text-cyan-700 hover:text-cyan-900">Open Lead →</Link>
                  </article>
                ))}
                {group.leads.length === 0 && <p className="px-2 py-8 text-center text-xs text-slate-500">No leads</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      {!loading && !error && result && result.pagination.totalPages > 1 && <div className="mt-5 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {result.pagination.page} of {result.pagination.totalPages} · {result.pagination.total} assigned leads</span><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
    </div>
  );
}
