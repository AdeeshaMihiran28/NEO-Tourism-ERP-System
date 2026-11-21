"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { DepositRequestSection } from "@/components/deposit-request-section";
import { SalePaymentsSection } from "@/components/sale-payments-section";
import { SaleProductsSection } from "@/components/sale-products-section";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  saleStatusLabel,
  type BookingPaymentType,
  type SaleSubmission,
} from "@/types/sale";

interface FormFields {
  destination: string;
  travelStartDate: string;
  travelEndDate: string;
  sellingPrice: string;
  estimatedCostOfSale: string;
  currency: string;
  paymentType: "" | BookingPaymentType;
  initialPaymentAmount: string;
  finalBalancePaymentDate: string;
  paymentArrangementNotes: string;
  salesNotes: string;
  passengerInformation: string;
}

function fieldsFromSubmission(item: SaleSubmission): FormFields {
  return {
    destination: item.destination ?? "",
    travelStartDate: item.travelStartDate?.slice(0, 10) ?? "",
    travelEndDate: item.travelEndDate?.slice(0, 10) ?? "",
    sellingPrice: item.sellingPrice ?? "",
    estimatedCostOfSale: item.estimatedCostOfSale ?? "",
    currency: item.currency ?? "GBP",
    paymentType: item.paymentType ?? "",
    initialPaymentAmount: item.initialPaymentAmount ?? "",
    finalBalancePaymentDate: item.finalBalancePaymentDate?.slice(0, 10) ?? "",
    paymentArrangementNotes: item.paymentArrangementNotes ?? "",
    salesNotes: item.salesNotes ?? "",
    passengerInformation: item.passengerInformation ?? "",
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
          paymentType: fields.paymentType || undefined,
          initialPaymentAmount: fields.initialPaymentAmount || undefined,
          finalBalancePaymentDate: fields.finalBalancePaymentDate || undefined,
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
    if (!window.confirm("Submit this Payment Card to Admin? It will become read-only.")) return;
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
    if (!window.confirm("Accept this sale and make it ready for Booking creation?")) return;
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

  async function createBooking() {
    if (!window.confirm("Create the Booking folder from this accepted sale?")) return;
    setSaving(true);
    setError("");
    try {
      const booking = await apiFetch<{ id: string; folderNumber: string }>(`/sale-submissions/${id}/create-booking`, { method: "POST" });
      setMessage(`Folder Created Successfully — ${booking.folderNumber}`);
      await load();
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create booking folder.");
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

      {submission.status === "ADMIN_ACCEPTED" && <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{submission.booking ? <>Folder Created Successfully — {submission.booking.folderNumber} · <Link href={`/bookings/${submission.booking.id}`} className="underline">Open Booking</Link></> : "Accepted — Ready for Folder / Booking Creation"}</div>}
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
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Passenger information<textarea rows={4} value={fields.passengerInformation} onChange={(event) => setFields({ ...fields, passengerInformation: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Revenue and Estimated Cost of Sale</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Revenue<input required type="number" min="0" step="0.01" value={fields.sellingPrice} onChange={(event) => setFields({ ...fields, sellingPrice: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Estimated Cost of Sale<input required type="number" min="0" step="0.01" value={fields.estimatedCostOfSale} onChange={(event) => setFields({ ...fields, estimatedCostOfSale: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Currency<input required maxLength={3} value={fields.currency} onChange={(event) => setFields({ ...fields, currency: event.target.value.toUpperCase() })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 uppercase disabled:bg-slate-50" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Payment Arrangement</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Payment type<select required value={fields.paymentType} onChange={(event) => setFields({ ...fields, paymentType: event.target.value as FormFields["paymentType"] })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50"><option value="">Select payment type</option><option value="FULL_PAYMENT">Full Payment</option><option value="DEPOSIT">Deposit</option><option value="INTERNAL_DEPOSIT">Internal Deposit</option></select></label>
              <label className="text-sm font-medium text-slate-700">Initial payment amount<input type="number" min="0" step="0.01" value={fields.initialPaymentAmount} onChange={(event) => setFields({ ...fields, initialPaymentAmount: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Final balance payment date<input type="date" value={fields.finalBalancePaymentDate} onChange={(event) => setFields({ ...fields, finalBalancePaymentDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Payment arrangement notes<textarea rows={3} value={fields.paymentArrangementNotes} onChange={(event) => setFields({ ...fields, paymentArrangementNotes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="text-sm font-medium text-slate-700">Sales Notes<textarea rows={5} value={fields.salesNotes} onChange={(event) => setFields({ ...fields, salesNotes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-50" /></label>
          </section>
        </fieldset>

      </form>

      <div className="mt-6">
        <SaleProductsSection submissionId={submission.id} products={submission.products} currency={fields.currency || "—"} canEdit={Boolean(canEdit)} onReload={load} />
      </div>

      <div className="mt-6">
        <SalePaymentsSection submissionId={submission.id} sellingPrice={fields.sellingPrice || null} initialPaymentAmount={fields.initialPaymentAmount || null} currency={fields.currency || "—"} payments={submission.paymentEntries} installments={submission.installments} canEdit={Boolean(canEdit)} onReload={load} />
      </div>

      <div className="mt-6">
        <DepositRequestSection submission={submission} />
      </div>

      {canEdit && <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => void saveDraft()} disabled={saving} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50">Save Draft</button>{hasPermission("sale.submit") && <button type="button" onClick={() => void submitToAdmin()} disabled={saving} className="rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Submit to Admin</button>}</div>}
      {adminMode && submission.status === "SUBMITTED_TO_ADMIN" && hasPermission("admin.sale.accept") && <div className="mt-6 flex justify-end"><button type="button" onClick={() => void acceptSale()} disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Accept Sale</button></div>}
      {adminMode && submission.status === "ADMIN_ACCEPTED" && !submission.booking && hasPermission("booking.create") && <div className="mt-6 flex justify-end"><button type="button" onClick={() => void createBooking()} disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Create Booking / Folder</button></div>}
    </div>
  );
}
