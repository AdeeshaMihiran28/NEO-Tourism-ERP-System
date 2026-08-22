"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AuditEntry, AuditListResponse } from "@/types/audit";

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<AuditListResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const response = await apiFetch<AuditListResponse>(`/audit?limit=50${query ? `&${query}` : ""}`);
      setResult(response);
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load audit records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission("audit.view")) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(() => load());
  }, [hasPermission, load]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim()) query.set(key, value.trim());
    }
    void load(query.toString());
  }

  if (!hasPermission("audit.view")) {
    return <div className="mx-auto max-w-5xl px-5 py-12 text-amber-800">You do not have permission to view audit logs.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Audit & Security</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Audit log</h1>
        <p className="mt-2 text-sm text-slate-600">Review accountable changes across users, customers, leads, and roles.</p>
      </header>

      <form onSubmit={submitFilters} className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["action", "Action", "e.g. LEAD_ASSIGNED"],
          ["entityType", "Entity type", "e.g. Lead"],
          ["actorUserId", "Actor user ID", "UUID"],
          ["entityId", "Entity ID", "UUID"],
        ].map(([name, label, placeholder]) => (
          <label key={name} className="text-xs font-semibold text-slate-600">
            {label}
            <input name={name} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
          </label>
        ))}
        <label className="text-xs font-semibold text-slate-600">From<input name="dateFrom" type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-semibold text-slate-600">To<input name="dateTo" type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="submit" className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800">Apply filters</button>
          <button type="reset" onClick={() => void load()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear</button>
        </div>
      </form>

      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading audit records…</div>}
        {!loading && !error && result?.data.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No audit records match these filters.</div>}
        {!loading && result && result.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Date", "User", "Action", "Entity", "Entity ID", "Details"].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((entry: AuditEntry) => (
                  <AuditRow key={entry.id} entry={entry} expanded={expandedId === entry.id} onToggle={() => setExpandedId((current) => current === entry.id ? null : entry.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AuditRow({ entry, expanded, onToggle }: { entry: AuditEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="align-top hover:bg-slate-50/70">
        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{new Date(entry.createdAt).toLocaleString("en-GB")}</td>
        <td className="px-4 py-4"><p className="font-medium text-slate-900">{entry.actor.firstName} {entry.actor.lastName}</p><p className="text-xs text-slate-500">{entry.actor.email}</p></td>
        <td className="whitespace-nowrap px-4 py-4 font-semibold text-cyan-800">{entry.action}</td>
        <td className="px-4 py-4 text-slate-700">{entry.entityType}</td>
        <td className="max-w-44 truncate px-4 py-4 font-mono text-xs text-slate-500" title={entry.entityId}>{entry.entityId}</td>
        <td className="px-4 py-4"><button type="button" onClick={onToggle} className="font-semibold text-cyan-700 hover:text-cyan-900">{expanded ? "Hide" : "View"}</button></td>
      </tr>
      {expanded && (
        <tr><td colSpan={6} className="bg-slate-50 px-5 py-5"><div className="grid gap-4 lg:grid-cols-3"><JsonBlock label="Old values" value={entry.oldValues} /><JsonBlock label="New values" value={entry.newValues} /><JsonBlock label="Metadata" value={entry.metadata} /></div><div className="mt-4 text-xs text-slate-500">IP: {entry.ipAddress ?? "Not captured"} · User agent: {entry.userAgent ?? "Not captured"}</div></td></tr>
      )}
    </>
  );
}
