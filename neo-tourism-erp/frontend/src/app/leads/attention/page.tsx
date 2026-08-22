"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { LeadListResponse, LeadSummary } from "@/types/lead";

interface AssignableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}

const reasonLabels = {
  NO_ACTIVITY_3_DAYS: "No meaningful activity for 3 days",
  MISSED_CALLBACK: "Missed callback",
  NO_FUTURE_ACTION: "No future action scheduled",
} as const;

function daysSince(value: string | null) {
  if (!value) return "—";
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
}

export default function AttentionLeadsPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<LeadListResponse | null>(null);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadSummary | null>(null);
  const [newAssignedUserId, setNewAssignedUserId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const leads = await apiFetch<LeadListResponse>("/leads/attention?limit=100");
      setResult(leads);
      if (hasPermission("lead.reassign") && hasPermission("user.view")) {
        const allUsers = await apiFetch<AssignableUser[]>("/users");
        setUsers(allUsers.filter((user) => user.isActive));
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load attention leads.");
    } finally {
      setLoading(false);
    }
  }, [hasPermission]);

  useEffect(() => {
    if (!hasPermission("lead.attention.view")) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(load);
  }, [hasPermission, load]);

  async function reassign(event: FormEvent) {
    event.preventDefault();
    if (!selectedLead || !newAssignedUserId || reason.trim().length < 3) return;
    setSaving(true);
    try {
      await apiFetch(`/leads/${selectedLead.id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ newAssignedUserId, reason: reason.trim() }),
      });
      setSelectedLead(null);
      setNewAssignedUserId("");
      setReason("");
      await load();
      window.dispatchEvent(new Event("neo-attention-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to reassign lead.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("lead.attention.view")) {
    return <div className="mx-auto max-w-5xl px-5 py-12 text-amber-800">You do not have permission to view attention leads.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Sales accountability</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Attention Leads</h1>
        <p className="mt-2 text-sm text-slate-600">Active leads with missed callbacks or no meaningful activity and no valid future action.</p>
      </header>
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading attention leads…</div>}
        {!loading && result?.data.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No leads currently require attention.</div>}
        {!loading && result && result.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wider text-slate-600"><tr>{["Customer", "Owner", "Status", "Reason", "Last Activity", "Next Action", "Days", "Action"].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((lead) => (
                  <tr key={lead.id} className="hover:bg-amber-50/40">
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-950">{lead.customer.firstName} {lead.customer.lastName}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">{lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : "Unassigned"}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{lead.status.replaceAll("_", " ")}</span></td>
                    <td className="min-w-52 px-4 py-4 font-medium text-amber-800">{lead.attentionReason ? reasonLabels[lead.attentionReason] : "Follow-up required"}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{lead.lastMeaningfulActivityAt ? new Date(lead.lastMeaningfulActivityAt).toLocaleString("en-GB") : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString("en-GB") : "None"}</td>
                    <td className="px-4 py-4 font-bold text-amber-800">{daysSince(lead.lastMeaningfulActivityAt)}</td>
                    <td className="whitespace-nowrap px-4 py-4"><Link href={`/leads/${lead.id}`} className="font-semibold text-cyan-700">Open</Link>{hasPermission("lead.reassign") && <button type="button" onClick={() => setSelectedLead(lead)} className="ml-4 font-semibold text-amber-700">Reassign</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedLead && (
        <div role="dialog" aria-modal="true" aria-labelledby="reassign-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={reassign} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="reassign-title" className="text-xl font-semibold text-slate-950">Reassign Attention Lead</h2>
            <p className="mt-1 text-sm text-slate-600">{selectedLead.customer.firstName} {selectedLead.customer.lastName}</p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">New owner{users.length > 0 ? <select required value={newAssignedUserId} onChange={(event) => setNewAssignedUserId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"><option value="">Select user</option>{users.filter((user) => user.id !== selectedLead.assignedUserId).map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName} — {user.email}</option>)}</select> : <input required value={newAssignedUserId} onChange={(event) => setNewAssignedUserId(event.target.value)} placeholder="New assigned user UUID" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />}</label>
              <label className="block text-sm font-medium text-slate-700">Reason<textarea required minLength={3} maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSelectedLead(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Reassigning…" : "Reassign"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
