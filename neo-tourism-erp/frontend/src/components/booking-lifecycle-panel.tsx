"use client";
import { useAuth } from "./auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { BookingDetail } from "@/types/booking";
import { useState } from "react";

export function BookingLifecyclePanel({
  booking,
  onChanged,
}: {
  booking: BookingDetail;
  onChanged: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const checks = [
    [
      "Travel",
      booking.travelStatus,
      booking.travelStatus === "TRAVEL_COMPLETE",
    ],
    [
      "Operations",
      booking.operationsStatus,
      booking.operationsStatus === "COMPLETE",
    ],
    [
      "Accounts",
      booking.accountsStatus,
      booking.accountsStatus === "RECONCILED",
    ],
    ["Folder", booking.folderStatus, booking.folderStatus === "CLOSED"],
  ] as const;
  async function action(path: string, body?: unknown) {
    setSaving(true);
    setError("");
    try {
      await apiFetch(path, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to update lifecycle.",
      );
    } finally {
      setSaving(false);
    }
  }
  const canClose = checks.slice(0, 3).every(([, , complete]) => complete);
  return (
    <section
      className={`mt-6 rounded-2xl border p-6 shadow-sm ${booking.folderStatus === "CLOSED" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Booking Lifecycle
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {booking.folderStatus === "CLOSED"
              ? "FOLDER CLOSED"
              : "Folder Open"}
          </h2>
          {booking.folderStatus === "CLOSED" && (
            <p className="mt-1 text-sm text-emerald-800">
              This folder has completed Travel, Operations and Accounts
              reconciliation.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission("booking.operations.complete") &&
            booking.operationsStatus !== "COMPLETE" &&
            booking.folderStatus !== "CLOSED" && (
              <button
                disabled={saving}
                onClick={() =>
                  void action(`/bookings/${booking.id}/operations/complete`)
                }
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Complete Operations
              </button>
            )}
          {hasPermission("booking.lifecycle.manage") && (
            <button
              disabled={saving}
              onClick={() =>
                void action(`/bookings/${booking.id}/lifecycle/re-evaluate`)
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold"
            >
              Re-evaluate
            </button>
          )}
          {hasPermission("booking.reopen") &&
            booking.folderStatus === "CLOSED" && (
              <button
                disabled={saving}
                onClick={() => {
                  const reason = window.prompt(
                    "Reason for reopening this folder",
                  );
                  if (reason?.trim())
                    void action(`/bookings/${booking.id}/reopen`, {
                      reason: reason.trim(),
                    });
                }}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Reopen Folder
              </button>
            )}
        </div>
      </div>
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {checks.map(([label, status, complete]) => (
          <div
            key={label}
            className="rounded-xl bg-white/80 p-4 ring-1 ring-slate-200"
          >
            <p className="text-xs font-semibold uppercase text-slate-500">
              {label}
            </p>
            <p
              className={`mt-2 text-sm font-bold ${complete ? "text-emerald-700" : "text-amber-700"}`}
            >
              {status.replaceAll("_", " ")} {complete ? "✓" : "⚠"}
            </p>
          </div>
        ))}
      </div>
      {booking.folderStatus === "OPEN" && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="font-semibold">
            {canClose
              ? "Folder is eligible to close."
              : "Folder cannot close yet."}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {checks.slice(0, 3).map(([label, status, complete]) => (
              <li
                key={label}
                className={complete ? "text-emerald-700" : "text-amber-700"}
              >
                {complete ? "✓" : "✕"} {label}: {status.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
          {booking.folderReopenReason && (
            <p className="mt-3 text-sm text-amber-800">
              Reopened: {booking.folderReopenReason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
