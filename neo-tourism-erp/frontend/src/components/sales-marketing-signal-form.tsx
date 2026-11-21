"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api/client";

const signalTypes = [
  "CUSTOMER_QUESTION",
  "CONTENT_REQUEST",
  "OFFER_REQUEST",
  "DESTINATION_INTEREST",
  "RECURRING_OBJECTION",
  "MARKETING_SUPPORT",
  "OTHER",
] as const;

export function SalesMarketingSignalForm() {
  const query = useSearchParams();
  const [leadId, setLeadId] = useState(() => query.get("leadId") ?? "");
  const [destination, setDestination] = useState(
    () => query.get("destination") ?? "",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiFetch("/marketing/sales-signals", {
        method: "POST",
        body: JSON.stringify({
          leadId: leadId || undefined,
          destination: destination || undefined,
          signalType: data.get("signalType"),
          title: data.get("title"),
          description: data.get("description"),
          priority: data.get("priority"),
        }),
      });
      form.reset();
      setLeadId("");
      setDestination("");
      setError("");
      setMessage("Marketing signal submitted successfully.");
    } catch (caught) {
      setMessage("");
      setError(
        caught instanceof Error ? caught.message : "Unable to submit signal.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-700">
        Sales to Marketing
      </p>
      <h1 className="mt-1 text-3xl font-semibold">Share a Marketing Signal</h1>
      <p className="mt-2 text-sm text-slate-600">
        Report recurring customer questions, destination interest, offer
        requests or Marketing support needs.
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-6 space-y-4 rounded-2xl border bg-white p-6"
      >
        <label className="block text-sm font-semibold">
          Signal type
          <select
            name="signalType"
            required
            className="mt-1 w-full rounded-lg border p-3"
          >
            {signalTypes.map((type) => (
              <option key={type}>{type.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Title
          <input
            name="title"
            required
            maxLength={180}
            placeholder="Customers asking about Dubai visa requirements"
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <label className="block text-sm font-semibold">
          Description
          <textarea
            name="description"
            required
            maxLength={3000}
            rows={5}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Destination
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>
          <label className="block text-sm font-semibold">
            Priority
            <select
              name="priority"
              className="mt-1 w-full rounded-lg border p-3"
            >
              <option>NORMAL</option>
              <option>HIGH</option>
              <option>URGENT</option>
              <option>LOW</option>
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Associated lead
          <input
            value={leadId}
            onChange={(event) => setLeadId(event.target.value)}
            placeholder="Lead ID (optional)"
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        {message && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button className="rounded-lg bg-cyan-700 px-5 py-3 font-semibold text-white">
          Submit to Marketing
        </button>
      </form>
    </main>
  );
}
