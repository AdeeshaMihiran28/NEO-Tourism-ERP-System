"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { CustomerForm } from "./customer-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import type {
  CustomerDetail,
  CustomerInput,
  CustomerNote,
} from "@/types/customer";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function CustomerProfile({ customerId }: { customerId: string }) {
  const { hasPermission } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchCustomer = useCallback(
    () =>
      Promise.all([
        apiFetch<CustomerDetail>(`/customers/${customerId}`),
        apiFetch<CustomerNote[]>(`/customers/${customerId}/notes`),
      ]),
    [customerId],
  );

  useEffect(() => {
    let active = true;
    if (!hasPermission("customer.view")) {
      Promise.resolve().then(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }

    fetchCustomer()
      .then(([details, customerNotes]) => {
        if (active) {
          setCustomer(details);
          setNotes(customerNotes);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Unable to load customer.",
          );
        }
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [fetchCustomer, hasPermission]);

  async function refreshCustomer() {
    const [details, customerNotes] = await fetchCustomer();
    setCustomer(details);
    setNotes(customerNotes);
  }

  async function updateCustomer(input: CustomerInput) {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/customers/${customerId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setEditing(false);
      setSuccess("Customer information updated.");
      await refreshCustomer();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to update customer.",
      );
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
      const created = await apiFetch<CustomerNote>(
        `/customers/${customerId}/notes`,
        { method: "POST", body: JSON.stringify({ content: note.trim() }) },
      );
      setNotes((current) => [created, ...current]);
      setNote("");
      setSuccess("Customer note added.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to add note.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("customer.view")) {
    return <div className="mx-auto max-w-4xl px-5 py-12 text-amber-800">You do not have permission to view this customer.</div>;
  }
  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Loading Customer 360…</div>;
  }
  if (!customer) {
    return <div className="mx-auto max-w-4xl px-5 py-12 text-red-700">{error || "Customer not found."}</div>;
  }

  const editValue: CustomerInput = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    secondaryPhone: customer.secondaryPhone ?? "",
    dateOfBirth: customer.dateOfBirth?.slice(0, 10) ?? "",
    nationality: customer.nationality ?? "",
    customerType: customer.customerType,
    isActive: customer.isActive,
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
      <Link href="/customers" className="text-sm font-semibold text-cyan-700">← Customers</Link>

      <header className="mt-5 flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white sm:p-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Customer 360</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{customer.firstName} {customer.lastName}</h1>
          <p className="mt-2 text-sm font-medium text-slate-300">{customer.customerType} PASSENGER · {customer.isActive ? "ACTIVE" : "INACTIVE"}</p>
        </div>
        {hasPermission("customer.edit") && (
          <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-100">
            {editing ? "Cancel edit" : "Edit Customer"}
          </button>
        )}
      </header>

      {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      {editing ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="mb-5 text-lg font-semibold text-slate-950">Edit customer information</h2>
          <CustomerForm key={customer.updatedAt} initialValue={editValue} submitting={saving} submitLabel="Save Changes" showStatus onSubmit={updateCustomer} />
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-semibold text-slate-950">Overview</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Phone", customer.phone ?? "—"],
              ["Email", customer.email ?? "—"],
              ["Nationality", customer.nationality ?? "—"],
              ["Date of birth", customer.dateOfBirth ? dateFormatter.format(new Date(customer.dateOfBirth)) : "—"],
              ["Secondary phone", customer.secondaryPhone ?? "—"],
              ["Total leads", String(customer.summary.totalLeads)],
              ["Total bookings", String(customer.summary.totalBookings)],
              ["Created", dateFormatter.format(new Date(customer.createdAt))],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Notes</h2>
          <span className="text-xs text-slate-500">{notes.length} notes</span>
        </div>
        {hasPermission("customer.note.create") && (
          <form onSubmit={addNote} className="mt-5">
            <textarea required maxLength={5000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal customer note…" className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" />
            <button type="submit" disabled={saving || !note.trim()} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Add Note"}</button>
          </form>
        )}
        <div className="mt-6 space-y-3">
          {notes.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No customer notes yet.</p>}
          {notes.map((customerNote) => (
            <article key={customerNote.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <p className="font-semibold text-slate-700">{customerNote.createdBy.firstName} {customerNote.createdBy.lastName}</p>
                <time>{dateTimeFormatter.format(new Date(customerNote.createdAt))}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{customerNote.content}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Activity / Timeline", "Bookings", "Leads", "Documents"].map((title) => (
          <div key={title} className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
            <h2 className="font-semibold text-slate-800">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">Coming in the next module</p>
          </div>
        ))}
      </section>
    </div>
  );
}
