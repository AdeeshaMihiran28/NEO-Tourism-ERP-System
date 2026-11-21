"use client";

import { useState, type FormEvent } from "react";
import { apiDownload, ApiError, apiFetch } from "@/lib/api/client";
import type {
  SaleInstallment,
  SalePaymentEntry,
  SalePaymentMethod,
} from "@/types/sale";

const methods: SalePaymentMethod[] = [
  "BANK_TRANSFER",
  "STRIPE_PAYMENT",
  "WISE_CARD_PAYMENT",
  "CASH",
];

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cents(value: string | null) {
  const [whole = "0", fraction = ""] = (value ?? "0").split(".");
  return Number(whole || "0") * 100 + Number(`${fraction}00`.slice(0, 2));
}

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${(absolute % 100).toString().padStart(2, "0")}`;
}

interface PaymentFields {
  method: SalePaymentMethod;
  amount: string;
  paymentDate: string;
  transactionReference: string;
  notes: string;
}

const emptyPayment: PaymentFields = {
  method: "BANK_TRANSFER",
  amount: "",
  paymentDate: "",
  transactionReference: "",
  notes: "",
};

interface InstallmentFields {
  amount: string;
  dueDate: string;
  notes: string;
}

const emptyInstallment: InstallmentFields = { amount: "", dueDate: "", notes: "" };

export function SalePaymentsSection({
  submissionId,
  sellingPrice,
  initialPaymentAmount,
  currency,
  payments,
  installments,
  canEdit,
  onReload,
}: {
  submissionId: string;
  sellingPrice: string | null;
  initialPaymentAmount: string | null;
  currency: string;
  payments: SalePaymentEntry[];
  installments: SaleInstallment[];
  canEdit: boolean;
  onReload: () => Promise<void>;
}) {
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentFields>(emptyPayment);
  const [installmentId, setInstallmentId] = useState<string | null>(null);
  const [installment, setInstallment] = useState<InstallmentFields>(emptyInstallment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const agreed = cents(sellingPrice);
  const initial = cents(initialPaymentAmount);
  const scheduledInstallments = installments.reduce((sum, item) => sum + cents(item.amount), 0);
  const remaining = agreed - initial;
  const discrepancy = agreed - initial - scheduledInstallments;

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        paymentId === "new"
          ? `/sale-submissions/${submissionId}/payments`
          : `/sale-submissions/${submissionId}/payments/${paymentId}`,
        {
          method: paymentId === "new" ? "POST" : "PATCH",
          body: JSON.stringify(payment),
        },
      );
      setPaymentId(null);
      setPayment(emptyPayment);
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save payment entry.");
    } finally {
      setBusy(false);
    }
  }

  async function saveInstallment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        installmentId === "new"
          ? `/sale-submissions/${submissionId}/installments`
          : `/sale-submissions/${submissionId}/installments/${installmentId}`,
        {
          method: installmentId === "new" ? "POST" : "PATCH",
          body: JSON.stringify(installment),
        },
      );
      setInstallmentId(null);
      setInstallment(emptyInstallment);
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save installment.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    if (!window.confirm("Remove this draft record?")) return;
    setBusy(true);
    try {
      await apiFetch(path, { method: "DELETE" });
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to remove record.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(paymentEntryId: string, files: File[]) {
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        await apiFetch(`/sale-submissions/${submissionId}/payments/${paymentEntryId}/evidence`, {
          method: "POST",
          body,
        });
      }
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to upload evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function view(paymentEntryId: string, evidenceId: string) {
    try {
      const blob = await apiDownload(
        `/sale-submissions/${submissionId}/payments/${paymentEntryId}/evidence/${evidenceId}`,
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to view evidence.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Payments and Installments</h2>
      <p className="mt-1 text-sm text-slate-600">Planned installments are separate from recorded customer payments.</p>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Summary label="Agreed total" value={`${currency} ${money(agreed)}`} />
        <Summary label="Initial payment" value={`${currency} ${money(initial)}`} />
        <Summary label="Remaining scheduled balance" value={`${currency} ${money(remaining)}`} />
        <Summary label="Schedule discrepancy" value={`${currency} ${money(discrepancy)}`} warning={discrepancy !== 0} />
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Recorded customer payments</h3>{canEdit && !paymentId && <button type="button" onClick={() => { setPaymentId("new"); setPayment(emptyPayment); }} className="text-sm font-semibold text-cyan-700">Add payment</button>}</div>
        {paymentId && <form onSubmit={savePayment} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Method<select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value as SalePaymentMethod })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{methods.map((method) => <option key={method} value={method}>{label(method)}</option>)}</select></label>
          <label className="text-sm font-medium">Amount ({currency})<input required type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium">Actual payment date<input required type="date" value={payment.paymentDate} onChange={(event) => setPayment({ ...payment, paymentDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium">Transaction reference<input value={payment.transactionReference} onChange={(event) => setPayment({ ...payment, transactionReference: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium sm:col-span-2">Notes<textarea rows={2} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setPaymentId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={busy} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white">Save payment</button></div>
        </form>}

        <div className="mt-4 space-y-3">{payments.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold text-slate-950">{label(item.method)} · {currency} {item.amount}</p><p className="mt-1 text-sm text-slate-600">{new Date(item.paymentDate).toLocaleDateString("en-GB")} · {label(item.status)}{item.transactionReference ? ` · ${item.transactionReference}` : ""}</p></div>{canEdit && <div className="flex gap-2"><button type="button" onClick={() => { setPaymentId(item.id); setPayment({ method: item.method, amount: item.amount, paymentDate: item.paymentDate.slice(0, 10), transactionReference: item.transactionReference ?? "", notes: item.notes ?? "" }); }} className="text-sm font-semibold text-cyan-700">Edit</button><button type="button" onClick={() => void remove(`/sale-submissions/${submissionId}/payments/${item.id}`)} className="text-sm font-semibold text-red-700">Remove</button></div>}</div>
          {item.notes && <p className="mt-2 text-sm text-slate-700">{item.notes}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-slate-500">Evidence</span>{item.evidence.map((file) => <span key={file.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs"><button type="button" onClick={() => void view(item.id, file.id)} className="font-semibold text-cyan-700">{file.fileName}</button>{canEdit && <button type="button" onClick={() => void remove(`/sale-submissions/${submissionId}/payments/${item.id}/evidence/${file.id}`)} className="ml-2 text-red-700">×</button>}</span>)}{canEdit && <label className="cursor-pointer text-xs font-semibold text-cyan-700">Upload<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => void upload(item.id, Array.from(event.target.files ?? []))} /></label>}</div>
        </article>)}{!payments.length && <p className="text-sm text-slate-500">No customer payments recorded.</p>}</div>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Planned installments</h3>{canEdit && !installmentId && <button type="button" onClick={() => { setInstallmentId("new"); setInstallment(emptyInstallment); }} className="text-sm font-semibold text-cyan-700">Add installment</button>}</div>
        {installmentId && <form onSubmit={saveInstallment} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Amount ({currency})<input required type="number" min="0.01" step="0.01" value={installment.amount} onChange={(event) => setInstallment({ ...installment, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium">Due date<input required type="date" value={installment.dueDate} onChange={(event) => setInstallment({ ...installment, dueDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium sm:col-span-2">Notes<input value={installment.notes} onChange={(event) => setInstallment({ ...installment, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setInstallmentId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={busy} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white">Save installment</button></div>
        </form>}
        <div className="mt-4 space-y-2">{installments.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"><div><p className="font-semibold">{currency} {item.amount} · due {new Date(item.dueDate).toLocaleDateString("en-GB")}</p>{item.notes && <p className="text-sm text-slate-600">{item.notes}</p>}</div>{canEdit && <div className="flex gap-2"><button type="button" onClick={() => { setInstallmentId(item.id); setInstallment({ amount: item.amount, dueDate: item.dueDate.slice(0, 10), notes: item.notes ?? "" }); }} className="text-sm font-semibold text-cyan-700">Edit</button><button type="button" onClick={() => void remove(`/sale-submissions/${submissionId}/installments/${item.id}`)} className="text-sm font-semibold text-red-700">Remove</button></div>}</div>)}{!installments.length && <p className="text-sm text-slate-500">No installments scheduled.</p>}</div>
      </div>
    </section>
  );
}

function Summary({ label: title, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-xl border p-3 ${warning ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="text-xs uppercase tracking-wider text-slate-500">{title}</p><p className={`mt-1 font-semibold ${warning ? "text-amber-900" : "text-slate-950"}`}>{value}</p></div>;
}
