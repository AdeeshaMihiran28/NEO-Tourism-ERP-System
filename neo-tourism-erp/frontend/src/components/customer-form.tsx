"use client";

import { FormEvent, useState } from "react";
import type { CustomerInput, CustomerType } from "@/types/customer";

interface CustomerFormProps {
  initialValue?: Partial<CustomerInput>;
  submitting: boolean;
  submitLabel: string;
  showStatus?: boolean;
  onSubmit: (value: CustomerInput) => Promise<void>;
}

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";

export function CustomerForm({
  initialValue,
  submitting,
  submitLabel,
  showStatus = false,
  onSubmit,
}: CustomerFormProps) {
  const [value, setValue] = useState<CustomerInput>({
    firstName: initialValue?.firstName ?? "",
    lastName: initialValue?.lastName ?? "",
    email: initialValue?.email ?? "",
    phone: initialValue?.phone ?? "",
    secondaryPhone: initialValue?.secondaryPhone ?? "",
    dateOfBirth: initialValue?.dateOfBirth ?? "",
    nationality: initialValue?.nationality ?? "",
    customerType: initialValue?.customerType ?? "NEW",
    isActive: initialValue?.isActive ?? true,
  });

  function setField<K extends keyof CustomerInput>(
    field: K,
    fieldValue: CustomerInput[K],
  ) {
    setValue((current) => ({ ...current, [field]: fieldValue }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      ...value,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email?.trim() || undefined,
      phone: value.phone?.trim() || undefined,
      secondaryPhone: value.secondaryPhone?.trim() || undefined,
      dateOfBirth: value.dateOfBirth || undefined,
      nationality: value.nationality?.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">
        First Name
        <input required maxLength={100} value={value.firstName} onChange={(event) => setField("firstName", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Last Name
        <input required maxLength={100} value={value.lastName} onChange={(event) => setField("lastName", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Email
        <input type="email" maxLength={254} value={value.email} onChange={(event) => setField("email", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Phone
        <input type="tel" pattern="[+0-9()\-\s]{7,25}" value={value.phone} onChange={(event) => setField("phone", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Secondary Phone
        <input type="tel" pattern="[+0-9()\-\s]{7,25}" value={value.secondaryPhone} onChange={(event) => setField("secondaryPhone", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Date of Birth
        <input type="date" value={value.dateOfBirth} onChange={(event) => setField("dateOfBirth", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Nationality
        <input maxLength={100} value={value.nationality} onChange={(event) => setField("nationality", event.target.value)} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Customer Type
        <select value={value.customerType} onChange={(event) => setField("customerType", event.target.value as CustomerType)} className={inputClass}>
          <option value="NEW">New</option>
          <option value="REPEAT">Repeat</option>
          <option value="REFERRAL">Referral</option>
        </select>
      </label>
      {showStatus && (
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={value.isActive} onChange={(event) => setField("isActive", event.target.checked)} className="size-4 rounded border-slate-300" />
          Active customer
        </label>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={submitting} className="rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-60">
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
