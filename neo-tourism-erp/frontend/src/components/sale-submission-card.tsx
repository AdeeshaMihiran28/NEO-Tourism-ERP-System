"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  saleStatusLabel,
  type PaymentMethod,
  type SaleSubmission,
} from "@/types/sale";

const paymentMethods: PaymentMethod[] = [
  "BANK_TRANSFER",
  "CARD",
  "CASH",
  "WISE",
  "OTHER",
];

interface FormFields {
  destination: string;
  travelStartDate: string;
  travelEndDate: string;
  sellingPrice: string;
  depositAmount: string;
  currency: string;
  paymentMethod: "" | PaymentMethod;
  paymentReference: string;
  salesNotes: string;
}

function fieldsFromSubmission(item: SaleSubmission): FormFields {
  return {
    destination: item.destination ?? "",
    travelStartDate: item.travelStartDate?.slice(0, 10) ?? "",
    travelEndDate: item.travelEndDate?.slice(0, 10) ?? "",
    sellingPrice: item.sellingPrice ?? "",
    depositAmount: item.depositAmount ?? "",
    currency: item.currency ?? "GBP",
    paymentMethod: item.paymentMethod ?? "",
    paymentReference: item.paymentReference ?? "",
    salesNotes: item.salesNotes ?? "",
  };
}

export function SaleSubmissionCard({ id, adminMode = false }: { id: string; adminMode?: boolean }) {
  const { hasPermission } = useAuth();
  const [submission, setSubmission] = useState<SaleSubmission | null>(null);
  const [fields, setFields] = useState<FormFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SaleSubmission>(`/sale-submissions/${id}`);
      setSubmission(data);
      setFields(fieldsFromSubmission(data));
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load Payment Card.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const canEdit = !adminMode && submission?.status === "DRAFT" && hasPermission("sale.edit_own");

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    if (!fields || !canEdit) return false;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/sale-submissions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...fields,
          travelEndDate: fields.travelEndDate || undefined,
          depositAmount: fields.depositAmount || undefined,
          paymentMethod: fields.paymentMethod || undefined,
        }),
      });
      setMessage("Payment Card draft saved.");
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save Payment Card.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitToAdmin() {
    const saved = await saveDraft();
    if (!saved) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(`/sale-submissions/${id}/submit`, { method: "POST" });
      setMessage("Payment Card submitted to Admin.");
      await load();
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to submit Payment Card.");
    } finally {
      setSaving(false);
    }
  }

  async function acceptSale() {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/sale-submissions/${id}/accept`, { method: "POST" });
      setMessage("Sale accepted and ready for Folder / Booking Creation.");
      await load();
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to accept sale.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-12 text-center text-sm text-slate-500">Loading Payment Card…</div>;
  if (!submission || !fields) return <div className="p-12 text-center text-sm text-red-700">{error || "Payment Card not found."}</div>;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Sale / Payment Card</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{submission.customer.firstName} {submission.customer.lastName}</h1>
          <p className="mt-2 text-sm text-slate-600">Sales Advisor: {submission.submittedBy.firstName} {submission.submittedBy.lastName}</p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-bold text-cyan-800">{saleStatusLabel(submission.status)}</span>
      </header>

      {submission.status === "ADMIN_ACCEPTED" && <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">Accepted — Ready for Folder / Booking Creation</div>}
      {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs uppercase tracking-wider text-slate-500">Customer</p><p className="mt-1 font-semibold text-slate-950">{submission.customer.firstName} {submission.customer.lastName}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-slate-500">Contact</p><p className="mt-1 text-sm text-slate-800">{submission.customer.phone ?? submission.customer.email ?? "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-slate-500">Lead</p><Link href={`/leads/${submission.leadId}`} className="mt-1 inline-block text-sm font-semibold text-cyan-700">Open original lead →</Link></div>
        </div>
      </section>

      <form onSubmit={saveDraft} className="mt-6 space-y-6">
        <fieldset disabled={!canEdit || saving} className="space-y-6 disabled:opacity-75">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Travel Details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Destination / Product<input required value={fields.destination} onChange={(event) => setFields({ ...fields, destination: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Travel Start<input required type="date" value={fields.travelStartDate} onChange={(event) => setFields({ ...fields, travelStartDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Travel End<input type="date" min={fields.travelStartDate} value={fields.travelEndDate} onChange={(event) => setFields({ ...fields, travelEndDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Payment</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Selling Price<input required type="number" min="0" step="0.01" value={fields.sellingPrice} onChange={(event) => setFields({ ...fields, sellingPrice: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Deposit Amount<input type="number" min="0" step="0.01" value={fields.depositAmount} onChange={(event) => setFields({ ...fields, depositAmount: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Currency<input required maxLength={3} value={fields.currency} onChange={(event) => setFields({ ...fields, currency: event.target.value.toUpperCase() })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 uppercase disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Payment Method<select required value={fields.paymentMethod} onChange={(event) => setFields({ ...fields, paymentMethod: event.target.value as FormFields["paymentMethod"] })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50"><option value="">Select method</option>{paymentMethods.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Payment Reference<input value={fields.paymentReference} onChange={(event) => setFields({ ...fields, paymentReference: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="text-sm font-medium text-slate-700">Sales Notes<textarea rows={5} value={fields.salesNotes} onChange={(event) => setFields({ ...fields, salesNotes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
          </section>
        </fieldset>

        {canEdit && <div className="flex flex-wrap justify-end gap-3"><button type="submit" disabled={saving} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50">Save Draft</button>{hasPermission("sale.submit") && <button type="button" onClick={() => void submitToAdmin()} disabled={saving} className="rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Submit to Admin</button>}</div>}
        {adminMode && submission.status === "SUBMITTED_TO_ADMIN" && hasPermission("admin.sale.accept") && <div className="flex justify-end"><button type="button" onClick={() => void acceptSale()} disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Accept Sale</button></div>}
      </form>
    </div>
  );
}
