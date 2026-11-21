"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { FollowUpsSection } from "@/components/follow-ups-section";
import { LeadQuotationsSection } from "@/components/lead-quotations-section";
import { ApiError, apiFetch } from "@/lib/api/client";
import { customerTypeLabel } from "@/types/customer";
import {
  LEAD_STATUSES,
  MANUAL_LEAD_STATUSES,
  leadStatusLabel,
  type LeadActivity,
  type LeadDetail,
  type LeadStatus,
} from "@/types/lead";

const SALE_ELIGIBLE_STATUSES: LeadStatus[] = [
  "HANDLING",
  "QUOTING",
  "FOLLOW_UP",
  "CALLBACK",
  "GOING_TO_BOOK",
];

interface AssignableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface EditFields {
  source: string;
  destination: string;
  travelDate: string;
  travelEndDate: string;
  summary: string;
  salesNotes: string;
}

function fieldsFromLead(lead: LeadDetail): EditFields {
  return {
    source: lead.source ?? "",
    destination: lead.destination ?? "",
    travelDate: lead.travelDate?.slice(0, 10) ?? "",
    travelEndDate: lead.travelEndDate?.slice(0, 10) ?? "",
    summary: lead.summary ?? "",
    salesNotes: lead.salesNotes ?? "",
  };
}

function activityTitle(activity: LeadActivity) {
  if (activity.metadata?.kind === "QUOTATION") return "Quotation recorded";
  const labels: Record<LeadActivity["type"], string> = {
    LEAD_CREATED: "Lead created",
    LEAD_ASSIGNED: "Lead assigned",
    STATUS_CHANGED: "Status changed",
    NOTE_ADDED: "Note added",
    LEAD_UPDATED: "Lead updated",
    FOLLOW_UP_CREATED: "Follow-up scheduled",
    FOLLOW_UP_UPDATED: "Follow-up updated",
    FOLLOW_UP_COMPLETED: "Follow-up completed",
    FOLLOW_UP_CANCELLED: "Follow-up cancelled",
    FOLLOW_UP_MISSED: "Follow-up missed",
    ATTENTION_FLAGGED: "Attention required",
    ATTENTION_CLEARED: "Attention cleared",
    LEAD_REASSIGNED: "Lead reassigned",
    SALE_MADE_STARTED: "Sale workflow started",
    SALE_SUBMISSION_UPDATED: "Payment Card updated",
    SALE_SUBMITTED_TO_ADMIN: "Sale submitted to Admin",
    SALE_ACCEPTED_BY_ADMIN: "Sale accepted by Admin",
  };
  return labels[activity.type];
}

function activityDescription(activity: LeadActivity) {
  if (activity.metadata?.kind === "QUOTATION") {
    return `${String(activity.metadata.itinerary ?? "Quotation")} · Net ${String(activity.metadata.netFare ?? "—")} · Quoted ${String(activity.metadata.quotedSellingFare ?? "—")}`;
  }
  if (activity.type !== "STATUS_CHANGED") return activity.description;
  const oldStatus = activity.metadata?.oldStatus;
  const newStatus = activity.metadata?.newStatus;
  if (
    typeof oldStatus === "string" &&
    typeof newStatus === "string" &&
    LEAD_STATUSES.includes(oldStatus as LeadStatus) &&
    LEAD_STATUSES.includes(newStatus as LeadStatus)
  ) {
    return `Status changed from ${leadStatusLabel(oldStatus as LeadStatus)} to ${leadStatusLabel(newStatus as LeadStatus)}.`;
  }
  return activity.description;
}

