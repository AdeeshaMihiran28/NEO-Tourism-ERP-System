"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { DealList, DealSummary } from "@/types/marketing";

export function MarketingDealsWorkspace() {
  const [result, setResult] = useState<DealList | null>(null);
  const [summary, setSummary] = useState<DealSummary | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [destination, setDestination] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: "1", limit: "20" });
      if (search) query.set("search", search);
      if (status) query.set("status", status);
      if (destination) query.set("destination", destination);
      if (expiryTo) query.set("expiryTo", `${expiryTo}T23:59:59.999Z`);
      const [deals, counts] = await Promise.all([
        apiFetch<DealList>(`/marketing/deals?${query}`),
        apiFetch<DealSummary>("/marketing/deals/summary"),
      ]);
      setResult(deals);
      setSummary(counts);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load deals.");
    }
  }, [destination, expiryTo, search, status]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const cards = summary
    ? [
        ["Live", summary.live],
        ["Scheduled", summary.scheduled],
        ["Expiring", summary.expiring],
        ["Expired", summary.expired],
        ["Suspended", summary.suspended],
        ["Pending approval", summary.pendingApproval],
      ]
    : [];
  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-[.2em] text-fuchsia-700">NEO LAUNCH</p><h1 className="mt-1 text-3xl font-semibold">Live Deals &amp; Offers</h1><p className="mt-2 text-sm text-slate-600">Create once, approve once, publish everywhere, track the outcome.</p></div>
        <Link href="/marketing/deals/new" className="rounded-xl bg-fuchsia-700 px-5 py-3 text-sm font-semibold text-white">Create deal</Link>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
      <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border bg-white p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search deal or code" className="min-w-56 flex-1 rounded-xl border px-4 py-2"/><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Destination" className="rounded-xl border px-4 py-2"/><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border px-4 py-2"><option value="">All statuses</option>{["DRAFT", "SCHEDULED", "LIVE", "EXPIRING", "EXPIRED", "SUSPENDED"].map((value) => <option key={value}>{value}</option>)}</select><label className="flex items-center gap-2 text-sm text-slate-600">Expires by<input type="date" value={expiryTo} onChange={(event) => setExpiryTo(event.target.value)} className="rounded-xl border px-3 py-2"/></label></div>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      <div className="mt-5 overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Deal", "Destination", "Price", "Travel period", "Expiry", "Approval", "Status", "Channels", "Owner", "Action"].map((value) => <th className="px-4 py-3" key={value}>{value}</th>)}</tr></thead><tbody>{result?.data.map((deal) => <tr key={deal.id} className="border-t"><td className="px-4 py-3"><strong>{deal.title}</strong><p className="text-xs text-slate-500">{deal.dealCode}</p></td><td>{deal.destination}</td><td>{deal.currency} {deal.price}</td><td>{date(deal.travelStartDate)} – {date(deal.travelEndDate)}</td><td>{dateTime(deal.expiryAt)}</td><td><Badge value={deal.approvalStatus}/></td><td><Badge value={deal.status}/></td><td>{deal.channels?.filter((item) => item.status !== "NOT_PUBLISHED").length ?? 0}</td><td>{deal.createdBy ? `${deal.createdBy.firstName} ${deal.createdBy.lastName}` : "—"}</td><td><Link className="font-semibold text-fuchsia-700" href={`/marketing/deals/${deal.id}`}>Open</Link></td></tr>)}</tbody></table>{result && !result.data.length && <p className="p-10 text-center text-slate-500">No deals match these filters.</p>}</div>
    </main>
  );
}

export function CreateDealForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const deal = await apiFetch<{ id: string }>("/marketing/deals", { method: "POST", body: JSON.stringify({ ...body, price: Number(body.price) }) });
      router.push(`/marketing/deals/${deal.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create deal.");
      setSaving(false);
    }
  }
  return <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8"><p className="text-sm font-bold uppercase tracking-[.2em] text-fuchsia-700">NEO LAUNCH</p><h1 className="mt-1 text-3xl font-semibold">Create Deal Card</h1><form onSubmit={submit} className="mt-7 space-y-6 rounded-2xl border bg-white p-6"><Section title="Offer"><Field name="title" label="Title"/><div className="grid gap-4 sm:grid-cols-2"><Field name="destination" label="Destination"/><Field name="departureLocation" label="Departure"/></div><Field name="shortDescription" label="Short description" required={false}/></Section><Section title="Travel"><div className="grid gap-4 sm:grid-cols-2"><Field name="travelStartDate" label="Travel start" type="date"/><Field name="travelEndDate" label="Travel end" type="date"/></div><Field name="baggage" label="Baggage" required={false}/></Section><Section title="Price"><div className="grid gap-4 sm:grid-cols-2"><Field name="price" label="Price" type="number" step="0.01"/><Field name="currency" label="Currency" defaultValue="GBP" maxLength={3}/></div></Section><Section title="Control"><Field name="expiryAt" label="Expiry" type="datetime-local"/><label className="block text-sm font-medium">Key terms<textarea required name="keyTerms" rows={5} className="mt-1 w-full rounded-xl border px-4 py-3"/></label></Section>{error && <p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<div className="flex justify-end gap-3"><Link href="/marketing/deals" className="rounded-xl border px-5 py-3">Cancel</Link><button disabled={saving} className="rounded-xl bg-fuchsia-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button></div></form></main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="space-y-4"><legend className="mb-3 text-xs font-bold uppercase tracking-wider text-fuchsia-700">{title}</legend>{children}</fieldset>; }
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="block text-sm font-medium">{label}<input required={props.required ?? true} {...props} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>; }
export function Badge({ value }: { value: string }) { const active = value === "LIVE" || value === "APPROVED"; const warn = value === "EXPIRING" || value === "PENDING_APPROVAL"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-800" : warn ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{value.replaceAll("_", " ")}</span>; }
export function date(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
export function dateTime(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
