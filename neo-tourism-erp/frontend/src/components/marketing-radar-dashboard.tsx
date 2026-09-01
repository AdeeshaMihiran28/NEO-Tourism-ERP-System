"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api/client";
import type {
  Opportunity,
  OpportunitySuggestion,
  RadarResponse,
} from "@/types/marketing-signal";

export function MarketingRadarDashboard() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<RadarResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<RadarResponse>("/marketing/radar"));
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load NEO RADAR.",
      );
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function createOpportunity(suggestion: OpportunitySuggestion) {
    await run(`suggestion:${suggestion.sourceReferenceId}`, async () => {
      const payload = {
        sourceType: suggestion.sourceType,
        sourceReferenceId: suggestion.sourceReferenceId,
        title: suggestion.title,
        description: suggestion.description,
        destination: suggestion.destination,
        priority: suggestion.priority,
      };
      await apiFetch("/marketing/opportunities", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    });
  }

  async function changeStatus(id: string, status: string) {
    await run(`${id}:${status}`, async () => {
      await apiFetch(`/marketing/opportunities/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    });
  }

  async function action(id: string, actionName: string, body?: object) {
    await run(`${id}:${actionName}`, async () => {
      await apiFetch(`/marketing/opportunities/${id}/${actionName}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
    });
  }

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    try {
      await operation();
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Action failed.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="px-5 py-8 sm:px-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-[.22em] text-amber-700">
          NEO RADAR
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Sales &amp; Marketing Intelligence</h1>
        <p className="mt-2 text-sm text-slate-600">
          Deterministic opportunities from CRM trends, deal interest, and Sales
          signals. Suggestions are never actioned automatically.
        </p>
      </header>

      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

      {data && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Rising destinations" value={data.risingDestinations.length} />
            <Metric label="High-interest deals" value={data.highInterestDeals.length} />
            <Metric label="Open Sales signals" value={data.salesSignals.new} />
            <Metric label="Suggested opportunities" value={data.suggestedOpportunities.length} />
          </section>

          <section className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">Rising destination demand</h2>
            <p className="mt-1 text-xs text-slate-500">
              Current seven days compared with the previous seven days.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.risingDestinations.map((trend) => (
                <article key={trend.destination} className="rounded-xl bg-amber-50 p-4">
                  <p className="font-semibold">{trend.destination}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {trend.currentPeriodEnquiries} current / {trend.previousPeriodEnquiries} previous
                  </p>
                  <p className="mt-2 text-lg font-bold text-amber-800">
                    {trend.growthPercent === null ? "New demand" : `${trend.growthPercent}% growth`}
                  </p>
                </article>
              ))}
              {!data.risingDestinations.length && <Empty text="No rising destinations meet the trend rule." />}
            </div>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel title="Travel-period demand">
              {Object.entries(data.travelPeriodTrends).map(([label, count]) => (
                <div key={label} className="flex justify-between border-b py-2 text-sm">
                  <span>{humanize(label)}</span><b>{count}</b>
                </div>
              ))}
            </Panel>
            <Panel title="Sales intelligence">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Metric label="High priority" value={data.salesSignals.highPriority} />
                <Metric label="Content requests" value={data.salesSignals.contentRequests} />
                <Metric label="Offer requests" value={data.salesSignals.offerRequests} />
                <Metric label="Customer questions" value={data.salesSignals.customerQuestions} />
              </div>
            </Panel>
          </section>

          <section className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">High-interest offers</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="p-3">Deal</th><th className="p-3">Current 7 days</th><th className="p-3">Previous 7 days</th><th className="p-3">Growth</th></tr></thead>
                <tbody>{data.highInterestDeals.map((deal) => <tr key={deal.id} className="border-b"><td className="p-3 font-semibold">{deal.title}<p className="text-xs font-normal text-slate-400">{deal.dealCode}</p></td><td className="p-3">{deal.current}</td><td className="p-3">{deal.previous}</td><td className="p-3">{deal.growthPercent}%</td></tr>)}</tbody>
              </table>
              {!data.highInterestDeals.length && <Empty text="No explicitly attributed Deal interest is available yet." />}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">Opportunity suggestions</h2>
            <p className="mt-1 text-xs text-slate-500">
              Rule: at least {data.opportunityThresholds.minimumEnquiries} enquiries and {data.opportunityThresholds.minimumGrowthPercent}% growth.
            </p>
            <div className="mt-4 space-y-3">
              {data.suggestedOpportunities.map((suggestion) => (
                <article key={suggestion.sourceReferenceId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
                  <div><p className="font-semibold">{suggestion.title}</p><p className="mt-1 text-sm text-slate-600">{suggestion.description}</p></div>
                  {hasPermission("marketing.opportunity.create") && <button type="button" disabled={busy !== ""} onClick={() => void createOpportunity(suggestion)} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create opportunity</button>}
                </article>
              ))}
              {!data.suggestedOpportunities.length && <Empty text="No deterministic opportunity currently meets the configured threshold." />}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">Opportunity workspace</h2>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {data.opportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} busy={busy} canManage={hasPermission("marketing.opportunity.manage")} canCreateContent={hasPermission("marketing.content.create")} canLinkDeal={hasPermission("marketing.deal.view")} deals={data.dealOptions} onStatus={changeStatus} onAction={action} />)}
              {!data.opportunities.length && <Empty text="No opportunities have been created yet." />}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function OpportunityCard({ opportunity, busy, canManage, canCreateContent, canLinkDeal, deals, onStatus, onAction }: { opportunity: Opportunity; busy: string; canManage: boolean; canCreateContent: boolean; canLinkDeal: boolean; deals: RadarResponse["dealOptions"]; onStatus: (id: string, status: string) => Promise<void>; onAction: (id: string, actionName: string, body?: object) => Promise<void> }) {
  const [selectedDealId, setSelectedDealId] = useState(deals[0]?.id ?? "");
  const selectedDeal = deals.find((deal) => deal.id === selectedDealId);
  return <article className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{opportunity.title}</p><p className="mt-1 text-sm text-slate-600">{opportunity.description}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{opportunity.status}</span></div>{opportunity.destination && <p className="mt-3 text-xs font-semibold uppercase text-amber-700">{opportunity.destination}</p>}<p className="mt-3 text-xs text-slate-500">Campaign: {opportunity.campaign?.name ?? "None"} · Content: {opportunity.content?.title ?? "None"} · Deal: {opportunity.deal?.title ?? "None"}</p>{canManage && opportunity.status !== "DISMISSED" && <div className="mt-4 flex flex-wrap gap-2">{opportunity.status === "NEW" && <Action label="Review" disabled={busy !== ""} onClick={() => void onStatus(opportunity.id, "REVIEWING")} />}{opportunity.status === "REVIEWING" && <Action label="Accept" disabled={busy !== ""} onClick={() => void onStatus(opportunity.id, "ACCEPTED")} />}{canCreateContent && <Action label="Create content" disabled={busy !== ""} onClick={() => void onAction(opportunity.id, "create-content")} />}{canCreateContent && <Action label="Create campaign" disabled={busy !== ""} onClick={() => void onAction(opportunity.id, "create-campaign")} />}{canLinkDeal && deals.length > 0 && <select aria-label="Deal to link" value={selectedDealId} onChange={(event) => setSelectedDealId(event.target.value)} className="rounded-lg border px-2 text-xs">{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.dealCode} · {deal.title}</option>)}</select>}{canLinkDeal && selectedDeal && <Action label={`Link ${selectedDeal.dealCode}`} disabled={busy !== ""} onClick={() => void onAction(opportunity.id, "link-deal", { dealId: selectedDeal.id })} />}<Action label="Dismiss" disabled={busy !== ""} onClick={() => void onStatus(opportunity.id, "DISMISSED")} /></div>}</article>;
}

function Action({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">{label}</button>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">{title}</h2><div className="mt-3">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="text-sm text-slate-500">{text}</p>; }
function humanize(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()); }