export default function LeadDetailPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>("FOLLOW_UP");
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [showReassign, setShowReassign] = useState(false);
  const [newAssignedUserId, setNewAssignedUserId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<LeadDetail>(`/leads/${id}`);
      setLead(data);
      setFields(fieldsFromLead(data));
      setStatus(MANUAL_LEAD_STATUSES.includes(data.status) ? data.status : "FOLLOW_UP");
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

  useEffect(() => {
    if (!hasPermission("lead.reassign")) return;
    void apiFetch<AssignableUser[]>("/leads/assignees")
      .then(setAssignees)
      .catch(() => setAssignees([]));
  }, [hasPermission]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!fields) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(`/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          source: fields.source,
          destination: fields.destination,
          travelDate: fields.travelDate || undefined,
          travelEndDate: fields.travelEndDate || undefined,
          summary: fields.summary,
          salesNotes: fields.salesNotes,
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

  async function markSaleMade() {
    if (!window.confirm("Start the Sale Done workflow?\n\nThis creates or opens the draft Payment Card. The lead becomes Sale Done only when the submission is sent to Admin.")) return;
    setSaving(true);
    setError("");
    try {
      const submission = await apiFetch<{ id: string }>(`/leads/${id}/sale-made`, { method: "POST" });
      router.push(`/sales/submissions/${submission.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to start the Sale Done workflow.");
      setSaving(false);
    }
  }

  async function callCustomer() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/integrations/telephony/leads/${id}/call`, { method: "POST" });
      setMessage("Call request sent to the configured telephony provider.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to start the call.");
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

  async function reassign(event: FormEvent) {
    event.preventDefault();
    if (!newAssignedUserId || reassignReason.trim().length < 3) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/leads/${id}/reassign`, {
        method: "POST",
        body: JSON.stringify({
          newAssignedUserId,
          reason: reassignReason.trim(),
        }),
      });
      setShowReassign(false);
      setNewAssignedUserId("");
      setReassignReason("");
      setMessage("Lead reassigned successfully.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to reassign lead.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-12 text-center text-sm text-slate-500">Loading lead…</div>;
  if (error && !lead) return <div className="p-12 text-center text-sm text-red-700">{error}</div>;
  if (!lead || !fields) return null;

  const timeline = [
    ...lead.activities.map((activity) => ({
      id: activity.id,
      title: activityTitle(activity),
      description: activityDescription(activity),
      createdAt: activity.createdAt,
      user: `${activity.user.firstName} ${activity.user.lastName}`,
    })),
    ...lead.callLogs.map((call) => ({
      id: call.id,
      title: `${call.direction === "INBOUND" ? "Inbound" : "Outbound"} call · ${call.status}`,
      description: `${call.phoneNumber}${call.endedAt ? ` · Ended ${new Date(call.endedAt).toLocaleString("en-GB")}` : ""}`,
      createdAt: call.startedAt,
      user: `${call.user.firstName} ${call.user.lastName}`,
    })),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Lead workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{lead.customer.firstName} {lead.customer.lastName}</h1>
          <p className="mt-2 text-sm text-slate-600">Received {new Date(lead.receivedAt ?? lead.createdAt).toLocaleString("en-GB")} · Created {new Date(lead.createdAt).toLocaleString("en-GB")} by {lead.createdBy.firstName} {lead.createdBy.lastName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lead.customer.phone && <button type="button" onClick={() => void callCustomer()} disabled={saving} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50">Call Customer</button>}
          {hasPermission("marketing.sales_signal.create") && <Link href={`/sales/marketing-signals?leadId=${lead.id}&destination=${encodeURIComponent(lead.destination ?? "")}`} className="rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-800">Marketing Signal</Link>}
          {lead.saleSubmission ? <Link href={`/sales/submissions/${lead.saleSubmission.id}`} className="rounded-xl border border-cyan-300 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800">Open Payment Card</Link> : hasPermission("sale.create") && SALE_ELIGIBLE_STATUSES.includes(lead.status) && <button type="button" onClick={() => void markSaleMade()} disabled={saving} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Start Sale / Payment Card</button>}
          <span className="w-fit rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-bold text-cyan-800">{leadStatusLabel(lead.status)}</span>
        </div>
      </div>

      {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {lead.isAttentionRequired && (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">⚠ Attention Required</p>
          <p className="mt-1">Reason: {lead.attentionReason?.replaceAll("_", " ") ?? "Follow-up required"}</p>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Lead Overview</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs text-slate-500">Lead reference</dt><dd className="mt-1 font-mono text-slate-900" title={lead.id}>{lead.id}</dd></div><div><dt className="text-xs text-slate-500">Current status</dt><dd className="mt-1 font-semibold text-cyan-800">{leadStatusLabel(lead.status)}</dd></div><div><dt className="text-xs text-slate-500">Sales Advisor</dt><dd className="mt-1 text-slate-900">{lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : "Unassigned"}</dd></div><div><dt className="text-xs text-slate-500">Inquiry received</dt><dd className="mt-1 text-slate-900">{new Date(lead.receivedAt ?? lead.createdAt).toLocaleString("en-GB")}</dd></div><div><dt className="text-xs text-slate-500">Marketing Medium</dt><dd className="mt-1 text-slate-900">{lead.source ?? "—"}</dd></div><div><dt className="text-xs text-slate-500">Customer</dt><dd className="mt-1 text-slate-900">{lead.customer.firstName} {lead.customer.lastName}</dd></div></dl>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</p><h2 className="mt-2 text-xl font-semibold text-slate-950">{lead.customer.firstName} {lead.customer.lastName}</h2><p className="mt-1 text-sm text-slate-600">{customerTypeLabel[lead.customer.customerType]} Customer</p></div>
              {hasPermission("customer.view") && <Link href={`/customers/${lead.customer.id}`} className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">Open Customer Profile →</Link>}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Primary phone</p><p className="mt-1 text-sm text-slate-900">{lead.customer.phone ?? "—"}</p></div><div><p className="text-xs text-slate-500">Primary email</p><p className="mt-1 text-sm text-slate-900">{lead.customer.email ?? "—"}</p></div><div><p className="text-xs text-slate-500">Additional phone</p><p className="mt-1 text-sm text-slate-900">{lead.customer.secondaryPhone ?? "—"}</p></div><div><p className="text-xs text-slate-500">Classification</p><p className="mt-1 text-sm text-slate-900">{customerTypeLabel[lead.customer.customerType]}</p></div></div>
          </section>

          <form onSubmit={saveDetails} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Travel & Inquiry Information</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Marketing Medium<input list="lead-detail-mediums" maxLength={100} disabled={!hasPermission("lead.edit")} value={fields.source} onChange={(event) => setFields({ ...fields, source: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /><datalist id="lead-detail-mediums"><option value="Website"/><option value="Facebook"/><option value="Telephone Call"/><option value="Direct Inquiry"/><option value="Other"/></datalist></label>
              <label className="text-sm font-medium text-slate-700">Destination<input disabled={!hasPermission("lead.edit")} value={fields.destination} onChange={(event) => setFields({ ...fields, destination: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Travel start date<input type="date" disabled={!hasPermission("lead.edit")} value={fields.travelDate} onChange={(event) => setFields({ ...fields, travelDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Travel end date<input type="date" min={fields.travelDate || undefined} disabled={!hasPermission("lead.edit")} value={fields.travelEndDate} onChange={(event) => setFields({ ...fields, travelEndDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <div className="text-sm text-slate-700"><p className="font-medium">Passenger count</p><p className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">{lead.booking ? lead.booking._count.passengers : "Not recorded at lead stage"}</p></div>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Inquiry notes<textarea disabled={!hasPermission("lead.edit")} value={fields.summary} onChange={(event) => setFields({ ...fields, summary: event.target.value })} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Travel requirements<textarea disabled={!hasPermission("lead.edit")} value={fields.salesNotes} onChange={(event) => setFields({ ...fields, salesNotes: event.target.value })} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
            </div>
            {hasPermission("lead.edit") && <button disabled={saving} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save lead details</button>}
          </form>

          <LeadQuotationsSection leadId={id} activities={lead.activities} onChanged={load} />
          <FollowUpsSection leadId={id} onChanged={load} />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Status & ownership</h2>
            <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Owner</dt><dd className="mt-1 text-slate-900">{lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : "Unassigned"}</dd></div><div><dt className="text-xs text-slate-500">Last meaningful activity</dt><dd className="mt-1 text-slate-900">{lead.lastMeaningfulActivityAt ? new Date(lead.lastMeaningfulActivityAt).toLocaleString("en-GB") : "—"}</dd></div></dl>
            {hasPermission("lead.change_status") && !["NEW", "SALE_MADE"].includes(lead.status) && <div className="mt-5 flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm">{MANUAL_LEAD_STATUSES.map((item) => <option key={item} value={item}>{leadStatusLabel(item)}</option>)}</select><button type="button" onClick={() => void changeStatus()} disabled={saving || status === lead.status} className="rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Change</button></div>}
            {lead.status === "NEW" && <p className="mt-4 text-xs text-slate-500">Pending leads must be claimed before their status can change.</p>}
            {hasPermission("lead.reassign") && lead.assignedUser && <button type="button" onClick={() => setShowReassign(true)} className="mt-4 text-sm font-semibold text-amber-700">Reassign Sales Advisor</button>}
          </section>

          {hasPermission("lead.note.create") && <form onSubmit={addNote} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Record conversation / note</h2><textarea required value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Record a meaningful customer interaction…" className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /><button disabled={saving || !note.trim()} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Add note</button></form>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Activity & Communication History</h2>
            <div className="mt-5 space-y-5">
              {timeline.map((item) => <article key={item.id} className="rounded-2xl rounded-tl-sm bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{item.title}</p><time className="whitespace-nowrap text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("en-GB")}</time></div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.description}</p><p className="mt-2 text-xs font-medium text-cyan-700">{item.user}</p></article>)}
              {timeline.length === 0 && <p className="text-sm text-slate-500">No activity recorded.</p>}
            </div>
          </section>
        </div>
      </div>
      {showReassign && <div role="dialog" aria-modal="true" aria-labelledby="workspace-reassign-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={reassign} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 id="workspace-reassign-title" className="text-xl font-semibold">Reassign Sales Advisor</h2><label className="mt-5 block text-sm font-medium">New Sales Advisor<select required value={newAssignedUserId} onChange={(event) => setNewAssignedUserId(event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5"><option value="">Select Sales Advisor</option>{assignees.filter((user) => user.id !== lead.assignedUserId).map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName} — {user.email}</option>)}</select></label><label className="mt-4 block text-sm font-medium">Reason<textarea required minLength={3} maxLength={500} rows={4} value={reassignReason} onChange={(event) => setReassignReason(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowReassign(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Reassigning…" : "Reassign"}</button></div></form></div>}
    </div>
  );
}
