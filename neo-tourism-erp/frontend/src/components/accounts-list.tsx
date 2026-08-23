"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AccountsQueueItem, Discrepancy, Paged } from "@/types/accounts";

export function AccountsList({ mode }: { mode: "queue" | "discrepancies" | "reconciled" }) {
  const [data, setData] = useState<Array<AccountsQueueItem | Discrepancy>>([]);
  const [filter, setFilter] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const path = mode === "queue" ? `/accounts/reconciliation-queue?limit=50${filter ? `&status=${filter}` : ""}` : mode === "discrepancies" ? `/accounts/discrepancies?limit=50${filter ? `&discrepancyStatus=${filter}` : ""}` : "/accounts/reconciled?limit=50";
      setData((await apiFetch<Paged<AccountsQueueItem | Discrepancy>>(path)).data); setError("");
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load Accounts records."); }
  }, [filter, mode]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const title = mode === "queue" ? "Reconciliation Queue" : mode === "discrepancies" ? "Discrepancies" : "Reconciled Folders";
  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><p className="text-sm font-semibold uppercase tracking-wider text-violet-700">Accounts</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1>
    {mode !== "reconciled" && <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"><option value="">All active</option>{(mode === "queue" ? ["NOT_STARTED","RECONCILIATION_PENDING","DISCREPANCY"] : ["OPEN","IN_PROGRESS","RESOLVED","CANCELLED"]).map((x) => <option key={x}>{x}</option>)}</select>}
    {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{(mode === "discrepancies" ? ["Folder","Customer","Type","Difference","Assigned","Status","Created","Action"] : ["Folder","Customer","Travel / Reconciled","Selling / Profit","Status","Created","Action"]).map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.map((row) => {
      if (mode === "discrepancies") { const item = row as Discrepancy; return <tr key={item.id}><td className="px-4 py-3 font-semibold">{item.booking.folderNumber}</td><td className="px-4 py-3">{item.booking.customer.firstName} {item.booking.customer.lastName}</td><td className="px-4 py-3">{item.type.replaceAll("_", " ")}</td><td className="px-4 py-3">{item.amountDifference ? `${item.currency ?? item.booking.currency} ${item.amountDifference}` : "—"}</td><td className="px-4 py-3">{item.assignedUser ? `${item.assignedUser.firstName} ${item.assignedUser.lastName}` : "Unassigned"}</td><td className="px-4 py-3">{item.status}</td><td className="px-4 py-3">{new Date(item.createdAt).toLocaleDateString("en-GB")}</td><td className="px-4 py-3"><Link className="font-semibold text-violet-700" href={`/bookings/${item.booking.id}`}>Review</Link></td></tr>; }
      const item = row as AccountsQueueItem; return <tr key={item.id}><td className="px-4 py-3 font-semibold">{item.folderNumber}</td><td className="px-4 py-3">{item.customer.firstName} {item.customer.lastName}</td><td className="px-4 py-3">{mode === "reconciled" && item.reconciliation?.status === "RECONCILED" ? "Reconciled" : new Date(item.travelStartDate).toLocaleDateString("en-GB")}</td><td className="px-4 py-3">{item.currency} {mode === "reconciled" ? item.finance?.expectedProfit ?? "—" : item.sellingPrice}</td><td className="px-4 py-3">{item.accountsStatus.replaceAll("_", " ")}</td><td className="px-4 py-3">{new Date(item.createdAt).toLocaleDateString("en-GB")}</td><td className="px-4 py-3"><Link className="font-semibold text-violet-700" href={`/bookings/${item.id}`}>Review</Link></td></tr>;
    })}</tbody></table>{!data.length && !error && <p className="p-8 text-center text-slate-500">No records found.</p>}</div></div>;
}
