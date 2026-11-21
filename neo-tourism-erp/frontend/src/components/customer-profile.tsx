"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { CustomerForm } from "./customer-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import { customerTypeLabel, type CustomerDetail, type CustomerInput, type CustomerNote, type Pagination } from "@/types/customer";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function date(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

function person(value: { firstName: string; lastName: string } | null) {
  return value ? `${value.firstName} ${value.lastName}` : "Unassigned";
}

function Pager({ pagination, onChange }: { pagination: Pagination; onChange: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>Page {pagination.page} of {pagination.totalPages}</span>
      <div className="flex gap-2">
        <button type="button" disabled={pagination.page <= 1} onClick={() => onChange(pagination.page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
        <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onChange(pagination.page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function CustomerProfile({ customerId }: { customerId: string }) {
  const { hasPermission } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [leadPage, setLeadPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchCustomer = useCallback(
    () => apiFetch<CustomerDetail>(`/customers/${customerId}?leadPage=${leadPage}&bookingPage=${bookingPage}&limit=10`),
    [bookingPage, customerId, leadPage],
  );

  useEffect(() => {
    if (!hasPermission("customer.view")) return;
    let active = true;
    Promise.all([fetchCustomer(), apiFetch<CustomerNote[]>(`/customers/${customerId}/notes`)])
      .then(([details, customerNotes]) => {
        if (!active) return;
        setCustomer(details);
        setNotes(customerNotes);
        setError("");
      })
      .catch((caught: unknown) => active && setError(caught instanceof ApiError ? caught.message : "Unable to load customer."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [customerId, fetchCustomer, hasPermission]);

  async function updateCustomer(input: CustomerInput) {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(input) });
      setCustomer(await fetchCustomer());
      setEditing(false);
      setSuccess("Customer information updated.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update customer.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<CustomerNote>(`/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify({ content: note.trim() }) });
      setNotes((current) => [created, ...current]);
      setNote("");
      setSuccess("Customer note added.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to add note.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("customer.view")) return <div className="mx-auto max-w-4xl px-5 py-12 text-amber-800">You do not have permission to view this customer.</div>;
  if (loading && !customer) return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Loading Customer 360…</div>;
  if (!customer) return <div className="mx-auto max-w-4xl px-5 py-12 text-red-700">{error || "Customer not found."}</div>;

  const editValue: CustomerInput = {
    firstName: customer.firstName, lastName: customer.lastName,
    email: customer.email ?? "", phone: customer.phone ?? "", secondaryPhone: customer.secondaryPhone ?? "",
    dateOfBirth: customer.dateOfBirth?.slice(0, 10) ?? "", nationality: customer.nationality ?? "",
    customerType: customer.customerType, isActive: customer.isActive,
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link href="/customers" className="text-sm font-semibold text-cyan-700">← Customers</Link>
      <header className="mt-5 flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white sm:p-8 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Customer profile</p><h1 className="mt-3 text-3xl font-semibold">{customer.firstName} {customer.lastName}</h1><p className="mt-2 font-mono text-xs text-slate-300">{customer.id}</p></div>
        <div className="flex flex-wrap gap-2">
          {hasPermission("lead.create") && <Link href={`/leads/new?customerId=${customer.id}`} className="rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500">Create Lead</Link>}
          {hasPermission("customer.edit") && <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">{editing ? "Cancel edit" : "Edit Customer"}</button>}
        </div>
      </header>

      {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      {editing ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="mb-5 text-lg font-semibold">Edit customer information</h2><CustomerForm key={customer.updatedAt} initialValue={editValue} submitting={saving} submitLabel="Save Changes" showStatus canEditPrimaryContact={hasPermission("customer.primary_contact.edit")} onSubmit={updateCustomer} /></section>
      ) : (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="text-lg font-semibold">Customer overview</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Primary phone", customer.phone ?? "—"], ["Primary email", customer.email ?? "—"], ["Additional phone", customer.secondaryPhone ?? "—"], ["Classification", customerTypeLabel[customer.customerType]],
          ["Nationality", customer.nationality ?? "—"], ["Date of birth", date(customer.dateOfBirth)], ["Created", date(customer.createdAt)], ["Last activity", dateTimeFormatter.format(new Date(customer.summary.lastActivityAt))],
        ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd></div>)}</dl></section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
        ["Total inquiries", customer.summary.totalLeads], ["Completed sales", customer.summary.totalCompletedSales], ["Total bookings", customer.summary.totalBookings],
        ["Latest inquiry", date(customer.summary.latestInquiryAt)], ["Latest booking", date(customer.summary.latestBookingAt)],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-950">{value}</p></div>)}</section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Inquiry history</h2><span className="text-xs text-slate-500">{customer.leadPagination.total} authorized inquiries</span></div>
        {customer.leads.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No authorized inquiry history available.</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{["Lead", "Received", "Destination", "Travel dates", "Marketing medium", "Sales advisor", "Status", "Last activity", "Action"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{customer.leads.map((lead) => <tr key={lead.id}><td className="px-3 py-4 font-mono text-xs">{lead.id}</td><td className="whitespace-nowrap px-3 py-4">{date(lead.receivedAt ?? lead.createdAt)}</td><td className="px-3 py-4">{lead.destination ?? "—"}</td><td className="whitespace-nowrap px-3 py-4">{date(lead.travelDate)}{lead.travelEndDate ? ` – ${date(lead.travelEndDate)}` : ""}</td><td className="px-3 py-4">{lead.source ?? "—"}</td><td className="px-3 py-4">{person(lead.assignedUser)}</td><td className="px-3 py-4"><span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">{lead.status.replaceAll("_", " ")}</span></td><td className="whitespace-nowrap px-3 py-4">{dateTimeFormatter.format(new Date(lead.lastMeaningfulActivityAt ?? lead.updatedAt))}</td><td className="px-3 py-4"><Link href={`/leads/${lead.id}`} className="font-semibold text-cyan-700">Open Lead</Link></td></tr>)}</tbody></table></div>}
        <Pager pagination={customer.leadPagination} onChange={setLeadPage} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Booking history</h2><span className="text-xs text-slate-500">{customer.bookingPagination.total} authorized bookings</span></div>
        {customer.bookings.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No authorized booking history available.</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{["Folder", "Destination", "Travel dates", "Booking date", "Sales advisor", "Operations", "Travel", "References", "Action"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{customer.bookings.map((booking) => <tr key={booking.id}><td className="whitespace-nowrap px-3 py-4 font-semibold">{booking.folderNumber}</td><td className="px-3 py-4">{booking.destination}</td><td className="whitespace-nowrap px-3 py-4">{date(booking.travelStartDate)}{booking.travelEndDate ? ` – ${date(booking.travelEndDate)}` : ""}</td><td className="whitespace-nowrap px-3 py-4">{date(booking.createdAt)}</td><td className="px-3 py-4">{person(booking.salesAdvisor)}</td><td className="px-3 py-4">{booking.operationsStatus.replaceAll("_", " ")}</td><td className="px-3 py-4">{booking.travelStatus.replaceAll("_", " ")}</td><td className="px-3 py-4">{booking.references.length ? booking.references.map((reference) => `${reference.type}: ${reference.reference}`).join(", ") : "—"}</td><td className="px-3 py-4"><Link href={`/bookings/${booking.id}`} className="font-semibold text-cyan-700">View</Link></td></tr>)}</tbody></table></div>}
        <Pager pagination={customer.bookingPagination} onChange={setBookingPage} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Customer notes</h2><span className="text-xs text-slate-500">{notes.length} notes</span></div>
        {hasPermission("customer.note.create") && <form onSubmit={addNote} className="mt-5"><textarea required maxLength={5000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a permanent customer note…" className="w-full rounded-xl border border-slate-300 p-3 text-sm" /><button type="submit" disabled={saving || !note.trim()} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Add Note"}</button></form>}
        <div className="mt-6 space-y-3">{notes.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No customer notes yet.</p>}{notes.map((customerNote) => <article key={customerNote.id} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-2 text-xs text-slate-500"><strong className="text-slate-700">{person(customerNote.createdBy)}</strong><time>{dateTimeFormatter.format(new Date(customerNote.createdAt))}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{customerNote.content}</p></article>)}</div>
      </section>
    </main>
  );
}
