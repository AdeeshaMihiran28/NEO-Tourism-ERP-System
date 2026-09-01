"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api/client";
import type { ContentOptions } from "@/types/marketing-content";

export function MarketingCampaignForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [options, setOptions] = useState<ContentOptions | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setOptions(await apiFetch<ContentOptions>("/marketing/content/options"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load campaign options.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = Object.fromEntries(Object.entries(raw).filter(([, value]) => String(value).trim()));
    try {
      const campaign = await apiFetch<{ id: string }>("/marketing/campaigns", { method: "POST", body: JSON.stringify({ ...payload, ownerUserId: user.id }) });
      router.push(`/marketing/campaigns/${campaign.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create campaign.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8"><p className="text-sm font-bold uppercase tracking-[.2em] text-violet-700">NEO FLOW</p><h1 className="mt-1 text-3xl font-semibold">Create Campaign</h1><p className="mt-2 text-sm text-slate-600">Create a lightweight campaign and optionally connect it to an existing Deal.</p><form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border bg-white p-6"><Field name="name" label="Campaign name"/><Field name="objective" label="Objective" required={false}/><label className="block text-sm font-medium">Description<textarea name="description" rows={4} className="mt-1 w-full rounded-xl border p-3"/></label><div className="grid gap-4 sm:grid-cols-2"><Field name="startDate" label="Start date" type="date" required={false}/><Field name="endDate" label="End date" type="date" required={false}/></div><label className="block text-sm font-medium">Linked Deal<select name="dealId" className="mt-1 w-full rounded-xl border p-3"><option value="">None</option>{options?.deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.dealCode} — {deal.title}</option>)}</select></label>{error && <p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Creating…" : "Create Campaign"}</button></form></main>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-sm font-medium">{label}<input required={props.required ?? true} {...props} className="mt-1 w-full rounded-xl border p-3"/></label>;
}
