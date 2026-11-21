"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { BookingListResponse } from "@/types/booking";
import type { SalePerson } from "@/types/sale";

const inputClass = "rounded-xl border border-slate-300 px-3 py-2.5 text-sm";
const initialFilters = {
  folderNumber: "",
  customer: "",
  operationsOwnerId: "",
  operationsStatus: "",
  travelStatus: "",
  milestone: "",
  dateFrom: "",
  dateTo: "",
};

export default function BookingsPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<BookingListResponse | null>(null);
  const [owners, setOwners] = useState<SalePerson[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (selectedPage = 1, selected = initialFilters) => {
      const query = new URLSearchParams({
        page: String(selectedPage),
        limit: "20",
      });
      Object.entries(selected).forEach(([key, value]) => {
        if (value.trim()) query.set(key, value.trim());
      });
      try {
        setLoading(true);
        setResult(
          await apiFetch<BookingListResponse>(`/bookings?${query.toString()}`),
        );
        setError("");
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Unable to load bookings.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hasPermission("booking.view")) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(() =>
      Promise.all([
        load(),
        apiFetch<SalePerson[]>("/bookings/operations-users")
          .then(setOwners)
          .catch(() => setOwners([])),
      ]),
    );
  }, [hasPermission, load]);

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void load(1, filters);
  }

  if (!hasPermission("booking.view"))
    return (
      <div className="p-12 text-amber-800">
        You do not have permission to view bookings.
      </div>
    );

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8 lg:py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Admin / Operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Booking Management
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Search, assign and manage operational booking folders.
        </p>
      </header>
      <form
        onSubmit={search}
        className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 xl:grid-cols-9"
      >
        <input
          value={filters.folderNumber}
          onChange={(event) =>
            setFilters({ ...filters, folderNumber: event.target.value })
          }
          placeholder="Folder number"
          className={inputClass}
        />
        <input
          value={filters.customer}
          onChange={(event) =>
            setFilters({ ...filters, customer: event.target.value })
          }
          placeholder="Customer or passenger"
          className={inputClass}
        />
        <select
          value={filters.operationsOwnerId}
          onChange={(event) =>
            setFilters({ ...filters, operationsOwnerId: event.target.value })
          }
          className={inputClass}
        >
          <option value="">All processing owners</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.firstName} {owner.lastName}
            </option>
          ))}
        </select>
        <select
          value={filters.operationsStatus}
          onChange={(event) =>
            setFilters({ ...filters, operationsStatus: event.target.value })
          }
          className={inputClass}
        >
          <option value="">All operations statuses</option>
          {[
            "PENDING",
            "IN_PROGRESS",
            "SUPPLIER_PENDING",
            "TICKETING_PENDING",
            "READY",
            "COMPLETE",
            "ACTION_REQUIRED",
          ].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select
          value={filters.travelStatus}
          onChange={(event) =>
            setFilters({ ...filters, travelStatus: event.target.value })
          }
          className={inputClass}
        >
          <option value="">All travel statuses</option>
          {["PENDING", "UPCOMING", "IN_TRAVEL", "TRAVEL_COMPLETE", "CANCELLED"].map(
            (status) => (
              <option key={status}>{status}</option>
            ),
          )}
        </select>
        <select
          value={filters.milestone}
          onChange={(event) => setFilters({ ...filters, milestone: event.target.value })}
          className={inputClass}
        >
          <option value="">All lifecycle milestones</option>
          {[
            "SUPPLIER_PENDING",
            "TICKET_PENDING",
            "ATTENTION_REQUIRED",
            "SCHEDULE_CHANGE",
            "SCHEDULE_CHANGE_COMPLETE",
            "TRAVEL_COMPLETE",
            "RECONCILED",
            "TRAVEL_COMPLETE_RECONCILED",
          ].map((milestone) => <option key={milestone}>{milestone}</option>)}
        </select>
        <input
          type="date"
          aria-label="Travel from"
          value={filters.dateFrom}
          onChange={(event) =>
            setFilters({ ...filters, dateFrom: event.target.value })
          }
          className={inputClass}
        />
        <input
          type="date"
          aria-label="Travel to"
          value={filters.dateTo}
          onChange={(event) =>
            setFilters({ ...filters, dateTo: event.target.value })
          }
          className={inputClass}
        />
        <button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white">
          Apply
        </button>
      </form>
      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            Loading bookings…
          </div>
        ) : result?.data.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  {[
                    "Folder",
                    "Customer / Destination",
                    "Travel",
                    "Sales",
                    "Processing Owner",
                    "Booking / Payment",
                    "Operations / Travel",
                    "Created",
                    "Actions",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((booking) => {
                  const bookingTypes = [
                    ...new Set(
                      booking.saleSubmission.products.map((product) =>
                        product.category.replaceAll("_", " "),
                      ),
                    ),
                  ].join(", ");
                  return (
                    <tr key={booking.id}>
                      <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-950">
                        {booking.folderNumber}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">
                          {booking.customer.firstName} {booking.customer.lastName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {booking.destination}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {new Date(booking.travelStartDate).toLocaleDateString(
                          "en-GB",
                        )}
                        {booking.travelEndDate
                          ? ` – ${new Date(booking.travelEndDate).toLocaleDateString("en-GB")}`
                          : ""}
                      </td>
                      <td className="px-4 py-4">
                        <p>
                          {booking.salesAdvisor.firstName}{" "}
                          {booking.salesAdvisor.lastName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {booking.salesAdvisor.department?.name ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {booking.operationsOwner
                          ? `${booking.operationsOwner.firstName} ${booking.operationsOwner.lastName}`
                          : "Unassigned"}
                      </td>
                      <td className="px-4 py-4">
                        <p>{bookingTypes || "—"}</p>
                        <p className="text-xs text-slate-500">
                          {booking.saleSubmission.paymentType?.replaceAll(
                            "_",
                            " ",
                          ) ?? "Payment type not set"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p>{booking.operationsStatus.replaceAll("_", " ")}</p>
                        <p className="text-xs text-slate-500">
                          {booking.travelStatus.replaceAll("_", " ")}
                        </p>
                        {!!booking._count?.productIssues && (
                          <p className="mt-1 text-xs font-semibold text-amber-700">
                            {booking._count.productIssues} open product issue{booking._count.productIssues === 1 ? "" : "s"}
                          </p>
                        )}
                        {!!booking._count?.specialRequests && (
                          <p className="mt-1 text-xs font-semibold text-cyan-700">
                            {booking._count.specialRequests} special request{booking._count.specialRequests === 1 ? "" : "s"} outstanding
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {new Date(booking.createdAt).toLocaleString("en-GB")}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/bookings/${booking.id}`}
                            className="font-semibold text-emerald-700"
                          >
                            Open
                          </Link>
                          {hasPermission("booking.assign_operations") && (
                            <Link
                              href={`/bookings/${booking.id}#assignment`}
                              className="font-semibold text-cyan-700"
                            >
                              {booking.operationsOwner ? "Reassign" : "Assign"}
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500">
            No bookings found.
          </div>
        )}
      </section>
      {result && result.pagination.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => {
              const next = page - 1;
              setPage(next);
              void load(next, filters);
            }}
            className="rounded-lg border px-4 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm">
            Page {page} of {result.pagination.totalPages}
          </span>
          <button
            disabled={page >= result.pagination.totalPages}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void load(next, filters);
            }}
            className="rounded-lg border px-4 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
