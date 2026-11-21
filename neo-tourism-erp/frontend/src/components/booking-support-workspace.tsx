"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ApiError, apiDownload, apiFetch } from "@/lib/api/client";
import type {
  BookingChecklistState,
  BookingDetail,
  BookingDocument,
  BookingSpecialRequestStatus,
  BookingSpecialRequestType,
} from "@/types/booking";

type UserOption = {
  id: string;
  firstName: string;
  lastName: string;
};

const input = "rounded-xl border border-slate-300 px-3 py-2.5 text-sm";
const checklist = [
  ["PAX_NAMES", "Pax Names"],
  ["FLIGHT_DETAILS", "Flight Details"],
  ["CANCELLATION_COST", "Cancellation Cost"],
  ["BAGGAGE_ALLOWANCE", "Baggage Allowance"],
  ["SPECIAL_REQUESTS_FLIGHT", "Special Requests – F"],
  ["HOTELS", "Hotels"],
  ["SPECIAL_REQUESTS_HOTEL", "Special Requests – H"],
  ["TRANSFERS", "Transfers"],
  ["TOURS", "Tours"],
  ["SNIPS", "Snips"],
  ["CALCULATIONS", "Calculations"],
] as const;
const requestTypes: BookingSpecialRequestType[] = [
  "FLIGHT",
  "HOTEL",
  "SPECIAL_ASSISTANCE",
  "DIETARY",
  "BAGGAGE",
  "TRANSFER",
  "OTHER",
];
const documentTypes = [
  "BOOKING_CONFIRMATION",
  "E_TICKET",
  "PASSENGER_DOCUMENT",
  "ITINERARY",
  "HOTEL_VOUCHER",
  "TRANSFER_VOUCHER",
  "TOUR_CONFIRMATION",
  "SUPPLIER_CONFIRMATION",
  "SCREENSHOT_SNIP",
  "AMENDMENT_CANCELLATION",
  "TICKET",
  "INVOICE",
  "PAYMENT_EVIDENCE",
  "VOUCHER",
  "OTHER",
];

