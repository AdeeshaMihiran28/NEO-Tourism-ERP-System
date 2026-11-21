"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiDownload, apiFetch } from "@/lib/api/client";
import type {
  BookingDetail,
  BookingProductIssueType,
  BookingProductStatus,
  BookingStatus,
  OperationsStatus,
  TravelStatus,
} from "@/types/booking";
import { BookingFinanceWorkspace } from "./booking-finance-workspace";
import { BookingLifecyclePanel } from "./booking-lifecycle-panel";
import { BookingSupportWorkspace } from "./booking-support-workspace";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}
interface SupplierOption {
  id: string;
  name: string;
  supplierType: string;
}
const bookingStatuses: BookingStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "READY",
  "COMPLETED",
  "CANCELLED",
];
const travelStatuses: TravelStatus[] = [
  "PENDING",
  "UPCOMING",
  "IN_TRAVEL",
  "TRAVEL_COMPLETE",
  "CANCELLED",
];
const operationsStatuses: OperationsStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "SUPPLIER_PENDING",
  "TICKETING_PENDING",
  "READY",
  "ACTION_REQUIRED",
];
const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm";

export function BookingWorkspace({ id }: { id: string }) {
  const { hasPermission } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [operationsOwnerId, setOperationsOwnerId] = useState("");
  const [passenger, setPassenger] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    nationality: "",
    passportNumber: "",
    passportExpiryDate: "",
    email: "",
    phone: "",
    isPrimaryPassenger: false,
    operationalNotes: "",
  });
  const [supplier, setSupplier] = useState({
    supplierId: "",
    name: "",
    supplierType: "AIRLINE",
    category: "INTERNATIONAL_FLIGHT",
    description: "",
    serviceStartDate: "",
    serviceEndDate: "",
    serviceType: "",
    supplierReference: "",
    estimatedSupplierCost: "",
    supplierCost: "",
    currency: "GBP",
    notes: "",
  });
  const [reference, setReference] = useState({
    type: "PNR",
    reference: "",
    bookingSupplierId: "",
  });
  const [note, setNote] = useState("");
  const [task, setTask] = useState({
    title: "",
    description: "",
    assignedUserId: "",
    dueAt: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<BookingDetail>(`/bookings/${id}`);
      setBooking(data);
      setOperationsOwnerId(data.operationsOwner?.id ?? "");
      setError("");
      setUsers(await apiFetch<UserOption[]>("/bookings/operations-users"));
      if (hasPermission("booking.manage_suppliers"))
        setSupplierOptions(
          await apiFetch<SupplierOption[]>("/bookings/suppliers"),
        );
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to load booking.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasPermission, id]);

  useEffect(() => {
    if (hasPermission("booking.view")) void Promise.resolve().then(load);
    else void Promise.resolve().then(() => setLoading(false));
  }, [hasPermission, load]);
  async function action(
    path: string,
    method: "POST" | "PATCH",
    body?: unknown,
    success = "Booking updated.",
  ) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(path, {
        method,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      setMessage(success);
      await load();
      return true;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to update booking.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function submit(
    event: FormEvent,
    path: string,
    body: unknown,
    success: string,
    reset: () => void,
  ) {
    event.preventDefault();
    if (await action(path, "POST", body, success)) reset();
  }
  async function viewSalesAttachment(productId: string, attachmentId: string) {
    try {
      const blob = await apiDownload(
        `/sale-submissions/${booking?.saleSubmissionId}/products/${productId}/attachments/${attachmentId}`,
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to open attachment.",
      );
    }
  }

  if (!hasPermission("booking.view"))
    return (
      <div className="p-12 text-amber-800">
        You do not have permission to view this booking.
      </div>
    );
  if (loading)
    return (
      <div className="p-12 text-center text-slate-500">Loading booking…</div>
    );
  if (!booking)
    return (
      <div className="p-12 text-center text-red-700">
        {error || "Booking not found."}
      </div>
    );
  const closedEditAllowed =
    booking.folderStatus !== "CLOSED" || hasPermission("booking.closed.edit");
  const canOpenPaymentCard =
    hasPermission("sale.view_own") ||
    hasPermission("admin.sale_queue.view") ||
    hasPermission("admin.sale.accept");

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Booking Folder
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            FOLDER {booking.folderNumber}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {hasPermission("customer.view") ? <Link href={`/customers/${booking.customer.id}`} className="font-semibold hover:text-cyan-700">{booking.customer.firstName} {booking.customer.lastName}</Link> : <>{booking.customer.firstName} {booking.customer.lastName}</>} ·{" "}
            {booking.destination}
          </p>
        </div>
        <Link
          href="/bookings"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold"
        >
          All bookings
        </Link>
      </header>
      {message && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Overview</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Customer",
              `${booking.customer.firstName} ${booking.customer.lastName}`,
            ],
            [
              "Travel",
              `${new Date(booking.travelStartDate).toLocaleDateString("en-GB")}${booking.travelEndDate ? ` – ${new Date(booking.travelEndDate).toLocaleDateString("en-GB")}` : ""}`,
            ],
            [
              "Sales Advisor",
              `${booking.salesAdvisor.firstName} ${booking.salesAdvisor.lastName}`,
            ],
            ["Sales Team", booking.salesAdvisor.department?.name ?? "—"],
            [
              "Processing Admin / Operations Owner",
              booking.operationsOwner
                ? `${booking.operationsOwner.firstName} ${booking.operationsOwner.lastName}`
                : "Unassigned",
            ],
            ["Booking", booking.status],
            ["Travel Status", booking.travelStatus],
            ["Operations", booking.operationsStatus],
            ["Finance", booking.accountsStatus],
            ["Folder", booking.folderStatus],
            [
              "Booking Type",
              [
                ...new Set(
                  booking.saleSubmission.products.map((product) =>
                    product.category.replaceAll("_", " "),
                  ),
                ),
              ].join(", ") || "—",
            ],
            [
              "Payment Type",
              booking.saleSubmission.paymentType?.replaceAll("_", " ") ?? "—",
            ],
            [
              "Created",
              new Date(booking.createdAt).toLocaleString("en-GB"),
            ],
            [
              "Selling Price",
              booking.sellingPrice
                ? `${booking.currency} ${booking.sellingPrice}`
                : "Restricted",
            ],
            [
              "Supplier Cost",
              booking.supplierCost !== undefined
                ? `${booking.currency} ${booking.supplierCost ?? "—"}`
                : "Restricted",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {String(value).replaceAll("_", " ")}
              </dd>
            </div>
          ))}
        </dl>
        {hasPermission("booking.status.manage") && closedEditAllowed && (
          <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
            <label className="text-sm">
              Booking Status
              <select
                value={booking.status}
                onChange={(e) =>
                  void action(
                    `/bookings/${id}/status`,
                    "PATCH",
                    { status: e.target.value },
                    "Booking status updated.",
                  )
                }
                className={inputClass}
              >
                {bookingStatuses.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Operations Status
              <select
                value={booking.operationsStatus}
                onChange={(e) =>
                  void action(
                    `/bookings/${id}/operations-status`,
                    "PATCH",
                    { status: e.target.value },
                    "Operations status updated.",
                  )
                }
                className={inputClass}
              >
                {booking.operationsStatus === "COMPLETE" && (
                  <option>COMPLETE</option>
                )}
                {operationsStatuses.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Travel Status
              <select
                value={booking.travelStatus}
                onChange={(e) =>
                  void action(
                    `/bookings/${id}/travel-status`,
                    "PATCH",
                    { status: e.target.value },
                    "Travel status updated.",
                  )
                }
                className={inputClass}
              >
                {travelStatuses.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {hasPermission("booking.assign_operations") && closedEditAllowed && (
          <form
            id="assignment"
            onSubmit={(e) =>
              void submit(
                e,
                `/bookings/${id}/assign-operations`,
                { userId: operationsOwnerId },
                "Processing owner assigned.",
                () => undefined,
              )
            }
            className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-end"
          >
            <label className="flex-1 text-sm">
              Processing Admin / Operations Owner
              {users.length ? (
                <select
                  required
                  value={operationsOwnerId}
                  onChange={(e) => setOperationsOwnerId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  value={operationsOwnerId}
                  onChange={(e) => setOperationsOwnerId(e.target.value)}
                  placeholder="Eligible processing user UUID"
                  className={inputClass}
                />
              )}
            </label>
            <button
              disabled={saving}
              className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Assign
            </button>
          </form>
        )}
      </section>

      <div className="mt-6">
        <Section title="Customer Information" count={1}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase text-slate-500">Customer</dt>
              <dd className="mt-1 font-semibold">
                {booking.customer.firstName} {booking.customer.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Email</dt>
              <dd className="mt-1">{booking.customer.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Phone</dt>
              <dd className="mt-1">{booking.customer.phone ?? "—"}</dd>
            </div>
          </dl>
        </Section>
      </div>

      {hasPermission("booking.lifecycle.view") && (
        <BookingLifecyclePanel booking={booking} onChanged={load} />
      )}

      {hasPermission("finance.view") && (
        <BookingFinanceWorkspace booking={booking} onChanged={load} />
      )}

      <div className="mt-6">
        <Section
          title="Original Sales Payment Card"
          count={booking.saleSubmission.products.length}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm">
            <div>
              <p className="font-semibold">
                Submitted information is read-only in Operations
              </p>
              <p className="mt-1 text-slate-600">
                {booking.saleSubmission.salesNotes || "No Sales notes."}
              </p>
              {booking.saleSubmission.passengerInformation && (
                <p className="mt-1 text-slate-600">
                  Passenger information: {booking.saleSubmission.passengerInformation}
                </p>
              )}
            </div>
            {canOpenPaymentCard && (
              <Link
                href={`/admin/sales/${booking.saleSubmissionId}`}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-700"
              >
                Open complete Payment Card
              </Link>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {booking.saleSubmission.products.map((product) => (
              <article
                key={product.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <p className="text-xs font-bold uppercase text-cyan-700">
                  {product.category.replaceAll("_", " ")}
                </p>
                <p className="mt-1 font-semibold">{product.description}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Supplier: {product.supplier?.name ?? "Not assigned"} · Estimated
                  cost: {booking.currency} {product.estimatedSupplierCost ?? "—"}
                </p>
                {product.pnrText && (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    {product.pnrText}
                  </pre>
                )}
                {product.notes && (
                  <p className="mt-3 text-sm text-slate-600">{product.notes}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.references.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs"
                    >
                      {item.type.replaceAll("_", " ")}: {item.value}
                    </span>
                  ))}
                  {product.attachments.map((attachment) =>
                    canOpenPaymentCard ? (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() =>
                          void viewSalesAttachment(product.id, attachment.id)
                        }
                        className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700"
                      >
                        {attachment.fileName}
                      </button>
                    ) : (
                      <span
                        key={attachment.id}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
                      >
                        Protected attachment
                      </span>
                    ),
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <p>
              Initial payment: {booking.currency}{" "}
              {booking.saleSubmission.initialPaymentAmount ?? "—"}
            </p>
            <p>
              Balance date:{" "}
              {booking.saleSubmission.finalBalancePaymentDate
                ? new Date(
                    booking.saleSubmission.finalBalancePaymentDate,
                  ).toLocaleDateString("en-GB")
                : "—"}
            </p>
            <p>
              Arrangement: {booking.saleSubmission.paymentArrangementNotes ?? "—"}
            </p>
          </div>
          <div className="grid gap-3 text-sm lg:grid-cols-2">
            <div>
              <p className="font-semibold">Recorded payment entries</p>
              {booking.saleSubmission.paymentEntries.length ? (
                booking.saleSubmission.paymentEntries.map((payment) => (
                  <p key={payment.id} className="mt-1 text-slate-600">
                    {payment.method.replaceAll("_", " ")} · {booking.currency}{" "}
                    {payment.amount} ·{" "}
                    {new Date(payment.paymentDate).toLocaleDateString("en-GB")}
                  </p>
                ))
              ) : (
                <p className="mt-1 text-slate-500">No recorded entries.</p>
              )}
            </div>
            <div>
              <p className="font-semibold">Planned installments</p>
              {booking.saleSubmission.installments.length ? (
                booking.saleSubmission.installments.map((installment) => (
                  <p key={installment.id} className="mt-1 text-slate-600">
                    {booking.currency} {installment.amount} · due{" "}
                    {new Date(installment.dueDate).toLocaleDateString("en-GB")}
                  </p>
                ))
              ) : (
                <p className="mt-1 text-slate-500">No planned installments.</p>
              )}
            </div>
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Passengers" count={booking.passengers.length}>
          {booking.passengers.map((p) => (
            <article key={p.id} className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold">
                {p.firstName} {p.lastName}
                {p.isPrimaryPassenger ? " · Primary" : ""}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {p.nationality ?? "Nationality —"} · Passport{" "}
                {p.passportNumber ?? "—"}
              </p>
              {p.operationalNotes && (
                <p className="mt-2 text-sm text-slate-700">
                  {p.operationalNotes}
                </p>
              )}
              {hasPermission("booking.manage_passengers") &&
                closedEditAllowed && (
                  <PassengerEditor
                    passenger={p}
                    onSave={(body) =>
                      action(
                        `/bookings/${id}/passengers/${p.id}`,
                        "PATCH",
                        body,
                        "Passenger updated.",
                      )
                    }
                  />
                )}
            </article>
          ))}
          {hasPermission("booking.manage_passengers") && closedEditAllowed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold text-emerald-700">
                Add Passenger
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(
                    e,
                    `/bookings/${id}/passengers`,
                    {
                      ...passenger,
                      dateOfBirth: passenger.dateOfBirth || undefined,
                      passportExpiryDate:
                        passenger.passportExpiryDate || undefined,
                    },
                    "Passenger added.",
                    () =>
                      setPassenger({
                        firstName: "",
                        lastName: "",
                        dateOfBirth: "",
                        nationality: "",
                        passportNumber: "",
                        passportExpiryDate: "",
                        email: "",
                        phone: "",
                        isPrimaryPassenger: false,
                        operationalNotes: "",
                      }),
                  )
                }
                className="mt-4 grid gap-3 sm:grid-cols-2"
              >
                <input
                  required
                  placeholder="First name"
                  value={passenger.firstName}
                  onChange={(e) =>
                    setPassenger({ ...passenger, firstName: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  required
                  placeholder="Last name"
                  value={passenger.lastName}
                  onChange={(e) =>
                    setPassenger({ ...passenger, lastName: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  type="date"
                  value={passenger.dateOfBirth}
                  onChange={(e) =>
                    setPassenger({ ...passenger, dateOfBirth: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Nationality"
                  value={passenger.nationality}
                  onChange={(e) =>
                    setPassenger({ ...passenger, nationality: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Passport number"
                  value={passenger.passportNumber}
                  onChange={(e) =>
                    setPassenger({
                      ...passenger,
                      passportNumber: e.target.value,
                    })
                  }
                  className={inputClass}
                />
                <input
                  type="date"
                  value={passenger.passportExpiryDate}
                  onChange={(e) =>
                    setPassenger({
                      ...passenger,
                      passportExpiryDate: e.target.value,
                    })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Email"
                  value={passenger.email}
                  onChange={(e) =>
                    setPassenger({ ...passenger, email: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Phone"
                  value={passenger.phone}
                  onChange={(e) =>
                    setPassenger({ ...passenger, phone: e.target.value })
                  }
                  className={inputClass}
                />
                <textarea
                  placeholder="Passenger operational notes"
                  value={passenger.operationalNotes}
                  onChange={(e) =>
                    setPassenger({
                      ...passenger,
                      operationalNotes: e.target.value,
                    })
                  }
                  className={`${inputClass} sm:col-span-2`}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={passenger.isPrimaryPassenger}
                    onChange={(e) =>
                      setPassenger({
                        ...passenger,
                        isPrimaryPassenger: e.target.checked,
                      })
                    }
                  />
                  Primary passenger
                </label>
                <button className="rounded-xl bg-emerald-700 px-4 py-2.5 text-white">
                  Add Passenger
                </button>
              </form>
            </details>
          )}
        </Section>

        <Section title="Operational Products & Suppliers" count={booking.suppliers.length}>
          {booking.suppliers.map((s) => (
            <article key={s.id} className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold">
                {s.supplier.name} · {s.serviceType}
              </p>
              <p className="mt-1 text-sm">
                {s.category?.replaceAll("_", " ") ?? "Product"}: {s.description ?? "No description"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {s.supplierReference ?? "No reference"} ·{" "}
                {s.status.replaceAll("_", " ")}
                {s.supplierCost !== undefined
                  ? ` · ${s.currency ?? booking.currency} ${s.supplierCost ?? "—"}`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Service: {s.serviceStartDate ? new Date(s.serviceStartDate).toLocaleDateString("en-GB") : "—"}
                {s.serviceEndDate ? ` – ${new Date(s.serviceEndDate).toLocaleDateString("en-GB")}` : ""}
                {` · Estimated: ${s.currency ?? booking.currency} ${s.estimatedSupplierCost ?? "—"}`}
                {s.sourceSaleProductId ? " · Linked to submitted product" : " · Added by Operations"}
              </p>
              {s.notes && <p className="mt-2 text-sm text-slate-700">{s.notes}</p>}
              {hasPermission("booking.manage_suppliers") &&
                closedEditAllowed && (
                  <>
                    <ProductLifecycleControls
                      product={s}
                      onAction={(path, method, body, success) =>
                        action(path, method, body, success)
                      }
                      bookingId={id}
                    />
                    <OperationalProductEditor
                      product={s}
                      canEditCost={hasPermission("finance.edit")}
                      onSave={(body) =>
                        action(
                          `/bookings/${id}/suppliers/${s.id}`,
                          "PATCH",
                          body,
                          "Operational product updated.",
                        )
                      }
                    />
                  </>
                )}
            </article>
          ))}
          {hasPermission("booking.manage_suppliers") && closedEditAllowed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold text-emerald-700">
                Add Operational Product
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(
                    e,
                    `/bookings/${id}/suppliers`,
                    {
                      ...supplier,
                      supplierId: supplier.supplierId || undefined,
                      name: supplier.supplierId ? undefined : supplier.name,
                      supplierType: supplier.supplierId
                        ? undefined
                        : supplier.supplierType,
                      serviceStartDate: supplier.serviceStartDate || undefined,
                      serviceEndDate: supplier.serviceEndDate || undefined,
                      estimatedSupplierCost:
                        supplier.estimatedSupplierCost || undefined,
                      supplierCost: supplier.supplierCost || undefined,
                    },
                    "Supplier added.",
                    () =>
                      setSupplier({
                        supplierId: "",
                        name: "",
                        supplierType: "AIRLINE",
                        category: "INTERNATIONAL_FLIGHT",
                        description: "",
                        serviceStartDate: "",
                        serviceEndDate: "",
                        serviceType: "",
                        supplierReference: "",
                        estimatedSupplierCost: "",
                        supplierCost: "",
                        currency: "GBP",
                        notes: "",
                      }),
                  )
                }
                className="mt-4 grid gap-3 sm:grid-cols-2"
              >
                <select
                  value={supplier.supplierId}
                  onChange={(e) =>
                    setSupplier({ ...supplier, supplierId: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">Create a new supplier</option>
                  {supplierOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} · {option.supplierType.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <input
                  required={!supplier.supplierId}
                  disabled={Boolean(supplier.supplierId)}
                  placeholder="Supplier name"
                  value={supplier.name}
                  onChange={(e) =>
                    setSupplier({ ...supplier, name: e.target.value })
                  }
                  className={inputClass}
                />
                <select
                  disabled={Boolean(supplier.supplierId)}
                  value={supplier.supplierType}
                  onChange={(e) =>
                    setSupplier({ ...supplier, supplierType: e.target.value })
                  }
                  className={inputClass}
                >
                  {[
                    "AIRLINE",
                    "HOTEL",
                    "TOUR_OPERATOR",
                    "TRANSFER",
                    "CRUISE",
                    "INSURANCE",
                    "OTHER",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  value={supplier.category}
                  onChange={(e) =>
                    setSupplier({ ...supplier, category: e.target.value })
                  }
                  className={inputClass}
                >
                  {[
                    "INTERNATIONAL_FLIGHT",
                    "BUDGET_CARRIER",
                    "HOTEL",
                    "TRANSFER",
                    "TOUR",
                  ].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Product description"
                  value={supplier.description}
                  onChange={(e) =>
                    setSupplier({ ...supplier, description: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  type="date"
                  aria-label="Service start date"
                  value={supplier.serviceStartDate}
                  onChange={(e) =>
                    setSupplier({
                      ...supplier,
                      serviceStartDate: e.target.value,
                    })
                  }
                  className={inputClass}
                />
                <input
                  type="date"
                  aria-label="Service end date"
                  value={supplier.serviceEndDate}
                  onChange={(e) =>
                    setSupplier({
                      ...supplier,
                      serviceEndDate: e.target.value,
                    })
                  }
                  className={inputClass}
                />
                <input
                  required
                  placeholder="Service type"
                  value={supplier.serviceType}
                  onChange={(e) =>
                    setSupplier({ ...supplier, serviceType: e.target.value })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Supplier reference"
                  value={supplier.supplierReference}
                  onChange={(e) =>
                    setSupplier({
                      ...supplier,
                      supplierReference: e.target.value,
                    })
                  }
                  className={inputClass}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Estimated supplier cost"
                  value={supplier.estimatedSupplierCost}
                  onChange={(e) =>
                    setSupplier({
                      ...supplier,
                      estimatedSupplierCost: e.target.value,
                    })
                  }
                  className={inputClass}
                />
                {hasPermission("finance.edit") && (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Supplier cost"
                      value={supplier.supplierCost}
                      onChange={(e) =>
                        setSupplier({
                          ...supplier,
                          supplierCost: e.target.value,
                        })
                      }
                      className={inputClass}
                    />
                    <input
                      maxLength={3}
                      value={supplier.currency}
                      onChange={(e) =>
                        setSupplier({
                          ...supplier,
                          currency: e.target.value.toUpperCase(),
                        })
                      }
                      className={inputClass}
                    />
                  </>
                )}
                <textarea
                  placeholder="Notes"
                  value={supplier.notes}
                  onChange={(e) =>
                    setSupplier({ ...supplier, notes: e.target.value })
                  }
                  className={`${inputClass} sm:col-span-2`}
                />
                <button className="rounded-xl bg-emerald-700 px-4 py-2.5 text-white">
                  Add Product
                </button>
              </form>
            </details>
          )}
        </Section>

        <Section title="References / PNR" count={booking.references.length}>
          {booking.references.map((r) => (
            <article key={r.id} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">
                {r.type.replaceAll("_", " ")}
              </p>
              <p className="mt-1 font-mono font-semibold">{r.reference}</p>
              {r.bookingSupplier && (
                <p className="mt-1 text-xs text-slate-500">
                  Product: {r.bookingSupplier.description ?? "Operational product"}
                </p>
              )}
            </article>
          ))}
          {hasPermission("booking.manage_references") && closedEditAllowed && (
            <form
              onSubmit={(e) =>
                void submit(
                  e,
                  `/bookings/${id}/references`,
                  {
                    ...reference,
                    bookingSupplierId:
                      reference.bookingSupplierId || undefined,
                  },
                  "Reference added.",
                  () =>
                    setReference({
                      type: "PNR",
                      reference: "",
                      bookingSupplierId: "",
                    }),
                )
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <select
                value={reference.type}
                onChange={(e) =>
                  setReference({ ...reference, type: e.target.value })
                }
                className={inputClass}
              >
                {[
                  "PNR",
                  "AIRLINE_REFERENCE",
                  "HOTEL_REFERENCE",
                  "SUPPLIER_REFERENCE",
                  "TICKET_NUMBER",
                  "IV_REFERENCE",
                  "AMADEUS_REFERENCE",
                  "OTHER",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                value={reference.bookingSupplierId}
                onChange={(e) =>
                  setReference({
                    ...reference,
                    bookingSupplierId: e.target.value,
                  })
                }
                className={inputClass}
              >
                <option value="">Booking-level reference</option>
                {booking.suppliers.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.description || product.serviceType} — {product.supplier.name}
                  </option>
                ))}
              </select>
              <textarea
                required
                placeholder="Reference or multiline PNR"
                value={reference.reference}
                onChange={(e) =>
                  setReference({ ...reference, reference: e.target.value })
                }
                className={`${inputClass} sm:col-span-2`}
              />
              <button className="mt-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-white">
                Add
              </button>
            </form>
          )}
        </Section>

        <Section title="Operational Notes" count={booking.notes.length}>
          {hasPermission("booking.manage_notes") && closedEditAllowed && (
            <form
              onSubmit={(e) =>
                void submit(
                  e,
                  `/bookings/${id}/notes`,
                  { content: note },
                  "Note added.",
                  () => setNote(""),
                )
              }
              className="flex gap-3"
            >
              <textarea
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Internal operational note"
                className={`${inputClass} flex-1`}
              />
              <button className="mt-1.5 self-end rounded-xl bg-emerald-700 px-4 py-2.5 text-white">
                Add
              </button>
            </form>
          )}
          {booking.notes.map((n) => (
            <article key={n.id} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm">{n.content}</p>
              <p className="mt-2 text-xs text-slate-500">
                {new Date(n.createdAt).toLocaleString("en-GB")} ·{" "}
                {n.createdBy.firstName} {n.createdBy.lastName}
              </p>
            </article>
          ))}
        </Section>

        <Section title="Tasks" count={booking.tasks.length}>
          {booking.tasks.map((t) => (
            <article key={t.id} className="rounded-xl bg-slate-50 p-4">
              <div className="flex justify-between gap-3">
                <p className="font-semibold">{t.title}</p>
                <span className="text-xs font-bold">
                  {t.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Due: {t.dueAt ? new Date(t.dueAt).toLocaleString("en-GB") : "—"}{" "}
                · Assigned:{" "}
                {t.assignedUser
                  ? `${t.assignedUser.firstName} ${t.assignedUser.lastName}`
                  : "Unassigned"}
              </p>
              {hasPermission("booking.manage_tasks") &&
                closedEditAllowed &&
                t.status !== "COMPLETED" && (
                  <button
                    onClick={() =>
                      void action(
                        `/bookings/${id}/tasks/${t.id}`,
                        "PATCH",
                        { status: "COMPLETED" },
                        "Task completed.",
                      )
                    }
                    className="mt-2 text-xs font-semibold text-emerald-700"
                  >
                    Mark complete
                  </button>
                )}
            </article>
          ))}
          {hasPermission("booking.manage_tasks") && closedEditAllowed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold text-emerald-700">
                Create Task
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(
                    e,
                    `/bookings/${id}/tasks`,
                    {
                      ...task,
                      assignedUserId: task.assignedUserId || undefined,
                      dueAt: task.dueAt
                        ? new Date(task.dueAt).toISOString()
                        : undefined,
                    },
                    "Task created.",
                    () =>
                      setTask({
                        title: "",
                        description: "",
                        assignedUserId: "",
                        dueAt: "",
                      }),
                  )
                }
                className="mt-4 grid gap-3 sm:grid-cols-2"
              >
                <input
                  required
                  placeholder="Title"
                  value={task.title}
                  onChange={(e) => setTask({ ...task, title: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="datetime-local"
                  value={task.dueAt}
                  onChange={(e) => setTask({ ...task, dueAt: e.target.value })}
                  className={inputClass}
                />
                <textarea
                  placeholder="Description"
                  value={task.description}
                  onChange={(e) =>
                    setTask({ ...task, description: e.target.value })
                  }
                  className={inputClass}
                />
                {users.length ? (
                  <select
                    value={task.assignedUserId}
                    onChange={(e) =>
                      setTask({ ...task, assignedUserId: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    placeholder="Assigned user UUID"
                    value={task.assignedUserId}
                    onChange={(e) =>
                      setTask({ ...task, assignedUserId: e.target.value })
                    }
                    className={inputClass}
                  />
                )}
                <button className="rounded-xl bg-emerald-700 px-4 py-2.5 text-white">
                  Create Task
                </button>
              </form>
            </details>
          )}
        </Section>

        <div className="lg:col-span-2">
          <BookingSupportWorkspace
            booking={booking}
            users={users}
            onChanged={load}
          />
        </div>

        <Section title="Activity" count={booking.activity.length}>
          {booking.activity.map((a) => (
            <article key={a.id} className="border-l-2 border-emerald-200 pl-4">
              <p className="text-sm font-semibold">
                {a.action.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(a.createdAt).toLocaleString("en-GB")} ·{" "}
                {a.actor.firstName} {a.actor.lastName}
              </p>
            </article>
          ))}
        </Section>
      </div>
    </div>
  );
}

function PassengerEditor({
  passenger,
  onSave,
}: {
  passenger: BookingDetail["passengers"][number];
  onSave: (body: unknown) => Promise<boolean>;
}) {
  const [fields, setFields] = useState({
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    dateOfBirth: passenger.dateOfBirth?.slice(0, 10) ?? "",
    nationality: passenger.nationality ?? "",
    passportNumber: passenger.passportNumber ?? "",
    passportExpiryDate: passenger.passportExpiryDate?.slice(0, 10) ?? "",
    email: passenger.email ?? "",
    phone: passenger.phone ?? "",
    isPrimaryPassenger: passenger.isPrimaryPassenger,
    operationalNotes: passenger.operationalNotes ?? "",
  });

  return (
    <details className="mt-3 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-cyan-700">
        Edit passenger
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            ...fields,
            dateOfBirth: fields.dateOfBirth || undefined,
            passportExpiryDate: fields.passportExpiryDate || undefined,
          });
        }}
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        {(["firstName", "lastName", "nationality", "passportNumber", "email", "phone"] as const).map(
          (field) => (
            <input
              key={field}
              required={field === "firstName" || field === "lastName"}
              value={fields[field]}
              onChange={(event) =>
                setFields({ ...fields, [field]: event.target.value })
              }
              placeholder={field.replace(/([A-Z])/g, " $1")}
              className={inputClass}
            />
          ),
        )}
        <input
          type="date"
          value={fields.dateOfBirth}
          onChange={(event) =>
            setFields({ ...fields, dateOfBirth: event.target.value })
          }
          className={inputClass}
        />
        <input
          type="date"
          value={fields.passportExpiryDate}
          onChange={(event) =>
            setFields({ ...fields, passportExpiryDate: event.target.value })
          }
          className={inputClass}
        />
        <textarea
          value={fields.operationalNotes}
          onChange={(event) =>
            setFields({ ...fields, operationalNotes: event.target.value })
          }
          placeholder="Operational notes"
          className={`${inputClass} sm:col-span-2`}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={fields.isPrimaryPassenger}
            onChange={(event) =>
              setFields({
                ...fields,
                isPrimaryPassenger: event.target.checked,
              })
            }
          />
          Primary passenger
        </label>
        <button className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">
          Save passenger
        </button>
      </form>
    </details>
  );
}

const productStatuses: BookingProductStatus[] = [
  "PENDING",
  "BOOKED_PAYMENT_PENDING",
  "BOOKED_PAID",
  "SCHEDULE_CHANGE",
  "SCHEDULE_CHANGE_COMPLETE",
  "TRAVEL_COMPLETE",
  "CONFIRMED",
  "CANCELLED",
];
const productIssueTypes: BookingProductIssueType[] = [
  "SCHEDULE_CHANGE",
  "MISSING_PASSENGER_DOCUMENTS",
  "SUPPLIER_PAYMENT_PENDING",
  "BOOKING_CONFIRMATION_PENDING",
  "TICKET_ISSUANCE_PENDING",
  "OTHER",
];

function ProductLifecycleControls({
  bookingId,
  product,
  onAction,
}: {
  bookingId: string;
  product: BookingDetail["suppliers"][number];
  onAction: (
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    success: string,
  ) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<BookingProductStatus>(product.status);
  const [statusNotes, setStatusNotes] = useState("");
  const [issue, setIssue] = useState({
    type: "SCHEDULE_CHANGE" as BookingProductIssueType,
    originalDetails: "",
    revisedDetails: "",
    reason: "",
    notes: "",
  });
  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onAction(
            `/bookings/${bookingId}/products/${product.id}/status`,
            "PATCH",
            { status, notes: statusNotes || undefined },
            "Product status updated.",
          );
        }}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
      >
        <select value={status} onChange={(e) => setStatus(e.target.value as BookingProductStatus)} className={inputClass}>
          {productStatuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <input value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Status note" className={inputClass} />
        <button className="mt-1.5 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">Update Status</button>
      </form>
      {product.issues.map((item) => (
        <div key={item.id} className={`rounded-xl border p-3 text-sm ${item.status === "OPEN" ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{item.type.replaceAll("_", " ")} · {item.status}</strong>
            <span>{new Date(item.createdAt).toLocaleString("en-GB")}</span>
          </div>
          <p className="mt-1">{item.reason}</p>
          {item.originalDetails && <p className="mt-1"><b>Original:</b> {item.originalDetails}</p>}
          {item.revisedDetails && <p><b>Revised:</b> {item.revisedDetails}</p>}
          {item.notes && <p><b>Notes:</b> {item.notes}</p>}
          {item.followUps.map((note) => <p key={note.id} className="mt-1 text-slate-600">Follow-up: {note.content}</p>)}
          {item.status === "OPEN" && (
            <div className="mt-2 flex gap-2">
              <button type="button" className="rounded-lg border px-3 py-1" onClick={() => {
                const content = window.prompt("Follow-up note");
                if (content?.trim()) void onAction(`/bookings/${bookingId}/issues/${item.id}/notes`, "POST", { content: content.trim() }, "Follow-up recorded.");
              }}>Add Follow-up</button>
              <button type="button" className="rounded-lg bg-emerald-700 px-3 py-1 text-white" onClick={() => {
                const notes = window.prompt("Resolution notes (optional)");
                if (notes !== null) void onAction(`/bookings/${bookingId}/issues/${item.id}/resolve`, "POST", { notes: notes.trim() || undefined }, "Issue resolved.");
              }}>Resolve</button>
            </div>
          )}
        </div>
      ))}
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-semibold text-amber-800">Record product issue or schedule change</summary>
        <form onSubmit={async (event) => {
          event.preventDefault();
          const saved = await onAction(`/bookings/${bookingId}/products/${product.id}/issues`, "POST", {
            ...issue,
            originalDetails: issue.originalDetails || undefined,
            revisedDetails: issue.revisedDetails || undefined,
            notes: issue.notes || undefined,
          }, "Product issue recorded.");
          if (saved) setIssue({ type: "SCHEDULE_CHANGE", originalDetails: "", revisedDetails: "", reason: "", notes: "" });
        }} className="mt-3 grid gap-2 sm:grid-cols-2">
          <select value={issue.type} onChange={(e) => setIssue({ ...issue, type: e.target.value as BookingProductIssueType })} className={inputClass}>
            {productIssueTypes.map((value) => <option key={value}>{value}</option>)}
          </select>
          <input required value={issue.reason} onChange={(e) => setIssue({ ...issue, reason: e.target.value })} placeholder="Reason / outstanding requirement" className={inputClass} />
          {issue.type === "SCHEDULE_CHANGE" && <>
            <textarea required value={issue.originalDetails} onChange={(e) => setIssue({ ...issue, originalDetails: e.target.value })} placeholder="Original details" className={inputClass} />
            <textarea required value={issue.revisedDetails} onChange={(e) => setIssue({ ...issue, revisedDetails: e.target.value })} placeholder="Revised details" className={inputClass} />
          </>}
          <textarea value={issue.notes} onChange={(e) => setIssue({ ...issue, notes: e.target.value })} placeholder="Notes" className={`${inputClass} sm:col-span-2`} />
          <button className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Record Issue</button>
        </form>
      </details>
    </div>
  );
}

function OperationalProductEditor({
  product,
  canEditCost,
  onSave,
}: {
  product: BookingDetail["suppliers"][number];
  canEditCost: boolean;
  onSave: (body: unknown) => Promise<boolean>;
}) {
  const [fields, setFields] = useState({
    category: product.category ?? "INTERNATIONAL_FLIGHT",
    description: product.description ?? "",
    serviceStartDate: product.serviceStartDate?.slice(0, 10) ?? "",
    serviceEndDate: product.serviceEndDate?.slice(0, 10) ?? "",
    serviceType: product.serviceType,
    supplierReference: product.supplierReference ?? "",
    estimatedSupplierCost: product.estimatedSupplierCost ?? "",
    supplierCost: product.supplierCost ?? "",
    notes: product.notes ?? "",
  });
  return (
    <details className="mt-3 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-cyan-700">
        Edit operational product
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            ...fields,
            serviceStartDate: fields.serviceStartDate || undefined,
            serviceEndDate: fields.serviceEndDate || undefined,
            estimatedSupplierCost: fields.estimatedSupplierCost || undefined,
            supplierCost: canEditCost
              ? fields.supplierCost || undefined
              : undefined,
          });
        }}
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        <select
          value={fields.category}
          onChange={(event) =>
            setFields({
              ...fields,
              category: event.target.value as typeof fields.category,
            })
          }
          className={inputClass}
        >
          {[
            "INTERNATIONAL_FLIGHT",
            "BUDGET_CARRIER",
            "HOTEL",
            "TRANSFER",
            "TOUR",
          ].map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <input
          required
          value={fields.description}
          onChange={(event) =>
            setFields({ ...fields, description: event.target.value })
          }
          placeholder="Description"
          className={inputClass}
        />
        <input
          type="date"
          value={fields.serviceStartDate}
          onChange={(event) =>
            setFields({ ...fields, serviceStartDate: event.target.value })
          }
          className={inputClass}
        />
        <input
          type="date"
          value={fields.serviceEndDate}
          onChange={(event) =>
            setFields({ ...fields, serviceEndDate: event.target.value })
          }
          className={inputClass}
        />
        <input
          required
          value={fields.serviceType}
          onChange={(event) =>
            setFields({ ...fields, serviceType: event.target.value })
          }
          placeholder="Service type"
          className={inputClass}
        />
        <input
          value={fields.supplierReference}
          onChange={(event) =>
            setFields({ ...fields, supplierReference: event.target.value })
          }
          placeholder="Supplier reference"
          className={inputClass}
        />
        <input
          type="number"
          min="0"
          step="0.01"
          value={fields.estimatedSupplierCost}
          onChange={(event) =>
            setFields({
              ...fields,
              estimatedSupplierCost: event.target.value,
            })
          }
          placeholder="Estimated supplier cost"
          className={inputClass}
        />
        {canEditCost && (
          <input
            type="number"
            min="0"
            step="0.01"
            value={fields.supplierCost}
            onChange={(event) =>
              setFields({ ...fields, supplierCost: event.target.value })
            }
            placeholder="Recorded supplier cost"
            className={inputClass}
          />
        )}
        <textarea
          value={fields.notes}
          onChange={(event) =>
            setFields({ ...fields, notes: event.target.value })
          }
          placeholder="Operational notes"
          className={`${inputClass} sm:col-span-2`}
        />
        <button className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">
          Save product
        </button>
      </form>
    </details>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}
