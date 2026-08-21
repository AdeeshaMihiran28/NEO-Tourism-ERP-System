"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CustomerForm } from "@/components/customer-form";
import { ApiError, apiFetch } from "@/lib/api/client";
import type {
  CustomerInput,
  CustomerListItem,
  DuplicateCustomer,
} from "@/types/customer";

interface DuplicateErrorData {
  code?: string;
  possibleDuplicates?: DuplicateCustomer[];
}

export default function NewCustomerPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingInput, setPendingInput] = useState<CustomerInput | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCustomer[]>([]);

  async function createCustomer(input: CustomerInput, confirmDuplicate = false) {
    setSubmitting(true);
    setError("");
    try {
      const customer = await apiFetch<CustomerListItem>("/customers", {
        method: "POST",
        body: JSON.stringify({ ...input, confirmDuplicate }),
      });
      router.push(`/customers/${customer.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        const data = caught.data as DuplicateErrorData;
        if (data.code === "POSSIBLE_DUPLICATE" && data.possibleDuplicates) {
          setPendingInput(input);
          setDuplicates(data.possibleDuplicates);
          return;
        }
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to create customer.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPermission("customer.create")) {
    return <div className="mx-auto max-w-4xl px-5 py-12 text-amber-800">You do not have permission to create customers.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-10">
      <Link href="/customers" className="text-sm font-semibold text-cyan-700">← Customers</Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-950">Add Customer</h1>
      <p className="mt-2 text-sm text-slate-600">Create a permanent Customer 360 record.</p>

      {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {duplicates.length > 0 && pendingInput && (
        <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Possible existing customer found</h2>
          <p className="mt-1 text-sm text-amber-800">Review these records before creating another Customer 360 profile.</p>
          <div className="mt-4 space-y-2">
            {duplicates.map((customer) => (
              <div key={customer.id} className="rounded-xl bg-white p-3 text-sm text-slate-700">
                <Link href={`/customers/${customer.id}`} className="font-semibold text-cyan-800">
                  {customer.firstName} {customer.lastName}
                </Link>
                <p>{customer.email ?? "No email"} · {customer.phone ?? "No phone"}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void createCustomer(pendingInput, true)} disabled={submitting} className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Create anyway
            </button>
            <button type="button" onClick={() => { setDuplicates([]); setPendingInput(null); }} className="rounded-xl border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900">
              Review form
            </button>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <CustomerForm submitting={submitting} submitLabel="Create Customer" onSubmit={(input) => createCustomer(input)} />
      </section>
    </div>
  );
}
