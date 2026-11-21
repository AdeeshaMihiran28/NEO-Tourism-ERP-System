"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api/client";
import type { FollowUpSummary, LeadListResponse, LeadStatus } from "@/types/lead";

const ACTIVE_STATUSES: LeadStatus[] = [
  "FOLLOW_UP",
  "GOING_TO_BOOK",
  "TRAVEL_IN_FUTURE",
];

export function SalesDashboard() {
  const { hasPermission } = useAuth();
  const [live, setLive] = useState(0);
  const [followUps, setFollowUps] = useState<FollowUpSummary>({
    callbacksToday: 0,
    missedCallbacks: 0,
    attentionLeads: 0,
    upcomingFollowUps: 0,
  });
  const [counts, setCounts] = useState<Record<LeadStatus, number>>(
    {} as Record<LeadStatus, number>,
  );

  useEffect(() => {
    Promise.all([
      apiFetch<LeadListResponse>("/leads/live?limit=1"),
      ...ACTIVE_STATUSES.map((status) =>
        apiFetch<LeadListResponse>(`/leads/my?status=${status}&limit=1`),
      ),
      hasPermission("followup.view")
        ? apiFetch<FollowUpSummary>("/follow-ups/summary")
        : Promise.resolve(null),
    ])
      .then(([liveResult, ...remaining]) => {
        const summary = remaining.pop() as FollowUpSummary | null;
        const statusResults = remaining as LeadListResponse[];
        setLive(liveResult.pagination.total);
        setCounts(
          Object.fromEntries(
            ACTIVE_STATUSES.map((status, index) => [
              status,
              statusResults[index].pagination.total,
            ]),
          ) as Record<LeadStatus, number>,
        );
        if (summary) setFollowUps(summary);
      })
      .catch(() => undefined);
  }, [hasPermission]);

  const cards = [
    { label: "Pending Leads", count: live, href: "/leads/live" },
    { label: "My Active Leads", count: ACTIVE_STATUSES.reduce((total, status) => total + (counts[status] ?? 0), 0), href: "/leads/pipeline" },
    { label: "My Follow-Ups", count: counts.FOLLOW_UP ?? 0, href: "/leads/pipeline" },
    { label: "Going to Book", count: counts.GOING_TO_BOOK ?? 0, href: "/leads/pipeline" },
    { label: "Future Bookings", count: counts.TRAVEL_IN_FUTURE ?? 0, href: "/leads/pipeline" },
    ...(hasPermission("followup.view")
      ? [
          { label: "Callbacks Today", count: followUps.callbacksToday, href: "/leads/pipeline" },
          { label: "Missed Callbacks", count: followUps.missedCallbacks, href: hasPermission("lead.attention.view") ? "/leads/attention" : "/leads/pipeline" },
          { label: "Upcoming Follow-Ups", count: followUps.upcomingFollowUps, href: "/leads/pipeline" },
        ]
      : []),
    ...(hasPermission("lead.attention.view")
      ? [{ label: "Attention Leads", count: followUps.attentionLeads, href: "/leads/attention" }]
      : []),
  ];

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sales overview</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => <Link key={card.label} href={card.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300"><p className="text-sm text-slate-600">{card.label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{card.count}</p></Link>)}
      </div>
    </section>
  );
}
