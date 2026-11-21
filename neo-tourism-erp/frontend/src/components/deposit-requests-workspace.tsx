"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import { depositStatusLabel, type DepositRequest } from "@/types/deposit";

export function DepositRequestsWorkspace({ management = false }: { management?: boolean }) {
  const { hasPermission } = useAuth();
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const allowed = management
    ? hasPermission("deposit.approval.view")
    : hasPermission("deposit.request.view_own");

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      setRequests(
        await apiFetch<DepositRequest[]>(
          management ? "/deposit-requests/pending" : "/deposit-requests/my",
        ),
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load Deposit Requests.");
    }
  }, [allowed, management]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED" && !notes[id]?.trim()) {
      setError("Enter a rejection reason before rejecting the request.");
      return;
    }
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/deposit-requests/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, notes: notes[id] || undefined }),
      });
      await load();
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to record the decision.");
    } finally {
      setBusyId("");
    }
  }

  if (!allowed) return <div className="p-12 text-amber-800">You do not have permission to view Deposit Requests.</div>;
  const visible = management || filter === "ALL" ? requests : requests.filter((request) => request.status === filter);

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><header><p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">Deposit Gate</p><h1 className="mt-1 text-3xl font-semibold">{management ? "Pending Deposit Approvals" : "My Deposit Requests"}</h1><p className="mt-2 text-sm text-slate-600">Manual review only. No automatic reserve, profitability or eligibility formula is applied.</p></header>{!management && <div className="mt-5 flex flex-wrap gap-2">{["ALL", "PENDING_APPROVAL", "APPROVED", "REJECTED"].map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === status ? "bg-slate-900 text-white" : "bg-white border"}`}>{status.replaceAll("_", " ")}</button>)}</div>}{error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}<div className="mt-6 space-y-4">{visible.map((request) => <article key={request.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs text-slate-500">{request.id.slice(0, 8).toUpperCase()} · Customer {request.customerId.slice(0, 8).toUpperCase()}</p><h2 className="mt-1 text-xl font-semibold">{request.customer.firstName} {request.customer.lastName} · {request.destination}</h2><p className="mt-1 text-sm text-slate-600">Sales Advisor: {request.requestedBy.firstName} {request.requestedBy.lastName} · Submitted {new Date(request.createdAt).toLocaleString("en-GB")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${request.status === "APPROVED" ? "bg-emerald-50 text-emerald-800" : request.status === "REJECTED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{depositStatusLabel(request.status)}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6"><Value label="Travel" value={`${date(request.departureDate)}${request.arrivalDate ? ` – ${date(request.arrivalDate)}` : ""}`} /><Value label="Passengers" value={String(request.passengerCount)} /><Value label="Net fare" value={`GBP ${request.netFare}`} /><Value label="Selling fare" value={`GBP ${request.sellingFare}`} /><Value label="Cancellation" value={`GBP ${request.cancellationCost}`} /><Value label="Initial payment" value={`GBP ${request.initialPaymentAmount}`} /></dl><p className="mt-3 text-sm"><span className="text-slate-500">Balance payment date:</span> {date(request.balancePaymentDate)}</p>{request.arrangementNotes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>Arrangement notes:</b> {request.arrangementNotes}</p>}{request.decisionNotes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>Decision notes:</b> {request.decisionNotes}</p>}<div className="mt-4 flex flex-wrap items-center gap-3"><Link href={management ? `/admin/sales/${request.saleSubmissionId}` : `/sales/submissions/${request.saleSubmissionId}`} className="text-sm font-semibold text-cyan-700">View Payment Card →</Link><span className="text-xs text-slate-500">{attachmentCount(request)} supporting attachment(s)</span></div>{management && hasPermission("deposit.approval.decide") && <div className="mt-4 border-t pt-4"><label className="text-sm font-medium">Decision notes / rejection reason<textarea rows={2} value={notes[request.id] ?? ""} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label><div className="mt-3 flex justify-end gap-2"><button disabled={busyId === request.id} type="button" onClick={() => void decide(request.id, "REJECTED")} className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Reject</button><button disabled={busyId === request.id} type="button" onClick={() => void decide(request.id, "APPROVED")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Approve</button></div></div>}</article>)}{!visible.length && <p className="rounded-2xl border bg-white p-10 text-center text-slate-500">No Deposit Requests found.</p>}</div></main>;
}

function Value({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>; }
function date(value: string) { return new Date(value).toLocaleDateString("en-GB"); }
function attachmentCount(request: DepositRequest) { return request.saleSubmission.products.reduce((total, product) => total + product.attachments.length, 0) + request.saleSubmission.paymentEntries.reduce((total, payment) => total + payment.evidence.length, 0); }
