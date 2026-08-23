"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface Summary {
  travelToday: number;
  travelComplete: number;
  operationsPending: number;
  openFolders: number;
  closedFolders: number;
  travelCompleteAccountsPending: number;
}
export function LifecycleDashboard() {
  const [data, setData] = useState<Summary>({
    travelToday: 0,
    travelComplete: 0,
    operationsPending: 0,
    openFolders: 0,
    closedFolders: 0,
    travelCompleteAccountsPending: 0,
  });
  useEffect(() => {
    void apiFetch<Summary>("/bookings/lifecycle-summary")
      .then(setData)
      .catch(() => undefined);
  }, []);
  const cards = [
    ["Travel Today", data.travelToday],
    ["Travel Complete", data.travelComplete],
    ["Operations Pending", data.operationsPending],
    ["Open Folders", data.openFolders],
    ["Closed Folders", data.closedFolders],
    ["Travel Complete / Accounts Pending", data.travelCompleteAccountsPending],
  ] as const;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        Booking lifecycle
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, count]) => (
          <Link
            key={label}
            href="/bookings"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-300"
          >
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{count}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
