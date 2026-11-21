"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import { depositStatusLabel, type DepositRequest } from "@/types/deposit";
import type { SaleSubmission } from "@/types/sale";

export function DepositRequestSection({ submission }: { submission: SaleSubmission }) {
  const { hasPermission } = useAuth();
  const [request, setRequest] = useState<DepositRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [passengerCount, setPassengerCount] = useState("1");
  const [cancellationCost, setCancellationCost] = useState("");
  const [notes, setNotes] = useState(submission.paymentArrangementNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRequest(
        await apiFetch<DepositRequest | null>(
          `/deposit-requests/by-submission/${submission.id}`,
        ),
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load Deposit Request.");
    } finally {
      setLoaded(true);
    }
  }, [submission.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/deposit-requests/submission/${submission.id}`, {
        method: "POST",
        body: JSON.stringify({
          passengerCount: Number(passengerCount),
          cancellationCost,
          arrangementNotes: notes || undefined,
        }),
      });
      await load();
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to submit Deposit Request.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (request) return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Deposit Request</h2><p className="mt-1 text-sm text-slate-600">Submitted {new Date(request.createdAt).toLocaleString("en-GB")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${request.status === "APPROVED" ? "bg-emerald-50 text-emerald-800" : request.status === "REJECTED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{depositStatusLabel(request.status)}</span></div>{request.decisionNotes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><b>Decision notes:</b> {request.decisionNotes}</p>}<Link href="/sales/deposits" className="mt-4 inline-block text-sm font-semibold text-cyan-700">View my Deposit Requests →</Link></section>;

  const eligible =
    hasPermission("deposit.request.create") &&
    ["DRAFT", "SUBMITTED_TO_ADMIN"].includes(submission.status) &&
    ["DEPOSIT", "INTERNAL_DEPOSIT"].includes(submission.paymentType ?? "");
  if (!eligible) return null;

  return <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6"><h2 className="text-lg font-semibold text-slate-950">Request Deposit Approval</h2><p className="mt-1 text-sm text-slate-600">The request freezes the current GBP fares and payment arrangement for manual Management review.</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Net fare</dt><dd className="font-semibold">GBP {submission.estimatedCostOfSale ?? "—"}</dd></div><div><dt className="text-slate-500">Selling fare</dt><dd className="font-semibold">GBP {submission.sellingPrice ?? "—"}</dd></div><div><dt className="text-slate-500">Initial payment</dt><dd className="font-semibold">GBP {submission.initialPaymentAmount ?? "—"}</dd></div></dl>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Passengers<input required type="number" min="1" max="100" value={passengerCount} onChange={(event) => setPassengerCount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" /></label><label className="text-sm font-medium">Cancellation cost (GBP)<input required type="number" min="0" step="0.01" value={cancellationCost} onChange={(event) => setCancellationCost(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" /></label><label className="text-sm font-medium sm:col-span-2">Arrangement notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" /></label><div className="sm:col-span-2 flex justify-end"><button disabled={busy} className="rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Submit for approval</button></div></form></section>;
}
