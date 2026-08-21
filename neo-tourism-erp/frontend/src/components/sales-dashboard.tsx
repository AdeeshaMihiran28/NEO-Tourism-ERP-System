"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { LeadListResponse, LeadStatus } from "@/types/lead";

const ACTIVE_STATUSES: LeadStatus[] = [
  "HANDLING",
  "QUOTING",
  "FOLLOW_UP",
  "CALLBACK",
  "GOING_TO_BOOK",
];

export function SalesDashboard() {
  const [live, setLive] = useState(0);
  const [counts, setCounts] = useState<Record<LeadStatus, number>>(
    {} as Record<LeadStatus, number>,
  );

  useEffect(() => {
    Promise.all([
      apiFetch<LeadListResponse>("/leads/live?limit=1"),
      ...ACTIVE_STATUSES.map((status) =>
        apiFetch<LeadListResponse>(`/leads/my?status=${status}&limit=1`),
      ),
    ])
      .then(([liveResult, ...statusResults]) => {
        setLive(liveResult.pagination.total);
        setCounts(
          Object.fromEntries(
            ACTIVE_STATUSES.map((status, index) => [
              status,
              statusResults[index].pagination.total,
            ]),
          ) as Record<LeadStatus, number>,
        );
      })
      .catch(() => undefined);
  }, []);

  const cards = [
    { label: "Live New Leads", count: live, href: "/leads/live" },
    { label: "My Active Leads", count: ACTIVE_STATUSES.reduce((total, status) => total + (counts[status] ?? 0), 0), href: "/leads/pipeline" },
    { label: "My Quoting Leads", count: counts.QUOTING ?? 0, href: "/leads/pipeline" },
    { label: "My Follow-Ups", count: counts.FOLLOW_UP ?? 0, href: "/leads/pipeline" },
    { label: "Going to Book", count: counts.GOING_TO_BOOK ?? 0, href: "/leads/pipeline" },
  ];

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sales overview</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => <Link key={card.label} href={card.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300"><p className="text-sm text-slate-600">{card.label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{card.count}</p></Link>)}
      </div>
    </section>
  );
}
