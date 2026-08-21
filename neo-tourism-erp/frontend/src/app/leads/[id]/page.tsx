"use client";

import Link from "next/link";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  leadStatusLabel,
  type LeadActivity,
  type LeadDetail,
  type LeadStatus,
} from "@/types/lead";

const CHANGEABLE_STATUSES: LeadStatus[] = [
  "HANDLING",
  "QUOTING",
  "FOLLOW_UP",
  "CALLBACK",
  "GOING_TO_BOOK",
  "BOOKED_ELSEWHERE",
  "NOT_INTERESTED",
  "NO_RESPONSE",
  "TRAVEL_IN_FUTURE",
];

interface EditFields {
  destination: string;
  travelDate: string;
  summary: string;
  salesNotes: string;
  nextActionAt: string;
}

function fieldsFromLead(lead: LeadDetail): EditFields {
  return {
    destination: lead.destination ?? "",
    travelDate: lead.travelDate?.slice(0, 10) ?? "",
    summary: lead.summary ?? "",
    salesNotes: lead.salesNotes ?? "",
    nextActionAt: lead.nextActionAt?.slice(0, 16) ?? "",
  };
}

function activityTitle(activity: LeadActivity) {
  const labels: Record<LeadActivity["type"], string> = {
    LEAD_CREATED: "Lead created",
    LEAD_ASSIGNED: "Lead assigned",
    STATUS_CHANGED: "Status changed",
    NOTE_ADDED: "Note added",
    LEAD_UPDATED: "Lead updated",
  };
  return labels[activity.type];
}

export default function LeadDetailPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>("HANDLING");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<LeadDetail>(`/leads/${id}`);
      setLead(data);
      setFields(fieldsFromLead(data));
      setStatus(data.status);
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load lead.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hasPermission("lead.view")) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(load);
  }, [hasPermission, load]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!fields) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(`/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          destination: fields.destination,
          travelDate: fields.travelDate || undefined,
          summary: fields.summary,
          salesNotes: fields.salesNotes,
          nextActionAt: fields.nextActionAt
            ? new Date(fields.nextActionAt).toISOString()
            : undefined,
        }),
      });
      setMessage("Lead details updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update lead.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (status === "SALE_MADE") {
      setMessage("Sale Made workflow will be enabled in the next module.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/leads/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage("Lead status updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to change status.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/leads/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: note.trim() }),
      });
      setNote("");
      setMessage("Note added.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to add note.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-12 text-center text-sm text-slate-500">Loading lead…</div>;
  if (error && !lead) return <div className="p-12 text-center text-sm text-red-700">{error}</div>;
  if (!lead || !fields) return null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Lead workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{lead.customer.firstName} {lead.customer.lastName}</h1>
          <p className="mt-2 text-sm text-slate-600">Created {new Date(lead.createdAt).toLocaleString("en-GB")}</p>
        </div>
        <span className="w-fit rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-bold text-cyan-800">{leadStatusLabel(lead.status)}</span>
      </div>

      {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</p><h2 className="mt-2 text-xl font-semibold text-slate-950">{lead.customer.firstName} {lead.customer.lastName}</h2><p className="mt-1 text-sm text-slate-600">{lead.customer.customerType === "REPEAT" ? "Repeat Passenger" : `${lead.customer.customerType} Customer`}</p></div>
              {hasPermission("customer.view") && <Link href={`/customers/${lead.customer.id}`} className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">Open Customer Profile →</Link>}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Phone</p><p className="mt-1 text-sm text-slate-900">{lead.customer.phone ?? "—"}</p></div><div><p className="text-xs text-slate-500">Email</p><p className="mt-1 text-sm text-slate-900">{lead.customer.email ?? "—"}</p></div></div>
          </section>

          <form onSubmit={saveDetails} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Lead details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Destination<input disabled={!hasPermission("lead.edit")} value={fields.destination} onChange={(event) => setFields({ ...fields, destination: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Travel date<input type="date" disabled={!hasPermission("lead.edit")} value={fields.travelDate} onChange={(event) => setFields({ ...fields, travelDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Summary<textarea disabled={!hasPermission("lead.edit")} value={fields.summary} onChange={(event) => setFields({ ...fields, summary: event.target.value })} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Sales notes<textarea disabled={!hasPermission("lead.edit")} value={fields.salesNotes} onChange={(event) => setFields({ ...fields, salesNotes: event.target.value })} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Next action<input type="datetime-local" disabled={!hasPermission("lead.edit")} value={fields.nextActionAt} onChange={(event) => setFields({ ...fields, nextActionAt: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
            </div>
            {hasPermission("lead.edit") && <button disabled={saving} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save lead details</button>}
          </form>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Status & ownership</h2>
            <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Owner</dt><dd className="mt-1 text-slate-900">{lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : "Unassigned"}</dd></div><div><dt className="text-xs text-slate-500">Last meaningful activity</dt><dd className="mt-1 text-slate-900">{lead.lastMeaningfulActivityAt ? new Date(lead.lastMeaningfulActivityAt).toLocaleString("en-GB") : "—"}</dd></div></dl>
            {hasPermission("lead.change_status") && <div className="mt-5 flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm">{CHANGEABLE_STATUSES.map((item) => <option key={item} value={item}>{leadStatusLabel(item)}</option>)}<option value="SALE_MADE" disabled>SALE MADE — next module</option></select><button type="button" onClick={() => void changeStatus()} disabled={saving || status === lead.status} className="rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Change</button></div>}
          </section>

          {hasPermission("lead.note.create") && <form onSubmit={addNote} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Add note</h2><textarea required value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Record a meaningful customer interaction…" className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /><button disabled={saving || !note.trim()} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Add note</button></form>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Activity</h2>
            <div className="mt-5 space-y-5">
              {lead.activities.map((activity) => <article key={activity.id} className="border-l-2 border-cyan-200 pl-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{activityTitle(activity)}</p><time className="whitespace-nowrap text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString("en-GB")}</time></div><p className="mt-1 text-sm text-slate-600">{activity.description}</p><p className="mt-1 text-xs text-slate-500">{activity.user.firstName} {activity.user.lastName}</p></article>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
