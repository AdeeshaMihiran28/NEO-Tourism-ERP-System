"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import { BUSINESS_LEAD_STATUSES, LEGACY_LEAD_STATUSES, leadStatusLabel, type LeadListResponse, type LeadStatus, type LeadSummary } from "@/types/lead";

interface AssignableUser { id: string; firstName: string; lastName: string; email: string }

export default function LeadsPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<LeadListResponse | null>(null);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [selected, setSelected] = useState<LeadSummary | null>(null);
  const [newAssignedUserId, setNewAssignedUserId] = useState("");
  const [reason, setReason] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (source) params.set("source", source);
    if (status) params.set("status", status);
    try {
      setResult(await apiFetch<LeadListResponse>(`/leads?${params}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load leads.");
    } finally { setLoading(false); }
  }, [page, search, source, status]);

  useEffect(() => {
    if (!hasPermission("lead.view_all")) { void Promise.resolve().then(() => setLoading(false)); return; }
    void Promise.resolve().then(load);
  }, [hasPermission, load]);

  useEffect(() => {
    if (!hasPermission("lead.reassign")) return;
    void apiFetch<AssignableUser[]>("/leads/assignees").then(setAssignees).catch(() => setAssignees([]));
  }, [hasPermission]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1); setLoading(true); setSearch(draftSearch.trim()); setSource(draftSource.trim());
  }

  async function reassign(event: FormEvent) {
    event.preventDefault();
    if (!selected || !newAssignedUserId || reason.trim().length < 3) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/leads/${selected.id}/reassign`, { method: "POST", body: JSON.stringify({ newAssignedUserId, reason: reason.trim() }) });
      setSelected(null); setNewAssignedUserId(""); setReason(""); setMessage("Lead reassigned successfully.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to reassign lead.");
    } finally { setSaving(false); }
  }

  if (!hasPermission("lead.view_all")) return <div className="p-12 text-amber-800">You do not have permission to view all leads.</div>;

  return <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-700">Sales CRM</p><h1 className="mt-2 text-3xl font-semibold">Lead Management</h1></div><div className="flex gap-2">{hasPermission("customer.view") && <Link href="/customers" className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Customers</Link>}{hasPermission("lead.create") && <Link href="/leads/new" className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white">Create Lead</Link>}</div></header>
    {message && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={apply} className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-[1fr_220px_220px_auto]"><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search ID, customer, email, phone or destination" className="rounded-xl border px-3 py-2.5 text-sm"/><input value={draftSource} onChange={(event) => setDraftSource(event.target.value)} placeholder="Marketing Medium" className="rounded-xl border px-3 py-2.5 text-sm"/><select value={status} onChange={(event) => { setStatus(event.target.value as LeadStatus | ""); setPage(1); setLoading(true); }} className="rounded-xl border px-3 py-2.5 text-sm"><option value="">All statuses</option><optgroup label="Current business statuses">{BUSINESS_LEAD_STATUSES.map((item) => <option key={item} value={item}>{leadStatusLabel(item)}</option>)}</optgroup><optgroup label="Historical legacy statuses">{LEGACY_LEAD_STATUSES.map((item) => <option key={item} value={item}>{leadStatusLabel(item)}</option>)}</optgroup></select><button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Apply</button></form>
    <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm">{loading ? <p className="p-12 text-center text-slate-500">Loading leads…</p> : !error && result?.data.length === 0 ? <p className="p-12 text-center text-slate-500">No leads found.</p> : !error && <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Lead", "Received", "Customer / contact", "Destination / travel", "Marketing Medium", "Status", "Sales Advisor", "Action"].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y">{result?.data.map((lead) => <tr key={lead.id}><td className="px-4 py-4 font-mono text-xs" title={lead.id}>{lead.id.slice(0, 8).toUpperCase()}</td><td className="whitespace-nowrap px-4 py-4">{new Date(lead.receivedAt ?? lead.createdAt).toLocaleString("en-GB")}</td><td className="px-4 py-4"><p className="font-semibold">{lead.customer.firstName} {lead.customer.lastName}</p><p className="text-xs text-slate-500">{lead.customer.email ?? "—"} · {lead.customer.phone ?? "—"}</p></td><td className="px-4 py-4"><p>{lead.destination ?? "—"}</p><p className="text-xs text-slate-500">{lead.travelDate ? new Date(lead.travelDate).toLocaleDateString("en-GB") : "—"}{lead.travelEndDate ? ` – ${new Date(lead.travelEndDate).toLocaleDateString("en-GB")}` : ""}</p></td><td className="px-4 py-4">{lead.source ?? "—"}</td><td className="px-4 py-4">{leadStatusLabel(lead.status)}</td><td className="px-4 py-4">{lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : "Unassigned"}</td><td className="whitespace-nowrap px-4 py-4"><Link href={`/leads/${lead.id}`} className="font-semibold text-cyan-700">Open</Link>{hasPermission("lead.reassign") && lead.assignedUserId && <button type="button" onClick={() => { setSelected(lead); setNewAssignedUserId(""); setReason(""); }} className="ml-4 font-semibold text-amber-700">Reassign</button>}</td></tr>)}</tbody></table></div>}</section>
    {result && result.pagination.totalPages > 1 && <div className="mt-4 flex justify-between text-sm"><span>Page {result.pagination.page} of {result.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => { setPage((value) => value - 1); setLoading(true); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={page === result.pagination.totalPages} onClick={() => { setPage((value) => value + 1); setLoading(true); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>}
    {selected && <div role="dialog" aria-modal="true" aria-labelledby="reassign-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={reassign} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 id="reassign-title" className="text-xl font-semibold">Reassign lead</h2><p className="mt-1 text-sm text-slate-600">{selected.customer.firstName} {selected.customer.lastName} · Current owner: {selected.assignedUser ? `${selected.assignedUser.firstName} ${selected.assignedUser.lastName}` : "Unassigned"}</p><label className="mt-5 block text-sm font-medium">New Sales Advisor<select required value={newAssignedUserId} onChange={(event) => setNewAssignedUserId(event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5"><option value="">Select Sales Advisor</option>{assignees.filter((user) => user.id !== selected.assignedUserId).map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName} — {user.email}</option>)}</select></label><label className="mt-4 block text-sm font-medium">Reason<textarea required minLength={3} maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSelected(null)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Reassigning…" : "Reassign"}</button></div></form></div>}
  </main>;
}
