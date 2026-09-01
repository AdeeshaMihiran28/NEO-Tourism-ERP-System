"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api/client";
import type { PerformanceRow, SignalResponse } from "@/types/marketing-signal";

export function MarketingSignalDashboard({ management = false }: { management?: boolean }) {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<SignalResponse | null>(null);
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [campaignId, setCampaignId] = useState("");
  const [campaignOptions, setCampaignOptions] = useState<PerformanceRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ dateFrom: `${from}T00:00:00.000Z`, dateTo: `${to}T23:59:59.999Z` });
      if (campaignId) query.set("campaignId", campaignId);
      const response = await apiFetch<SignalResponse>(`/marketing/signal${management ? "/management" : ""}?${query}`);
      setData(response);
      if (!campaignId) setCampaignOptions(response.campaigns);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load NEO SIGNAL.");
    }
  }, [campaignId, from, management, to]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return <main className="px-5 py-8 sm:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-[.22em] text-emerald-700">NEO SIGNAL</p><h1 className="mt-1 text-3xl font-semibold">What&apos;s Working?</h1><p className="mt-2 text-sm text-slate-600">Business outcomes from explicit Marketing attribution - not inferred correlation.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-slate-500">From<input aria-label="Performance date from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="block rounded-lg border p-2 text-sm text-slate-900" /></label>
        <label className="text-xs text-slate-500">To<input aria-label="Performance date to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="block rounded-lg border p-2 text-sm text-slate-900" /></label>
        <label className="text-xs text-slate-500">Campaign<select aria-label="Campaign filter" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="block min-w-48 rounded-lg border p-2 text-sm text-slate-900"><option value="">All campaigns</option>{campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        {!management && hasPermission("marketing.signal.management") && <Link href="/marketing/performance/management" className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Management detail</Link>}
      </div>
    </header>
    {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {data && <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card label="Most Enquiries" value={data.summary.mostEnquiries?.destination ?? "No data"} sub={data.summary.mostEnquiries ? `${data.summary.mostEnquiries._count?._all ?? data.summary.mostEnquiries.count ?? 0} CRM enquiries` : ""} />
        <Card label="Trending Destination" value={data.summary.trendingDestination?.destination ?? "No trend"} sub={data.summary.trendingDestination?.growthPercent != null ? `+${data.summary.trendingDestination.growthPercent}%` : ""} />
        <Card label="Best Campaign by Sales" value={data.summary.bestCampaignBySales?.name ?? "Not attributed"} sub={`${data.summary.bestCampaignBySales?.salesMade ?? 0} sales`} />
        <Card label="Best Content by Sales" value={data.summary.bestContentBySales?.title ?? "Not attributed"} sub={`${data.summary.bestContentBySales?.salesMade ?? 0} sales`} />
        <Card label="Highest Sales Contribution" value={money(data.summary.highestSalesContribution)} sub="Attributed selling value" />
      </section>
      <section className="mt-6 rounded-2xl border bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Attribution Coverage</h2><p className="text-sm text-slate-500">{data.dataQuality.attributedLeads} attributed · {data.dataQuality.unattributedLeads} unattributed · {data.dataQuality.totalLeads} total</p></div><b className="text-3xl text-emerald-700">{data.dataQuality.attributionCoveragePercent}%</b></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, data.dataQuality.attributionCoveragePercent)}%` }} /></div></section>
      <Funnel row={data.campaigns[0]} />
      <Table title="Campaign Performance" rows={data.campaigns} kind="Campaign" />
      <Table title="Content Performance" rows={data.content} kind="Content" />
      <Table title="Deal Performance" rows={data.deals} kind="Deal" />
      <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">Platform metrics: {data.externalEngagement.status.replaceAll("_", " ")}. Sales Contribution is selling value, never profit.</p>
      {management && data.management && <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Management Detail</h2><p className="mt-2 text-sm">Tracked publications: {data.management.trackedPublicationCount}</p><p className="text-sm text-slate-500">{data.management.comparisonNote}</p></section>}
    </>}
  </main>;
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-2 font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div>; }
function Funnel({ row }: { row: PerformanceRow | undefined }) { const stages = row ? [["Enquiries", row.enquiries], ["Quoting", row.quoting], ["Going to Book", row.goingToBook], ["Sale Made", row.salesMade], ["Bookings", row.bookings]] : []; return <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Conversion Funnel {row ? `· ${row.name ?? row.title}` : ""}</h2><div className="mt-4 flex flex-wrap items-center gap-2">{stages.length ? stages.map(([label, count], index) => <div className="contents" key={String(label)}><div className="min-w-28 rounded-xl bg-emerald-50 p-3 text-center"><p className="text-xs text-emerald-800">{label}</p><b className="text-2xl">{count}</b></div>{index < stages.length - 1 && <span>→</span>}</div>) : <p className="text-sm text-slate-500">No attributed funnel data in this period.</p>}</div></section>; }
function Table({ title, rows, kind }: { title: string; rows: PerformanceRow[]; kind: string }) { return <section className="mt-6 overflow-x-auto rounded-2xl border bg-white p-5"><h2 className="font-semibold">{title}</h2><table className="mt-3 w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-slate-500">{[kind, "Enquiries", "Quote Stage", "Going to Book", "Sales", "Bookings", "Conversion", "Sales Contribution"].map((heading) => <th className="p-3" key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-b" key={row.id}><td className="p-3 font-semibold">{row.name ?? row.title}<p className="text-xs font-normal text-slate-400">{row.campaignCode ?? row.contentCode ?? row.dealCode}{row.channel ? ` · ${row.channel}` : ""}</p></td><td className="p-3">{row.enquiries}</td><td className="p-3">{row.quoting}</td><td className="p-3">{row.goingToBook}</td><td className="p-3">{row.salesMade}</td><td className="p-3">{row.bookings}</td><td className="p-3">{row.rates.enquiryToSale}%</td><td className="p-3">{row.currency ?? ""} {row.salesContribution.toLocaleString()}</td></tr>)}</tbody></table>{!rows.length && <p className="mt-3 text-sm text-slate-500">No explicit attribution data for this selection.</p>}</section>; }
function money(row: PerformanceRow | null) { return row ? `${row.currency ?? ""} ${row.salesContribution.toLocaleString()}` : "No attributed sales"; }
function dateInput(date: Date) { return date.toISOString().slice(0, 10); }
