"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CustomerForm } from "@/components/customer-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import { customerTypeLabel, type CustomerInput, type CustomerListItem, type CustomerListResponse, type DuplicateCustomer } from "@/types/customer";

type SelectedCustomer = Pick<CustomerListItem, "id" | "firstName" | "lastName" | "email" | "phone" | "customerType">;

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function NewLeadPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selected, setSelected] = useState<SelectedCustomer | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCustomer[]>([]);
  const [pendingCustomer, setPendingCustomer] = useState<CustomerInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lead, setLead] = useState({
    receivedAt: localDateTime(),
    destination: "",
    travelDate: "",
    travelEndDate: "",
    source: "",
    summary: "",
  });

  useEffect(() => {
    const customerId = new URLSearchParams(window.location.search).get("customerId");
    if (!customerId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(customerId)) return;
    apiFetch<SelectedCustomer>(`/customers/${customerId}`)
      .then(setSelected)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Unable to load the selected customer."));
  }, []);

  async function findCustomers(event: FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<CustomerListResponse>(
        `/customers?search=${encodeURIComponent(search.trim())}&limit=10`,
      );
      setCustomers(result.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to search customers.");
    } finally {
      setSaving(false);
    }
  }

  async function createCustomer(input: CustomerInput, confirmDuplicate = false) {
    setSaving(true);
    setError("");
    try {
      const payload = { ...input, confirmDuplicate };
      delete payload.isActive;
      const customer = await apiFetch<CustomerListItem>("/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSelected(customer);
      setShowNew(false);
      setDuplicates([]);
      setPendingCustomer(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        const data = caught.data as { code?: string; possibleDuplicates?: DuplicateCustomer[] };
        if (data.code === "POSSIBLE_DUPLICATE" && data.possibleDuplicates) {
          setPendingCustomer(input);
          setDuplicates(data.possibleDuplicates);
          return;
        }
      }
      setError(caught instanceof ApiError ? caught.message : "Unable to create customer.");
    } finally {
      setSaving(false);
    }
  }

  async function createLead(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<{ id: string }>("/leads", {
        method: "POST",
        body: JSON.stringify({
          customerId: selected.id,
          receivedAt: new Date(lead.receivedAt).toISOString(),
          source: lead.source.trim() || undefined,
          destination: lead.destination.trim() || undefined,
          travelDate: lead.travelDate || undefined,
          travelEndDate: lead.travelEndDate || undefined,
          summary: lead.summary.trim() || undefined,
        }),
      });
      router.push(`/leads/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create lead.");
      setSaving(false);
    }
  }

  if (!hasPermission("lead.create")) {
    return <div className="p-12 text-amber-800">You do not have permission to create leads.</div>;
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/sales" className="text-sm font-semibold text-cyan-700">← Sales CRM</Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-950">Create Lead</h1>
      <p className="mt-2 text-sm text-slate-600">Use an existing Customer 360 record or create one after checking for duplicates.</p>
      {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!selected && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">1. Select customer</h2>
          <form onSubmit={findCustomers} className="mt-4 flex gap-3">
            <input required value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or phone" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5" />
            <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Search</button>
          </form>
          <div className="mt-4 space-y-2">
            {customers.map((customer) => (
              <button key={customer.id} type="button" onClick={() => setSelected(customer)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-cyan-400">
                <span className="font-semibold">{customer.firstName} {customer.lastName}</span>
                <span className="text-sm text-slate-500">{customerTypeLabel[customer.customerType]} · {customer.email ?? "No email"} · {customer.phone ?? "No phone"}</span>
              </button>
            ))}
          </div>
          {hasPermission("customer.create") && <button type="button" onClick={() => setShowNew((value) => !value)} className="mt-5 text-sm font-semibold text-cyan-700">{showNew ? "Cancel new customer" : "Create new customer"}</button>}
          {showNew && <div className="mt-5 border-t border-slate-200 pt-5"><CustomerForm submitting={saving} submitLabel="Create and select customer" onSubmit={createCustomer} /></div>}
          {duplicates.length > 0 && pendingCustomer && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-semibold text-amber-950">Possible duplicate customer</p>
              {duplicates.map((customer) => <button key={customer.id} type="button" onClick={() => setSelected(customer)} className="mt-2 block w-full rounded-lg bg-white p-3 text-left text-sm">Use {customer.firstName} {customer.lastName} — {customer.email ?? customer.phone ?? "No contact"}</button>)}
              <button type="button" disabled={saving} onClick={() => void createCustomer(pendingCustomer, true)} className="mt-3 text-sm font-semibold text-amber-800">Create anyway</button>
            </div>
          )}
        </section>
      )}

      {selected && (
        <form onSubmit={createLead} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-950">2. Inquiry details</h2><p className="mt-1 text-sm text-slate-600">{selected.firstName} {selected.lastName} · {customerTypeLabel[selected.customerType]} · {selected.email ?? "No email"} · {selected.phone ?? "No phone"}</p></div><button type="button" onClick={() => setSelected(null)} className="text-sm font-semibold text-cyan-700">Change customer</button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Received date and time<input required type="datetime-local" value={lead.receivedAt} onChange={(event) => setLead({ ...lead, receivedAt: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium">Marketing Medium<input list="lead-mediums" maxLength={100} value={lead.source} onChange={(event) => setLead({ ...lead, source: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /><datalist id="lead-mediums"><option value="Website"/><option value="Facebook"/><option value="Telephone Call"/><option value="Direct Inquiry"/><option value="Other"/></datalist></label>
            <label className="text-sm font-medium">Requested destination<input maxLength={150} value={lead.destination} onChange={(event) => setLead({ ...lead, destination: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <div className="hidden sm:block" />
            <label className="text-sm font-medium">Travel start date<input type="date" value={lead.travelDate} onChange={(event) => setLead({ ...lead, travelDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium">Travel end date<input type="date" min={lead.travelDate || undefined} value={lead.travelEndDate} onChange={(event) => setLead({ ...lead, travelEndDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium sm:col-span-2">Additional inquiry notes<textarea rows={4} maxLength={2000} value={lead.summary} onChange={(event) => setLead({ ...lead, summary: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3" /></label>
          </div>
          <button disabled={saving} className="mt-5 rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Creating…" : "Create unassigned lead"}</button>
        </form>
      )}
    </main>
  );
}