export function BookingSupportWorkspace({
  booking,
  users,
  onChanged,
}: {
  booking: BookingDetail;
  users: UserOption[];
  onChanged: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const editable =
    booking.folderStatus !== "CLOSED" || hasPermission("booking.closed.edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState({
    type: "FLIGHT" as BookingSpecialRequestType,
    details: "",
    passengerId: "",
    bookingSupplierId: "",
    responsibleUserId: "",
    notes: "",
  });
  const [document, setDocument] = useState({
    category: "BOOKING_CONFIRMATION",
    passengerId: "",
    bookingSupplierId: "",
    notes: "",
    file: null as File | null,
  });
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>(
    {},
  );
  const checklistByType = useMemo(
    () => new Map(booking.checklistItems.map((item) => [item.itemType, item])),
    [booking.checklistItems],
  );
  const complete = checklist.filter(
    ([type]) => (checklistByType.get(type)?.state ?? "PENDING") !== "PENDING",
  ).length;

  async function jsonAction(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    setSaving(true);
    setError("");
    try {
      await apiFetch(path, {
        method,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      setMessage("Saved successfully.");
      await onChanged();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function upload(path: string, values: typeof document) {
    if (!values.file) return;
    const body = new FormData();
    body.set("file", values.file);
    body.set("category", values.category);
    if (values.passengerId) body.set("passengerId", values.passengerId);
    if (values.bookingSupplierId)
      body.set("bookingSupplierId", values.bookingSupplierId);
    if (values.notes) body.set("notes", values.notes);
    setSaving(true);
    setError("");
    try {
      await apiFetch(path, { method: "POST", body });
      setMessage("Document uploaded securely.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  async function openDocument(item: BookingDocument, download = false) {
    try {
      const blob = await apiDownload(
        `/bookings/${booking.id}/documents/${item.id}/${download ? "download" : "preview"}`,
      );
      const url = URL.createObjectURL(blob);
      if (download) {
        const link = window.document.createElement("a");
        link.href = url;
        link.download = item.fileName;
        link.click();
      } else window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to open document.");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {(error || message) && (
        <p className={`rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Passenger & Product Special Requests</h2>
            <p className="text-sm text-slate-500">Requested arrangements remain separate from supplier confirmations.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            {booking.specialRequests.filter((item) => item.status === "REQUESTED").length} awaiting supplier confirmation
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {booking.specialRequests.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <b>{item.type.replaceAll("_", " ")}</b>
                <span className={item.status === "SUPPLIER_CONFIRMED" ? "text-emerald-700" : "text-amber-700"}>{item.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-1">{item.details}</p>
              <p className="mt-1 text-xs text-slate-500">
                {item.passenger ? `${item.passenger.firstName} ${item.passenger.lastName}` : item.bookingSupplier?.description ?? item.bookingSupplier?.serviceType ?? "Booking level"}
                {item.responsibleUser ? ` · Responsible: ${item.responsibleUser.firstName} ${item.responsibleUser.lastName}` : " · Unassigned"}
              </p>
              {item.notes && <p className="mt-2 text-slate-600">{item.notes}</p>}
              {item.status === "SUPPLIER_CONFIRMED" && item.confirmedBy && (
                <p className="mt-1 text-xs text-emerald-700">Confirmed by {item.confirmedBy.firstName} {item.confirmedBy.lastName} · {new Date(item.confirmedAt ?? item.createdAt).toLocaleString("en-GB")}</p>
              )}
              {hasPermission("booking.manage_passengers") && editable && (
                <select
                  disabled={saving}
                  value={item.status}
                  onChange={(event) => {
                    const status = event.target.value as BookingSpecialRequestStatus;
                    const notes = window.prompt("Status note (optional)") ?? undefined;
                    void jsonAction(`/bookings/${booking.id}/special-requests/${item.id}`, "PATCH", { status, notes });
                  }}
                  className={`${input} mt-3`}
                >
                  {(["REQUESTED", "SUPPLIER_CONFIRMED", "UNAVAILABLE", "CANCELLED"] as const).map((status) => <option key={status}>{status}</option>)}
                </select>
              )}
              {!!item.history.length && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">History ({item.history.length})</summary>
                  {item.history.map((history) => <p key={history.id} className="mt-1">{history.previousStatus ?? "Created"} → {history.newStatus} · {history.changedBy.firstName} {history.changedBy.lastName} · {new Date(history.changedAt).toLocaleString("en-GB")}</p>)}
                </details>
              )}
            </article>
          ))}
          {!booking.specialRequests.length && <p className="text-sm text-slate-500">No special requests recorded.</p>}
        </div>
        {hasPermission("booking.manage_passengers") && editable && (
          <details className="mt-4 rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold text-cyan-700">Add Special Request</summary>
            <form onSubmit={async (event: FormEvent) => {
              event.preventDefault();
              const saved = await jsonAction(`/bookings/${booking.id}/special-requests`, "POST", {
                ...request,
                passengerId: request.passengerId || undefined,
                bookingSupplierId: request.bookingSupplierId || undefined,
                responsibleUserId: request.responsibleUserId || undefined,
                notes: request.notes || undefined,
              });
              if (saved) setRequest({ ...request, details: "", notes: "" });
            }} className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={request.type} onChange={(e) => setRequest({ ...request, type: e.target.value as BookingSpecialRequestType })} className={input}>{requestTypes.map((type) => <option key={type}>{type}</option>)}</select>
              <input required value={request.details} onChange={(e) => setRequest({ ...request, details: e.target.value })} placeholder="Request details" className={input} />
              <select value={request.passengerId} onChange={(e) => setRequest({ ...request, passengerId: e.target.value })} className={input}><option value="">Booking level / no passenger</option>{booking.passengers.map((passenger) => <option key={passenger.id} value={passenger.id}>{passenger.firstName} {passenger.lastName}</option>)}</select>
              <select value={request.bookingSupplierId} onChange={(e) => setRequest({ ...request, bookingSupplierId: e.target.value })} className={input}><option value="">No specific product</option>{booking.suppliers.map((product) => <option key={product.id} value={product.id}>{product.description ?? product.serviceType}</option>)}</select>
              <select value={request.responsibleUserId} onChange={(e) => setRequest({ ...request, responsibleUserId: e.target.value })} className={input}><option value="">Responsible employee</option>{users.map((option) => <option key={option.id} value={option.id}>{option.firstName} {option.lastName}</option>)}</select>
              <input value={request.notes} onChange={(e) => setRequest({ ...request, notes: e.target.value })} placeholder="Notes" className={input} />
              <button disabled={saving} className="rounded-xl bg-cyan-700 px-4 py-2.5 font-semibold text-white">Record Request</button>
            </form>
          </details>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Admin Verification Checklist</h2><p className="text-sm text-slate-500">{complete} of {checklist.length} applicable decisions recorded.</p></div>
          <span className="font-semibold text-violet-700">{Math.round((complete / checklist.length) * 100)}%</span>
        </div>
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border">
          {checklist.map(([type, label]) => {
            const item = checklistByType.get(type);
            const state = item?.state ?? "PENDING";
            return <div key={type} className="grid gap-2 p-3 md:grid-cols-[1fr_180px_1fr_auto] md:items-center">
              <span className="font-medium">{label}{item?.checkedBy && <small className="block font-normal text-slate-500">{item.checkedBy.firstName} {item.checkedBy.lastName} · {item.verifiedAt ? new Date(item.verifiedAt).toLocaleString("en-GB") : ""}</small>}</span>
              <select disabled={!hasPermission("booking.status.manage") || !editable || saving} value={state} onChange={(e) => void jsonAction(`/bookings/${booking.id}/checklist`, "POST", { itemType: type, state: e.target.value, notes: checklistNotes[type] || item?.verificationNotes || undefined })} className={input}>{(["PENDING", "CHECKED", "NOT_APPLICABLE"] as BookingChecklistState[]).map((value) => <option key={value}>{value}</option>)}</select>
              <input disabled={!hasPermission("booking.status.manage") || !editable} value={checklistNotes[type] ?? item?.verificationNotes ?? ""} onChange={(e) => setChecklistNotes({ ...checklistNotes, [type]: e.target.value })} placeholder="Verification notes" className={input} />
              <button type="button" disabled={!hasPermission("booking.status.manage") || !editable || saving} onClick={() => void jsonAction(`/bookings/${booking.id}/checklist`, "POST", { itemType: type, state, notes: checklistNotes[type] ?? item?.verificationNotes ?? undefined })} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white">Save</button>
              {!!item?.history.length && <details className="md:col-span-4 text-xs text-slate-500"><summary className="cursor-pointer">Verification history</summary>{item.history.map((history) => <p key={history.id}>{history.previousState ?? "PENDING"} → {history.newState} · {history.changedBy.firstName} {history.changedBy.lastName} · {new Date(history.changedAt).toLocaleString("en-GB")}</p>)}</details>}
            </div>;
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">Checklist completion does not automatically change Booking or Folder status.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-semibold">Booking Documents</h2><p className="text-sm text-slate-500">Private confirmations, tickets and supporting documents. Original Sales attachments remain in the Payment Card section.</p></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {booking.documents.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex justify-between gap-2"><b>{item.fileName}</b><span>v{item.revisionNumber}</span></div>
              <p className="mt-1 text-xs text-slate-500">{item.category.replaceAll("_", " ")} · {item.fileSize ? `${Math.ceil(item.fileSize / 1024)} KB` : "Legacy metadata"}</p>
              <p className="mt-1 text-xs text-slate-500">{item.passenger ? `${item.passenger.firstName} ${item.passenger.lastName}` : item.bookingSupplier?.description ?? item.bookingSupplier?.serviceType ?? "Booking level"} · {item.uploadedBy.firstName} {item.uploadedBy.lastName}</p>
              {item.notes && <p className="mt-2">{item.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                {item.fileSize && <><button onClick={() => void openDocument(item)} className="text-cyan-700">Preview</button><button onClick={() => void openDocument(item, true)} className="text-violet-700">Download</button></>}
                {hasPermission("booking.manage_documents") && editable && <>
                  <label className="cursor-pointer text-amber-700">Replace<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(`/bookings/${booking.id}/documents/${item.id}/revisions`, { category: item.category, passengerId: item.passengerId ?? "", bookingSupplierId: item.bookingSupplierId ?? "", notes: `Revision of ${item.fileName}`, file }); }} /></label>
                  <button onClick={() => { if (window.confirm("Remove this document from active records? The audit record is retained.")) void jsonAction(`/bookings/${booking.id}/documents/${item.id}`, "DELETE"); }} className="text-red-700">Remove</button>
                </>}
              </div>
            </article>
          ))}
        </div>
        {hasPermission("booking.manage_documents") && editable && (
          <form onSubmit={(event) => { event.preventDefault(); void upload(`/bookings/${booking.id}/document-files`, document); }} className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDocument({ ...document, file: e.target.files?.[0] ?? null })} className={input} />
            <select value={document.category} onChange={(e) => setDocument({ ...document, category: e.target.value })} className={input}>{documentTypes.map((type) => <option key={type}>{type}</option>)}</select>
            <select value={document.passengerId} onChange={(e) => setDocument({ ...document, passengerId: e.target.value })} className={input}><option value="">Booking level / no passenger</option>{booking.passengers.map((passenger) => <option key={passenger.id} value={passenger.id}>{passenger.firstName} {passenger.lastName}</option>)}</select>
            <select value={document.bookingSupplierId} onChange={(e) => setDocument({ ...document, bookingSupplierId: e.target.value })} className={input}><option value="">No specific product</option>{booking.suppliers.map((product) => <option key={product.id} value={product.id}>{product.description ?? product.serviceType}</option>)}</select>
            <input value={document.notes} onChange={(e) => setDocument({ ...document, notes: e.target.value })} placeholder="Document notes" className={input} />
            <button disabled={saving || !document.file} className="rounded-xl bg-violet-700 px-4 py-2.5 font-semibold text-white">Upload Securely</button>
          </form>
        )}
      </section>
    </div>
  );
}
