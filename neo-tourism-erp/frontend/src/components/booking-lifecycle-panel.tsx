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
      "Finance",
      booking.accountsStatus,
      booking.accountsStatus === "RECONCILED",
    ],
    ["Folder", booking.folderStatus, booking.folderStatus === "CLOSED"],
  ] as const;
  const issues = booking.suppliers.flatMap((product) =>
    product.issues.map((issue) => ({ ...issue, product: product.description ?? product.serviceType })),
  );
  const openIssues = issues.filter((issue) => issue.status === "OPEN");
  const openSpecialRequests = booking.specialRequests.filter((request) =>
    ["REQUESTED", "UNAVAILABLE"].includes(request.status),
  );
  const milestones = [
    ["Supplier Pending", booking.operationsStatus === "SUPPLIER_PENDING" || openIssues.some((x) => ["SUPPLIER_PAYMENT_PENDING", "BOOKING_CONFIRMATION_PENDING"].includes(x.type))],
    ["Ticket Pending", booking.operationsStatus === "TICKETING_PENDING" || openIssues.some((x) => x.type === "TICKET_ISSUANCE_PENDING")],
    ["Attention Required", booking.operationsStatus === "ACTION_REQUIRED" || openIssues.length > 0 || openSpecialRequests.length > 0],
    ["Schedule Change", openIssues.some((x) => x.type === "SCHEDULE_CHANGE")],
    ["Schedule Change Complete", booking.suppliers.some((x) => x.status === "SCHEDULE_CHANGE_COMPLETE")],
    ["Travel Complete", booking.travelStatus === "TRAVEL_COMPLETE" || booking.suppliers.some((x) => x.status === "TRAVEL_COMPLETE")],
    ["Reconciled", booking.accountsStatus === "RECONCILED"],
    ["Travel Complete & Reconciled", booking.travelStatus === "TRAVEL_COMPLETE" && booking.accountsStatus === "RECONCILED"],
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
              This folder has completed Travel, Operations and Finance
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
                onClick={() => {
                  if (
                    window.confirm("Mark Operations complete for this folder?")
                  )
                    void action(`/bookings/${booking.id}/operations/complete`);
                }}
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
                    if (window.confirm("Reopen this closed folder?"))
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
      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Milestones & exceptions</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {milestones.filter(([, active]) => active).map(([label]) => (
            <span key={label} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{label}</span>
          ))}
          {!milestones.some(([, active]) => active) && <span className="text-sm text-slate-500">No active milestone or exception.</span>}
        </div>
      </div>
      {openIssues.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Outstanding actions ({openIssues.length})</p>
          <p className="mt-1 text-sm text-amber-800">Responsible: {booking.operationsOwner ? `${booking.operationsOwner.firstName} ${booking.operationsOwner.lastName}` : "Not assigned"}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {openIssues.map((issue) => <li key={issue.id}><b>{issue.product}:</b> {issue.reason}</li>)}
          </ul>
        </div>
      )}
      {openSpecialRequests.length > 0 && (
        <div className="mt-5 rounded-xl border border-cyan-300 bg-cyan-50 p-4">
          <p className="font-semibold text-cyan-900">
            Outstanding special requests ({openSpecialRequests.length})
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {openSpecialRequests.map((request) => (
              <li key={request.id}>
                <b>{request.type.replaceAll("_", " ")}:</b> {request.details}
              </li>
            ))}
          </ul>
        </div>
      )}
      {booking.activity.some((item) => item.action === "PRODUCT_STATUS_CHANGED") && (
        <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">Product status history</summary>
          <div className="mt-3 space-y-2 text-sm">
            {booking.activity.filter((item) => item.action === "PRODUCT_STATUS_CHANGED").map((item) => (
              <div key={item.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2">
                <span>{String(item.oldValues?.status ?? "Unknown").replaceAll("_", " ")} → {String(item.newValues?.status ?? "Unknown").replaceAll("_", " ")}</span>
                <span className="text-slate-500">{item.actor.firstName} {item.actor.lastName} · {new Date(item.createdAt).toLocaleString("en-GB")}</span>
                {typeof item.newValues?.notes === "string" && <span className="basis-full text-slate-600">{item.newValues.notes}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
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
