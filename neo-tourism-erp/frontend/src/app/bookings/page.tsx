"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { BookingListResponse } from "@/types/booking";

export default function BookingsPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<BookingListResponse | null>(null);
  const [folderNumber, setFolderNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (selectedPage = 1, folder = "", customerName = "") => {
    const query = new URLSearchParams({ page: String(selectedPage), limit: "20" });
    if (folder.trim()) query.set("folderNumber", folder.trim());
    if (customerName.trim()) query.set("customer", customerName.trim());
    try { setLoading(true); setResult(await apiFetch<BookingListResponse>(`/bookings?${query}`)); setError(""); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load bookings."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (hasPermission("booking.view")) void Promise.resolve().then(() => load()); else void Promise.resolve().then(() => setLoading(false)); }, [hasPermission, load]);
  function search(event: FormEvent) { event.preventDefault(); setPage(1); void load(1, folderNumber, customer); }
  if (!hasPermission("booking.view")) return <div className="p-12 text-amber-800">You do not have permission to view bookings.</div>;

  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
    <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Admin / Operations</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Bookings</h1><p className="mt-2 text-sm text-slate-600">Search and manage operational booking folders.</p></header>
    <form onSubmit={search} className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]"><input value={folderNumber} onChange={(e) => setFolderNumber(e.target.value)} placeholder="Folder number" className="rounded-xl border border-slate-300 px-3 py-2.5"/><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer or passenger" className="rounded-xl border border-slate-300 px-3 py-2.5"/><button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white">Search</button></form>
    {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{loading ? <div className="p-12 text-center text-slate-500">Loading bookings…</div> : result?.data.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{["Folder No", "Customer", "Destination", "Travel Dates", "Sales Advisor", "Operations Owner", "Operations", "Travel", "Action"].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.data.map((booking) => <tr key={booking.id}><td className="px-4 py-4 font-bold text-slate-950">{booking.folderNumber}</td><td className="px-4 py-4">{booking.customer.firstName} {booking.customer.lastName}</td><td className="px-4 py-4">{booking.destination}</td><td className="whitespace-nowrap px-4 py-4">{new Date(booking.travelStartDate).toLocaleDateString("en-GB")} {booking.travelEndDate ? `– ${new Date(booking.travelEndDate).toLocaleDateString("en-GB")}` : ""}</td><td className="px-4 py-4">{booking.salesAdvisor.firstName} {booking.salesAdvisor.lastName}</td><td className="px-4 py-4">{booking.operationsOwner ? `${booking.operationsOwner.firstName} ${booking.operationsOwner.lastName}` : "Unassigned"}</td><td className="px-4 py-4">{booking.operationsStatus.replaceAll("_", " ")}</td><td className="px-4 py-4">{booking.travelStatus.replaceAll("_", " ")}</td><td className="px-4 py-4"><Link href={`/bookings/${booking.id}`} className="font-semibold text-emerald-700">Open →</Link></td></tr>)}</tbody></table></div> : <div className="p-12 text-center text-slate-500">No bookings found.</div>}</section>
    {result && result.pagination.totalPages > 1 && <div className="mt-5 flex items-center justify-between"><button disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); void load(next, folderNumber, customer); }} className="rounded-lg border px-4 py-2 disabled:opacity-40">Previous</button><span className="text-sm">Page {page} of {result.pagination.totalPages}</span><button disabled={page >= result.pagination.totalPages} onClick={() => { const next = page + 1; setPage(next); void load(next, folderNumber, customer); }} className="rounded-lg border px-4 py-2 disabled:opacity-40">Next</button></div>}
  </div>;
}
