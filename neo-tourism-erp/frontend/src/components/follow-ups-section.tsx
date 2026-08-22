"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { FollowUp, FollowUpStatus, FollowUpType } from "@/types/lead";

const typeLabels: Record<FollowUpType, string> = {
  CALLBACK: "Callback",
  GENERAL_FOLLOW_UP: "General follow-up",
  EMAIL_FOLLOW_UP: "Email follow-up",
  OTHER: "Other",
};

const groups: Array<{ status: FollowUpStatus; label: string }> = [
  { status: "SCHEDULED", label: "Upcoming" },
  { status: "COMPLETED", label: "Completed" },
  { status: "MISSED", label: "Missed" },
  { status: "CANCELLED", label: "Cancelled" },
];

export function FollowUpsSection({
  leadId,
  onChanged,
}: {
  leadId: string;
  onChanged: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<FollowUpType>("CALLBACK");
  const [scheduledAt, setScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hasPermission("followup.view")) return;
    try {
      setItems(await apiFetch<FollowUp[]>(`/leads/${leadId}/follow-ups`));
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load follow-ups.");
    }
  }, [hasPermission, leadId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function schedule(event: FormEvent) {
    event.preventDefault();
    const date = new Date(scheduledAt);
    if (!scheduledAt || date.getTime() <= Date.now()) {
      setError("Choose a future date and time.");
      return;
    }
    if (!note.trim()) {
      setError("A follow-up note is required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/leads/${leadId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({
          type,
          scheduledAt: date.toISOString(),
          note: note.trim(),
        }),
      });
      setShowForm(false);
      setScheduledAt("");
      setNote("");
      await load();
      await onChanged();
      window.dispatchEvent(new Event("neo-attention-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to schedule follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function action(id: string, verb: "complete" | "cancel") {
    setSaving(true);
    try {
      await apiFetch(`/follow-ups/${id}/${verb}`, {
        method: "POST",
        body: verb === "cancel" ? JSON.stringify({}) : undefined,
      });
      await load();
      await onChanged();
      window.dispatchEvent(new Event("neo-attention-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : `Unable to ${verb} follow-up.`);
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("followup.view") && !hasPermission("followup.create")) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Follow-ups & callbacks</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Scheduled customer contact</h2>
        </div>
        {hasPermission("followup.create") && (
          <button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800">
            Schedule Follow-Up
          </button>
        )}
      </div>

      {error && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="mt-6 space-y-6">
        {groups.map((group) => {
          const entries = items.filter((item) => item.status === group.status);
          if (group.status === "CANCELLED" && entries.length === 0) return null;
          return (
            <div key={group.status}>
              <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{group.label}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{entries.length}</span></div>
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {entries.map((followUp) => (
                  <article key={followUp.id} className={`p-4 ${followUp.status === "MISSED" ? "bg-rose-50/60" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-semibold text-slate-950">{typeLabels[followUp.type]}</p><p className="mt-1 text-sm text-slate-600">{followUp.note}</p><p className="mt-2 text-xs text-slate-500">Created by {followUp.createdBy.firstName} {followUp.createdBy.lastName}</p></div>
                      <div className="text-right"><time className="text-sm font-semibold text-slate-800">{new Date(followUp.scheduledAt).toLocaleString("en-GB")}</time><p className="mt-1 text-xs font-bold text-slate-500">{followUp.status}</p></div>
                    </div>
                    {followUp.status === "SCHEDULED" && (
                      <div className="mt-3 flex gap-3 text-xs font-semibold">
                        {hasPermission("followup.complete") && <button disabled={saving} type="button" onClick={() => void action(followUp.id, "complete")} className="text-emerald-700">Complete</button>}
                        {hasPermission("followup.edit") && <button disabled={saving} type="button" onClick={() => void action(followUp.id, "cancel")} className="text-rose-700">Cancel</button>}
                      </div>
                    )}
                    {followUp.status === "MISSED" && hasPermission("followup.complete") && <button disabled={saving} type="button" onClick={() => void action(followUp.id, "complete")} className="mt-3 text-xs font-semibold text-emerald-700">Complete now</button>}
                  </article>
                ))}
                {entries.length === 0 && <p className="p-4 text-sm text-slate-500">No {group.label.toLowerCase()} follow-ups.</p>}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div role="dialog" aria-modal="true" aria-labelledby="schedule-follow-up-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={schedule} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="schedule-follow-up-title" className="text-xl font-semibold text-slate-950">Schedule Callback</h2>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Type<select value={type} onChange={(event) => setType(event.target.value as FollowUpType)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700">Date and time<input required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
              <label className="block text-sm font-medium text-slate-700">Note<textarea required minLength={1} maxLength={2000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Scheduling…" : "Schedule"}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
