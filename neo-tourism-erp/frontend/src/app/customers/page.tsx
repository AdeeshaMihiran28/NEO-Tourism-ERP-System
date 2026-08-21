"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { CustomerListResponse, CustomerType } from "@/types/customer";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function CustomersPage() {
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<CustomerListResponse | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCustomers = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (customerType) params.set("customerType", customerType);

    return apiFetch<CustomerListResponse>(`/customers?${params}`);
  }, [customerType, page, search]);

  useEffect(() => {
    let active = true;
    if (!hasPermission("customer.view")) {
      Promise.resolve().then(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }

    fetchCustomers()
      .then((data) => {
        if (active) {
          setResult(data);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Unable to load customers.",
          );
        }
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [fetchCustomers, hasPermission]);

  function retryLoad() {
    setLoading(true);
    setError("");
    fetchCustomers()
      .then((data) => setResult(data))
      .catch((caught: unknown) =>
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Unable to load customers.",
        ),
      )
      .finally(() => setLoading(false));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPage(1);
    setSearch(draftSearch.trim());
  }

  if (!hasPermission("customer.view")) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          You do not have permission to view customer records.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">CRM</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Customers
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Search and maintain permanent Customer 360 records.
          </p>
        </div>
        {hasPermission("customer.create") && (
          <Link
            href="/customers/new"
            className="inline-flex items-center justify-center rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800"
          >
            Add Customer
          </Link>
        )}
      </header>

      <form
        onSubmit={handleSearch}
        className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_220px_auto]"
      >
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="Search name, email or phone…"
          aria-label="Search customers"
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
        />
        <select
          value={customerType}
          onChange={(event) => {
            setLoading(true);
            setError("");
            setCustomerType(event.target.value as CustomerType | "");
            setPage(1);
          }}
          aria-label="Customer type"
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-600"
        >
          <option value="">All customer types</option>
          <option value="NEW">New</option>
          <option value="REPEAT">Repeat</option>
          <option value="REFERRAL">Referral</option>
        </select>
        <button
          type="submit"
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Search
        </button>
      </form>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading customers…
          </div>
        )}
        {!loading && error && (
          <div className="p-10 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={retryLoad}
              className="mt-3 text-sm font-semibold text-cyan-700"
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !error && result?.data.length === 0 && (
          <div className="p-12 text-center">
            <p className="font-medium text-slate-800">No customers found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try another search or create the first matching record.
            </p>
          </div>
        )}
        {!loading && !error && result && result.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {['Name', 'Email', 'Phone', 'Type', 'Status', 'Created', 'Actions'].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-5 py-3 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-950">
                      {customer.firstName} {customer.lastName}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{customer.email ?? '—'}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{customer.phone ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                        {customer.customerType}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={customer.isActive ? "text-emerald-700" : "text-slate-500"}>
                        {customer.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {dateFormatter.format(new Date(customer.createdAt))}
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/customers/${customer.id}`} className="font-semibold text-cyan-700 hover:text-cyan-900">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result && result.pagination.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-slate-600">
          <p>
            Page {result.pagination.page} of {result.pagination.totalPages} · {result.pagination.total} customers
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
