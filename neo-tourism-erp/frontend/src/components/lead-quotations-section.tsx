"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "./auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { LeadActivity } from "@/types/lead";

function value(metadata: Record<string, unknown> | null, key: string) {
  const item = metadata?.[key];
  return typeof item === "string" ? item : "";
}

export function LeadQuotationsSection({ leadId, activities, onChanged }: { leadId: string; activities: LeadActivity[]; onChanged: () => Promise<void> }) {
  const { hasPermission } = useAuth();
  const quotations = activities.filter((activity) => activity.metadata?.kind === "QUOTATION");
  const [showForm, setShowForm] = useState(false);
  const [itinerary, setItinerary] = useState("");
  const [netFare, setNetFare] = useState("");
  const [quotedSellingFare, setQuotedSellingFare] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/leads/${leadId}/quotations`, {
        method: "POST",
        body: JSON.stringify({ itinerary: itinerary.trim(), netFare, quotedSellingFare, notes: notes.trim() || undefined }),
      });
      setItinerary("");
      setNetFare("");
      setQuotedSellingFare("");
      setNotes("");
      setShowForm(false);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to record quotation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Quotations</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Offer history</h2></div>
        {hasPermission("lead.edit") && <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white">{showForm ? "Cancel" : "Record Quotation"}</button>}
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {showForm && <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Flight details / itinerary<textarea required maxLength={5000} rows={4} value={itinerary} onChange={(event) => setItinerary(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3" /></label><label className="text-sm font-medium">Net fare<input required inputMode="decimal" pattern="\d{1,10}(\.\d{1,2})?" value={netFare} onChange={(event) => setNetFare(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Quoted selling fare<input required inputMode="decimal" pattern="\d{1,10}(\.\d{1,2})?" value={quotedSellingFare} onChange={(event) => setQuotedSellingFare(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-medium sm:col-span-2">Quotation notes<textarea maxLength={2000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3" /></label><button disabled={saving} className="w-fit rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Quotation"}</button></form>}
      <div className="mt-5 space-y-3">
        {quotations.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No quotations recorded.</p>}
        {quotations.map((quotation) => <article key={quotation.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-950">Quoted {value(quotation.metadata, "quotedSellingFare")}</p><time className="text-xs text-slate-500">{new Date(quotation.createdAt).toLocaleString("en-GB")}</time></div><p className="mt-1 text-sm text-slate-600">Net fare: {value(quotation.metadata, "netFare")}</p><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{value(quotation.metadata, "itinerary")}</p>{value(quotation.metadata, "notes") && <p className="mt-3 text-sm text-slate-600">{value(quotation.metadata, "notes")}</p>}<p className="mt-3 text-xs text-slate-500">Sales Advisor: {quotation.user.firstName} {quotation.user.lastName}</p></article>)}
      </div>
    </section>
  );
}
