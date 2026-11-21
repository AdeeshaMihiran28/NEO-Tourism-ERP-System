"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { BookingDetail } from "@/types/booking";
import type { BankAccount } from "@/types/banking";
import type { TaxCode } from "@/types/accounting-controls";
import type {
  Adjustment,
  FinanceAdvance,
  FinanceInvoice,
  FinancialSummary,
  Payment,
  Reconciliation,
  BookingVoucher,
} from "@/types/accounts";

const input =
  "mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm";
const flags = [
  ["passengerPaymentsVerified", "Passenger payments"],
  ["supplierCostsVerified", "Supplier costs"],
  ["supplierPaymentsVerified", "Supplier payments"],
  ["sellingPriceVerified", "Selling price"],
  ["feesVerified", "Fees"],
  ["adjustmentsVerified", "Adjustments"],
  ["profitVerified", "Profit calculation"],
] as const;

export function BookingFinanceWorkspace({
  booking,
  onChanged,
}: {
  booking: BookingDetail;
  onChanged: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const canEditClosed =
    booking.folderStatus !== "CLOSED" || hasPermission("booking.closed.edit");
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [passengerPayments, setPassengerPayments] = useState<Payment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<FinanceInvoice[]>(
    [],
  );
  const [supplierInvoices, setSupplierInvoices] = useState<FinanceInvoice[]>(
    [],
  );
  const [customerAdvances, setCustomerAdvances] = useState<FinanceAdvance[]>(
    [],
  );
  const [supplierAdvances, setSupplierAdvances] = useState<FinanceAdvance[]>(
    [],
  );
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(
    null,
  );
  const [vouchers, setVouchers] = useState<BookingVoucher[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [passenger, setPassenger] = useState({
    customerInvoiceId: "",
    companyBankAccountId: "",
    amount: "",
    currency: booking.currency,
    paymentMethod: "BANK_TRANSFER",
    paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    recordedGbpAmount: "",
    recordedGbpRate: "",
    transactionFee: "",
    feeCurrency: "GBP",
    idempotencyKey: "",
    notes: "",
  });
  const [supplier, setSupplier] = useState({
    bookingSupplierId: booking.suppliers[0]?.id ?? "",
    supplierInvoiceId: "",
    companyBankAccountId: "",
    amount: "",
    currency: booking.currency,
    paymentMethod: "OTHER",
    paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    recordedGbpAmount: "",
    recordedGbpRate: "",
    transactionFee: "",
    feeCurrency: "GBP",
    idempotencyKey: "",
    fundingBreakdowns: [] as Array<{
      sourceAmount: string;
      sourceCurrency: string;
      feeAmount: string;
      feeCurrency: string;
      recordedConversionRate: string;
      convertedAmount: string;
      convertedCurrency: string;
      reference: string;
      notes: string;
    }>,
    notes: "",
  });
  const [customerInvoice, setCustomerInvoice] = useState({
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currency: booking.currency,
    totalAmount: booking.sellingPrice,
    netAmount: booking.sellingPrice,
    taxCodeId: "",
  });
  const [supplierInvoice, setSupplierInvoice] = useState({
    bookingSupplierId: booking.suppliers[0]?.id ?? "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currency: booking.currency,
    totalAmount: "",
    netAmount: "",
    taxCodeId: "",
  });
  const [customerAdvance, setCustomerAdvance] = useState({
    amount: "",
    currency: booking.currency,
    paymentMethod: "BANK_TRANSFER",
    paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    companyBankAccountId: "",
  });
  const [supplierAdvance, setSupplierAdvance] = useState({
    bookingSupplierId: booking.suppliers[0]?.id ?? "",
    amount: "",
    currency: booking.currency,
    paymentMethod: "BANK_TRANSFER",
    paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    companyBankAccountId: "",
  });
  const [adjustment, setAdjustment] = useState({
    type: "FEE",
    amount: "",
    currency: booking.currency,
    reason: "",
  });
  const [discrepancy, setDiscrepancy] = useState({
    type: "PASSENGER_PAYMENT_MISMATCH",
    description: "",
    amountDifference: "",
    currency: booking.currency,
    assignedUserId: "",
  });
  const [recordedValues, setRecordedValues] = useState({
    surcharge: "",
    initialProfit: "",
    balancedProfit: "",
    totalProfit: "",
    adminProfit: "",
    reason: "",
  });
  const [voucher, setVoucher] = useState({
    voucherReference: "",
    voucherNumber: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const [s, p, sp, a, r, ci, si, ca, sa, ba, taxes, vo] = await Promise.all([
        apiFetch<FinancialSummary>(`/bookings/${booking.id}/financial-summary`),
        apiFetch<Payment[]>(`/bookings/${booking.id}/passenger-payments`),
        apiFetch<Payment[]>(`/bookings/${booking.id}/supplier-payments`),
        apiFetch<Adjustment[]>(`/bookings/${booking.id}/adjustments`),
        apiFetch<Reconciliation | null>(
          `/bookings/${booking.id}/reconciliation`,
        ),
        apiFetch<FinanceInvoice[]>(`/bookings/${booking.id}/customer-invoices`),
        apiFetch<FinanceInvoice[]>(`/bookings/${booking.id}/supplier-invoices`),
        apiFetch<FinanceAdvance[]>(`/bookings/${booking.id}/customer-advances`),
        apiFetch<FinanceAdvance[]>(`/bookings/${booking.id}/supplier-advances`),
        hasPermission("bank.account.view")
          ? apiFetch<BankAccount[]>("/banking/accounts")
          : Promise.resolve([]),
        hasPermission("tax.code.view")
          ? apiFetch<TaxCode[]>("/accounting/tax-codes")
          : Promise.resolve([]),
        apiFetch<BookingVoucher[]>(`/bookings/${booking.id}/vouchers`),
      ]);
      setSummary(s);
      setPassengerPayments(p);
      setSupplierPayments(sp);
      setAdjustments(a);
      setReconciliation(r);
      setCustomerInvoices(ci);
      setSupplierInvoices(si);
      setCustomerAdvances(ca);
      setSupplierAdvances(sa);
      setBankAccounts(ba);
      setTaxCodes(taxes);
      setVouchers(vo);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load finance records.",
      );
    }
  }, [booking.id, hasPermission]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function action(
    path: string,
    method: "POST" | "PATCH",
    body?: unknown,
    success = "Finance record updated.",
  ) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      setMessage(success);
      await Promise.all([load(), onChanged()]);
      return true;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to update finance record.",
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
    reset: () => void,
  ) {
    event.preventDefault();
    if (await action(path, "POST", body)) reset();
  }
  if (!hasPermission("finance.view")) return null;
  return (
    <section className="mt-6 rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
            Finance
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Financial Summary & Reconciliation
          </h2>
        </div>
        {!reconciliation &&
          hasPermission("finance.reconcile") &&
          canEditClosed && (
            <button
              disabled={saving}
              onClick={() =>
                void action(
                  `/bookings/${booking.id}/reconciliation/start`,
                  "POST",
                  undefined,
                  "Reconciliation started.",
                )
              }
              className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Start Reconciliation
            </button>
          )}
      </div>
      {message && (
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {summary && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Selling Price", summary.sellingPrice],
            ["Supplier Cost", summary.supplierCost],
            ["Passenger Payments", summary.passengerPaymentsReceived],
            ["Supplier Payments", summary.supplierPaymentsMade],
            ["Fees", summary.fees],
            ["Discounts", summary.discounts],
            ["Refunds", summary.refunds],
            ["Adjustments", summary.adjustments],
            ["Passenger Balance", summary.passengerBalance],
            ["Supplier Balance", summary.supplierBalance],
            ["Expected Profit", summary.expectedProfit],
            ["Customer Invoiced", summary.invoicedAmount],
            ["Customer Advances", summary.customerAdvances],
            ["Customer Outstanding", summary.customerOutstanding],
            ["Supplier Invoiced", summary.supplierInvoiceAmount],
            ["Supplier Advances", summary.supplierAdvances],
            ["Supplier Outstanding", summary.supplierOutstanding],
            ["Gross Profit", summary.grossProfit],
            ["Gross Margin %", summary.grossMargin],
            ["Recorded Surcharge", summary.surcharge ?? "Not recorded"],
            ["Recorded Initial Profit", summary.initialProfit ?? "Not recorded"],
            ["Recorded Balanced Profit (TBI)", summary.balancedProfit ?? "Not recorded"],
            ["Recorded Total Profit", summary.totalProfit ?? "Not recorded"],
            ["Recorded Admin Profit", summary.adminProfit ?? "Not recorded"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs uppercase text-slate-500">{label}</dt>
              <dd className="mt-1 font-semibold">
                {label === "Gross Margin %"
                  ? `${value}%`
                  : value === "Not recorded"
                    ? "Not recorded"
                    : `${summary.currency} ${value}`}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {hasPermission("finance.adjustment.create") && canEditClosed && (
        <details className="mt-5 rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold text-violet-700">
            Record Surcharge / Recorded Profit Values
          </summary>
          <form
            onSubmit={(event) => event.preventDefault()}
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[
              ["surcharge", "Surcharge"],
              ["initialProfit", "Initial Profit"],
              ["balancedProfit", "Balanced Profit (TBI)"],
              ["totalProfit", "Total Profit"],
              ["adminProfit", "Admin Profit"],
            ].map(([key, label]) => (
              <input
                key={key}
                type="number"
                step="0.01"
                placeholder={label}
                value={recordedValues[key as keyof typeof recordedValues]}
                onChange={(event) =>
                  setRecordedValues({
                    ...recordedValues,
                    [key]: event.target.value,
                  })
                }
                className={input}
              />
            ))}
            <input
              placeholder="Reason / notes"
              value={recordedValues.reason}
              onChange={(event) =>
                setRecordedValues({
                  ...recordedValues,
                  reason: event.target.value,
                })
              }
              className={input}
            />
            <button
              type="button"
              onClick={() =>
                void action(
                  `/bookings/${booking.id}/recorded-financial-values`,
                  "PATCH",
                  {
                    surcharge: recordedValues.surcharge || undefined,
                    initialProfit: recordedValues.initialProfit || undefined,
                    balancedProfit: recordedValues.balancedProfit || undefined,
                    totalProfit: recordedValues.totalProfit || undefined,
                    adminProfit: recordedValues.adminProfit || undefined,
                    reason: recordedValues.reason || undefined,
                  },
                  "Recorded financial values updated.",
                )
              }
              className="rounded-xl bg-violet-700 px-4 py-2.5 text-white"
            >
              Record Values
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            These values are recorded only; the system does not calculate or
            allocate them.
          </p>
        </details>
      )}
      {vouchers.length > 0 && (
        <div className="mt-5 rounded-xl border p-4">
          <p className="font-semibold text-slate-800">Financial Vouchers</p>
          <div className="mt-3 grid gap-3">
            {vouchers.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="font-semibold">
                  {item.voucherNumber
                    ? `${item.voucherReference} · ${item.voucherNumber}`
                    : item.voucherReference}
                </div>
                <div className="mt-1 text-slate-600">
                  {new Date(item.transactionDate).toLocaleDateString("en-GB")} ·{" "}
                  {item.status} · {item.entries.length} entry(s)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasPermission("finance.edit") && canEditClosed && (
        <details className="mt-5 rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold text-violet-700">
            Record Financial Voucher
          </summary>
          <form
            onSubmit={(event) => event.preventDefault()}
            className="mt-3 grid gap-3 sm:grid-cols-3"
          >
            <input
              required
              placeholder="Voucher reference"
              value={voucher.voucherReference}
              onChange={(event) =>
                setVoucher({
                  ...voucher,
                  voucherReference: event.target.value,
                })
              }
              className={input}
            />
            <input
              placeholder="Voucher number"
              value={voucher.voucherNumber}
              onChange={(event) =>
                setVoucher({ ...voucher, voucherNumber: event.target.value })
              }
              className={input}
            />
            <input
              required
              type="date"
              value={voucher.transactionDate}
              onChange={(event) =>
                setVoucher({
                  ...voucher,
                  transactionDate: event.target.value,
                })
              }
              className={input}
            />
            <input
              placeholder="Notes"
              value={voucher.notes}
              onChange={(event) =>
                setVoucher({ ...voucher, notes: event.target.value })
              }
              className={input}
            />
            <button
              type="button"
              onClick={() =>
                void action(
                  `/bookings/${booking.id}/vouchers`,
                  "POST",
                  {
                    voucherReference: voucher.voucherReference,
                    voucherNumber: voucher.voucherNumber || undefined,
                    transactionDate: voucher.transactionDate,
                    notes: voucher.notes || undefined,
                    entries: [],
                  },
                  "Financial voucher recorded.",
                )
              }
              className="rounded-xl bg-violet-700 px-4 py-2.5 text-white"
            >
              Record Voucher
            </button>
          </form>
        </details>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <FinanceBlock title="Customer Invoices / AR">
          {customerInvoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
          {hasPermission("finance.edit") && canEditClosed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold text-violet-700">
                Create Customer Invoice
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(
                    e,
                    `/bookings/${booking.id}/customer-invoices`,
                    {
                      ...customerInvoice,
                      dueDate: customerInvoice.dueDate || undefined,
                      netAmount: customerInvoice.taxCodeId
                        ? customerInvoice.netAmount
                        : undefined,
                      taxCodeId: customerInvoice.taxCodeId || undefined,
                    },
                    () =>
                      setCustomerInvoice({
                        ...customerInvoice,
                        invoiceNumber: "",
                      }),
                  )
                }
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <input
                  required
                  placeholder="Invoice number"
                  value={customerInvoice.invoiceNumber}
                  onChange={(e) =>
                    setCustomerInvoice({
                      ...customerInvoice,
                      invoiceNumber: e.target.value,
                    })
                  }
                  className={input}
                />
                <input
                  required={Boolean(customerInvoice.taxCodeId)}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Net before tax"
                  value={customerInvoice.netAmount}
                  onChange={(e) =>
                    setCustomerInvoice({
                      ...customerInvoice,
                      netAmount: e.target.value,
                    })
                  }
                  className={input}
                />
                <select
                  value={customerInvoice.taxCodeId}
                  onChange={(e) =>
                    setCustomerInvoice({
                      ...customerInvoice,
                      taxCodeId: e.target.value,
                    })
                  }
                  className={input}
                >
                  <option value="">No output tax</option>
                  {taxCodes
                    .filter(
                      (code) =>
                        code.isActive && code.classification === "OUTPUT",
                    )
                    .map((code) => (
                      <option key={code.id} value={code.id}>
                        {code.code} · {code.rate}%
                      </option>
                    ))}
                </select>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Total"
                  value={customerInvoice.totalAmount}
                  onChange={(e) =>
                    setCustomerInvoice({
                      ...customerInvoice,
                      totalAmount: e.target.value,
                    })
                  }
                  className={input}
                />
                <input
                  required
                  type="date"
                  value={customerInvoice.invoiceDate}
                  onChange={(e) =>
                    setCustomerInvoice({
                      ...customerInvoice,
                      invoiceDate: e.target.value,
                    })
                  }
                  className={input}
                />
                <input
                  type="date"
                  value={customerInvoice.dueDate}
                  onChange={(e) =>
                    setCustomerInvoice({
                      ...customerInvoice,
                      dueDate: e.target.value,
                    })
                  }
                  className={input}
                />
                <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-white">
                  Create
                </button>
              </form>
            </details>
          )}
        </FinanceBlock>
        <FinanceBlock title="Supplier Invoices / AP">
          {supplierInvoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
          {hasPermission("finance.edit") &&
            canEditClosed &&
            booking.suppliers.length > 0 && (
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold text-violet-700">
                  Create Supplier Invoice
                </summary>
                <form
                  onSubmit={(e) =>
                    void submit(
                      e,
                      `/bookings/${booking.id}/supplier-invoices`,
                      {
                        ...supplierInvoice,
                        dueDate: supplierInvoice.dueDate || undefined,
                        netAmount: supplierInvoice.taxCodeId
                          ? supplierInvoice.netAmount
                          : undefined,
                        taxCodeId: supplierInvoice.taxCodeId || undefined,
                      },
                      () =>
                        setSupplierInvoice({
                          ...supplierInvoice,
                          invoiceNumber: "",
                          totalAmount: "",
                        }),
                    )
                  }
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <select
                    value={supplierInvoice.bookingSupplierId}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        bookingSupplierId: e.target.value,
                      })
                    }
                    className={input}
                  >
                    {booking.suppliers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.supplier.name}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Invoice number"
                    value={supplierInvoice.invoiceNumber}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        invoiceNumber: e.target.value,
                      })
                    }
                    className={input}
                  />
                  <input
                    required={Boolean(supplierInvoice.taxCodeId)}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Net before tax"
                    value={supplierInvoice.netAmount}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        netAmount: e.target.value,
                      })
                    }
                    className={input}
                  />
                  <select
                    value={supplierInvoice.taxCodeId}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        taxCodeId: e.target.value,
                      })
                    }
                    className={input}
                  >
                    <option value="">No input tax</option>
                    {taxCodes
                      .filter(
                        (code) =>
                          code.isActive && code.classification === "INPUT",
                      )
                      .map((code) => (
                        <option key={code.id} value={code.id}>
                          {code.code} · {code.rate}%
                        </option>
                      ))}
                  </select>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Total"
                    value={supplierInvoice.totalAmount}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        totalAmount: e.target.value,
                      })
                    }
                    className={input}
                  />
                  <input
                    required
                    type="date"
                    value={supplierInvoice.invoiceDate}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        invoiceDate: e.target.value,
                      })
                    }
                    className={input}
                  />
                  <input
                    type="date"
                    value={supplierInvoice.dueDate}
                    onChange={(e) =>
                      setSupplierInvoice({
                        ...supplierInvoice,
                        dueDate: e.target.value,
                      })
                    }
                    className={input}
                  />
                  <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-white">
                    Create
                  </button>
                </form>
              </details>
            )}
        </FinanceBlock>
        <FinanceBlock title="Customer Advances">
          {customerAdvances.map((advance) => (
            <AdvanceRow
              key={advance.id}
              advance={advance}
              allocate={
                hasPermission("finance.edit") && canEditClosed
                  ? () => {
                      const invoiceId = window.prompt("Customer invoice UUID");
                      const amount = window.prompt("Amount to allocate");
                      if (invoiceId && amount)
                        void action(
                          `/customer-advances/${advance.id}/allocations`,
                          "POST",
                          { invoiceId, amount },
                          "Advance allocated.",
                        );
                    }
                  : undefined
              }
            />
          ))}
          {hasPermission("finance.edit") && canEditClosed && (
            <AdvanceForm
              value={customerAdvance}
              setValue={setCustomerAdvance}
              bankAccounts={bankAccounts}
              submit={(e) =>
                void submit(
                  e,
                  `/bookings/${booking.id}/customer-advances`,
                  {
                    ...customerAdvance,
                    companyBankAccountId:
                      customerAdvance.companyBankAccountId || undefined,
                  },
                  () =>
                    setCustomerAdvance({
                      ...customerAdvance,
                      amount: "",
                      paymentReference: "",
                    }),
                )
              }
            />
          )}
        </FinanceBlock>
        <FinanceBlock title="Supplier Advances">
          {supplierAdvances.map((advance) => (
            <AdvanceRow
              key={advance.id}
              advance={advance}
              allocate={
                hasPermission("finance.edit") && canEditClosed
                  ? () => {
                      const invoiceId = window.prompt("Supplier invoice UUID");
                      const amount = window.prompt("Amount to allocate");
                      if (invoiceId && amount)
                        void action(
                          `/supplier-advances/${advance.id}/allocations`,
                          "POST",
                          { invoiceId, amount },
                          "Advance allocated.",
                        );
                    }
                  : undefined
              }
            />
          ))}
          {hasPermission("finance.edit") &&
            canEditClosed &&
            booking.suppliers.length > 0 && (
              <AdvanceForm
                value={supplierAdvance}
                setValue={setSupplierAdvance}
                suppliers={booking.suppliers}
                bankAccounts={bankAccounts}
                submit={(e) =>
                  void submit(
                    e,
                    `/bookings/${booking.id}/supplier-advances`,
                    {
                      ...supplierAdvance,
                      companyBankAccountId:
                        supplierAdvance.companyBankAccountId || undefined,
                    },
                    () =>
                      setSupplierAdvance({
                        ...supplierAdvance,
                        amount: "",
                        paymentReference: "",
                      }),
                  )
                }
              />
            )}
        </FinanceBlock>
        <FinanceBlock title="Passenger Payments">
          {passengerPayments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              verify={
                hasPermission("finance.payment.verify") &&
                canEditClosed &&
                p.status !== "VERIFIED"
                  ? () =>
                      action(
                        `/passenger-payments/${p.id}/verify`,
                        "POST",
                        undefined,
                        "Passenger payment verified.",
                      )
                  : undefined
              }
            />
          ))}
          {hasPermission("finance.payment.create") && canEditClosed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold text-violet-700">
                Add Payment
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(
                    e,
                    `/bookings/${booking.id}/passenger-payments`,
                    {
                      ...passenger,
                      customerInvoiceId:
                        passenger.customerInvoiceId || undefined,
                      companyBankAccountId:
                        passenger.companyBankAccountId || undefined,
                      dueDate: passenger.dueDate || undefined,
                      recordedGbpAmount:
                        passenger.recordedGbpAmount || undefined,
                      recordedGbpRate:
                        passenger.recordedGbpRate || undefined,
                      transactionFee: passenger.transactionFee || undefined,
                      feeCurrency: passenger.transactionFee
                        ? passenger.feeCurrency
                        : undefined,
                      idempotencyKey: passenger.idempotencyKey || undefined,
                    },
                    () =>
                      setPassenger({
                        ...passenger,
                        amount: "",
                        paymentReference: "",
                        notes: "",
                      }),
                  )
                }
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <select
                  value={passenger.customerInvoiceId}
                  onChange={(e) =>
                    setPassenger({
                      ...passenger,
                      customerInvoiceId: e.target.value,
                    })
                  }
                  className={input}
                >
                  <option value="">Unallocated booking receipt</option>
                  {customerInvoices
                    .filter((invoice) =>
                      ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status),
                    )
                    .map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber}
                      </option>
                    ))}
                </select>
                {passenger.paymentMethod === "BANK_TRANSFER" && (
                  <select
                    required
                    value={passenger.companyBankAccountId}
                    onChange={(e) =>
                      setPassenger({
                        ...passenger,
                        companyBankAccountId: e.target.value,
                      })
                    }
                    className={input}
                  >
                    <option value="">Receiving bank account</option>
                    {bankAccounts
                      .filter(
                        (bank) =>
                          bank.currency === booking.currency && bank.isActive,
                      )
                      .map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.bankName} · {bank.accountName} ·{" "}
                          {bank.maskedAccountNumber}
                        </option>
                      ))}
                  </select>
                )}
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount"
                  value={passenger.amount}
                  onChange={(e) =>
                    setPassenger({ ...passenger, amount: e.target.value })
                  }
                  className={input}
                />
                <select
                  value={passenger.paymentMethod}
                  onChange={(e) =>
                    setPassenger({
                      ...passenger,
                      paymentMethod: e.target.value,
                    })
                  }
                  className={input}
                >
                  {["BANK_TRANSFER", "CARD", "STRIPE_PAYMENT", "WISE", "WISE_CARD_PAYMENT", "CASH", "OTHER"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
                <input
                  required
                  type="date"
                  value={passenger.paymentDate}
                  onChange={(e) =>
                    setPassenger({ ...passenger, paymentDate: e.target.value })
                  }
                  className={input}
                />
                <input
                  type="date"
                  aria-label="Payment due date"
                  value={passenger.dueDate}
                  onChange={(event) =>
                    setPassenger({ ...passenger, dueDate: event.target.value })
                  }
                  className={input}
                />
                <input
                  placeholder="Reference"
                  value={passenger.paymentReference}
                  onChange={(e) =>
                    setPassenger({
                      ...passenger,
                      paymentReference: e.target.value,
                    })
                  }
                  className={input}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Recorded GBP equivalent"
                  value={passenger.recordedGbpAmount}
                  onChange={(event) =>
                    setPassenger({
                      ...passenger,
                      recordedGbpAmount: event.target.value,
                    })
                  }
                  className={input}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Transaction fee"
                  value={passenger.transactionFee}
                  onChange={(event) =>
                    setPassenger({
                      ...passenger,
                      transactionFee: event.target.value,
                    })
                  }
                  className={input}
                />
                <input
                  maxLength={3}
                  placeholder="Fee currency"
                  value={passenger.feeCurrency}
                  onChange={(event) =>
                    setPassenger({
                      ...passenger,
                      feeCurrency: event.target.value.toUpperCase(),
                    })
                  }
                  className={input}
                />
                <input
                  type="number"
                  min="0"
                  step="0.00000001"
                  placeholder="Recorded GBP rate"
                  value={passenger.recordedGbpRate}
                  onChange={(event) =>
                    setPassenger({
                      ...passenger,
                      recordedGbpRate: event.target.value,
                    })
                  }
                  className={input}
                />
                <div className="sm:col-span-2 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Funding Currency Breakdowns
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSupplier({
                          ...supplier,
                          fundingBreakdowns: [
                            ...supplier.fundingBreakdowns,
                            {
                              sourceAmount: "",
                              sourceCurrency: "GBP",
                              feeAmount: "",
                              feeCurrency: "GBP",
                              recordedConversionRate: "",
                              convertedAmount: "",
                              convertedCurrency: "GBP",
                              reference: "",
                              notes: "",
                            },
                          ],
                        })
                      }
                      className="text-xs font-semibold text-violet-700"
                    >
                      Add breakdown
                    </button>
                  </div>
                  {supplier.fundingBreakdowns.map((item, index) => (
                    <div
                      key={index}
                      className="mt-3 grid gap-2 sm:grid-cols-2"
                    >
                      {([
                        ["sourceAmount", "Source amount"],
                        ["sourceCurrency", "Source currency"],
                        ["feeAmount", "Fee amount"],
                        ["feeCurrency", "Fee currency"],
                        ["recordedConversionRate", "Recorded conversion rate"],
                        ["convertedAmount", "Converted amount"],
                        ["convertedCurrency", "Converted currency"],
                        ["reference", "Reference"],
                        ["notes", "Notes"],
                      ] as const).map(([key, label]) => (
                        <input
                          key={key}
                          value={item[key]}
                          placeholder={label}
                          onChange={(event) => {
                            const next = [...supplier.fundingBreakdowns];
                            next[index] = {
                              ...next[index],
                              [key]: event.target.value,
                            };
                            setSupplier({
                              ...supplier,
                              fundingBreakdowns: next,
                            });
                          }}
                          className={input}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-white">
                  Record
                </button>
              </form>
            </details>
          )}
        </FinanceBlock>
        <FinanceBlock title="Supplier Payments">
          {supplierPayments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              verify={
                hasPermission("finance.payment.verify") &&
                canEditClosed &&
                p.status !== "VERIFIED"
                  ? () =>
                      action(
                        `/supplier-payments/${p.id}/verify`,
                        "POST",
                        undefined,
                        "Supplier payment verified.",
                      )
                  : undefined
              }
            />
          ))}
          {hasPermission("finance.payment.create") &&
            canEditClosed &&
            booking.suppliers.length > 0 && (
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold text-violet-700">
                  Add Supplier Payment
                </summary>
                <form
                  onSubmit={(e) =>
                    void submit(
                      e,
                      `/bookings/${booking.id}/supplier-payments`,
                      {
                        ...supplier,
                        supplierInvoiceId:
                          supplier.supplierInvoiceId || undefined,
                        companyBankAccountId:
                          supplier.companyBankAccountId || undefined,
                        dueDate: supplier.dueDate || undefined,
                        recordedGbpAmount:
                          supplier.recordedGbpAmount || undefined,
                        recordedGbpRate:
                          supplier.recordedGbpRate || undefined,
                        transactionFee: supplier.transactionFee || undefined,
                        feeCurrency: supplier.transactionFee
                          ? supplier.feeCurrency
                          : undefined,
                        idempotencyKey: supplier.idempotencyKey || undefined,
                        fundingBreakdowns: supplier.fundingBreakdowns.map(
                          (item) => ({
                            ...item,
                            feeAmount: item.feeAmount || undefined,
                            feeCurrency: item.feeAmount
                              ? item.feeCurrency
                              : undefined,
                            recordedConversionRate:
                              item.recordedConversionRate || undefined,
                            convertedAmount:
                              item.convertedAmount || undefined,
                            convertedCurrency: item.convertedAmount
                              ? item.convertedCurrency
                              : undefined,
                            reference: item.reference || undefined,
                            notes: item.notes || undefined,
                          }),
                        ),
                      },
                      () =>
                        setSupplier({
                          ...supplier,
                          amount: "",
                          paymentReference: "",
                          notes: "",
                        }),
                    )
                  }
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <select
                    required
                    value={supplier.bookingSupplierId}
                    onChange={(e) =>
                      setSupplier({
                        ...supplier,
                        bookingSupplierId: e.target.value,
                      })
                    }
                    className={input}
                  >
                    {booking.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.supplier.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={supplier.paymentMethod}
                    onChange={(e) =>
                      setSupplier({
                        ...supplier,
                        paymentMethod: e.target.value,
                      })
                    }
                    className={input}
                  >
                    {["BANK_TRANSFER", "CARD", "STRIPE_PAYMENT", "WISE", "WISE_CARD_PAYMENT", "CASH", "OTHER"].map(
                      (method) => (
                        <option key={method}>{method}</option>
                      ),
                    )}
                  </select>
                  {supplier.paymentMethod === "BANK_TRANSFER" && (
                    <select
                      required
                      value={supplier.companyBankAccountId}
                      onChange={(e) =>
                        setSupplier({
                          ...supplier,
                          companyBankAccountId: e.target.value,
                        })
                      }
                      className={input}
                    >
                      <option value="">Paying bank account</option>
                      {bankAccounts
                        .filter(
                          (bank) =>
                            bank.currency === booking.currency && bank.isActive,
                        )
                        .map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bank.bankName} · {bank.accountName} ·{" "}
                            {bank.maskedAccountNumber}
                          </option>
                        ))}
                    </select>
                  )}
                  <select
                    value={supplier.supplierInvoiceId}
                    onChange={(e) =>
                      setSupplier({
                        ...supplier,
                        supplierInvoiceId: e.target.value,
                      })
                    }
                    className={input}
                  >
                    <option value="">Unallocated supplier payment</option>
                    {supplierInvoices
                      .filter((invoice) =>
                        ["APPROVED", "PARTIALLY_PAID"].includes(invoice.status),
                      )
                      .map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber}
                        </option>
                      ))}
                  </select>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Amount"
                    value={supplier.amount}
                    onChange={(e) =>
                      setSupplier({ ...supplier, amount: e.target.value })
                    }
                    className={input}
                  />
                  <input
                    required
                    type="date"
                    value={supplier.paymentDate}
                    onChange={(e) =>
                      setSupplier({ ...supplier, paymentDate: e.target.value })
                    }
                    className={input}
                  />
                  <input
                    type="date"
                    aria-label="Supplier payment due date"
                    value={supplier.dueDate}
                    onChange={(event) =>
                      setSupplier({ ...supplier, dueDate: event.target.value })
                    }
                    className={input}
                  />
                  <input
                    placeholder="Reference"
                    value={supplier.paymentReference}
                    onChange={(e) =>
                      setSupplier({
                        ...supplier,
                        paymentReference: e.target.value,
                      })
                    }
                    className={input}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Recorded GBP equivalent"
                    value={supplier.recordedGbpAmount}
                    onChange={(event) =>
                      setSupplier({
                        ...supplier,
                        recordedGbpAmount: event.target.value,
                      })
                    }
                    className={input}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Transaction fee"
                    value={supplier.transactionFee}
                    onChange={(event) =>
                      setSupplier({
                        ...supplier,
                        transactionFee: event.target.value,
                      })
                    }
                    className={input}
                  />
                  <input
                    maxLength={3}
                    placeholder="Fee currency"
                    value={supplier.feeCurrency}
                    onChange={(event) =>
                      setSupplier({
                        ...supplier,
                        feeCurrency: event.target.value.toUpperCase(),
                      })
                    }
                    className={input}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.00000001"
                    placeholder="Recorded GBP rate"
                    value={supplier.recordedGbpRate}
                    onChange={(event) =>
                      setSupplier({
                        ...supplier,
                        recordedGbpRate: event.target.value,
                      })
                    }
                    className={input}
                  />
                  <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-white">
                    Record
                  </button>
                </form>
              </details>
            )}
        </FinanceBlock>
        <FinanceBlock title="Adjustments">
          {adjustments.map((a) => (
            <article key={a.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <b>{a.type.replaceAll("_", " ")}</b>
                <span>
                  {a.currency} {a.amount}
                </span>
              </div>
              <p className="mt-1 text-slate-600">{a.reason}</p>
              {!a.approvedAt &&
                hasPermission("finance.adjustment.approve") &&
                canEditClosed && (
                  <button
                    onClick={() => {
                      if (!window.confirm("Approve this financial adjustment?"))
                        return;
                      void action(
                        `/booking-adjustments/${a.id}/approve`,
                        "POST",
                        undefined,
                        "Adjustment approved.",
                      );
                    }}
                    className="mt-2 font-semibold text-violet-700"
                  >
                    Approve
                  </button>
                )}
            </article>
          ))}
          {hasPermission("finance.adjustment.create") && canEditClosed && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold text-violet-700">
                Add Adjustment
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(
                    e,
                    `/bookings/${booking.id}/adjustments`,
                    adjustment,
                    () =>
                      setAdjustment({ ...adjustment, amount: "", reason: "" }),
                  )
                }
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <select
                  value={adjustment.type}
                  onChange={(e) =>
                    setAdjustment({ ...adjustment, type: e.target.value })
                  }
                  className={input}
                >
                  {[
                    "FEE",
                    "DISCOUNT",
                    "REFUND",
                    "MANUAL_ADJUSTMENT",
                    "OTHER",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={adjustment.amount}
                  placeholder="Amount"
                  onChange={(e) =>
                    setAdjustment({ ...adjustment, amount: e.target.value })
                  }
                  className={input}
                />
                <input
                  required
                  value={adjustment.reason}
                  placeholder="Reason"
                  onChange={(e) =>
                    setAdjustment({ ...adjustment, reason: e.target.value })
                  }
                  className={`${input} sm:col-span-2`}
                />
                <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-white">
                  Create
                </button>
              </form>
            </details>
          )}
        </FinanceBlock>
        <FinanceBlock
          title={`Reconciliation${reconciliation ? ` · ${reconciliation.status.replaceAll("_", " ")}` : ""}`}
        >
          {reconciliation ? (
            <>
              {flags.map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    disabled={
                      !hasPermission("finance.reconcile") || !canEditClosed
                    }
                    checked={reconciliation[key]}
                    onChange={(e) =>
                      void action(
                        `/bookings/${booking.id}/reconciliation`,
                        "PATCH",
                        { [key]: e.target.checked },
                        "Checklist updated.",
                      )
                    }
                  />
                </label>
              ))}
              {reconciliation.discrepancies.map((d) => (
                <article
                  key={d.id}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
                >
                  <b>
                    {d.type.replaceAll("_", " ")} · {d.status}
                  </b>
                  <p>{d.description}</p>
                  {(d.status === "OPEN" || d.status === "IN_PROGRESS") &&
                    hasPermission("finance.discrepancy.manage") &&
                    canEditClosed && (
                      <button
                        onClick={() => {
                          const notes = window.prompt("Resolution notes");
                          if (notes)
                            void action(
                              `/reconciliation-discrepancies/${d.id}/resolve`,
                              "POST",
                              { resolutionNotes: notes },
                              "Discrepancy resolved.",
                            );
                        }}
                        className="mt-2 font-semibold text-violet-700"
                      >
                        Resolve
                      </button>
                    )}
                </article>
              ))}
              <div className="flex flex-wrap gap-2">
                {hasPermission("finance.reconcile") && canEditClosed && (
                  <button
                    disabled={
                      saving ||
                      flags.some(([key]) => !reconciliation[key]) ||
                      reconciliation.discrepancies.some(
                        (d) =>
                          d.status === "OPEN" || d.status === "IN_PROGRESS",
                      )
                    }
                    onClick={() => {
                      if (
                        !window.confirm("Mark this booking fully reconciled?")
                      )
                        return;
                      void action(
                        `/bookings/${booking.id}/reconciliation/complete`,
                        "POST",
                        undefined,
                        "Booking reconciled.",
                      );
                    }}
                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Mark Reconciled
                  </button>
                )}
              </div>
              {hasPermission("finance.discrepancy.manage") && canEditClosed && (
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer font-semibold text-amber-700">
                    Flag Discrepancy
                  </summary>
                  <form
                    onSubmit={(e) =>
                      void submit(
                        e,
                        `/bookings/${booking.id}/reconciliation/discrepancies`,
                        {
                          ...discrepancy,
                          amountDifference:
                            discrepancy.amountDifference || undefined,
                          assignedUserId:
                            discrepancy.assignedUserId || undefined,
                        },
                        () =>
                          setDiscrepancy({
                            ...discrepancy,
                            description: "",
                            amountDifference: "",
                            assignedUserId: "",
                          }),
                      )
                    }
                    className="mt-3 grid gap-3"
                  >
                    <select
                      value={discrepancy.type}
                      onChange={(e) =>
                        setDiscrepancy({ ...discrepancy, type: e.target.value })
                      }
                      className={input}
                    >
                      {[
                        "PASSENGER_PAYMENT_MISMATCH",
                        "SUPPLIER_COST_MISMATCH",
                        "SUPPLIER_PAYMENT_MISMATCH",
                        "SELLING_PRICE_MISMATCH",
                        "MISSING_PAYMENT",
                        "UNEXPLAINED_AMOUNT",
                        "OTHER",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <textarea
                      required
                      placeholder="Description"
                      value={discrepancy.description}
                      onChange={(e) =>
                        setDiscrepancy({
                          ...discrepancy,
                          description: e.target.value,
                        })
                      }
                      className={input}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount difference (optional)"
                      value={discrepancy.amountDifference}
                      onChange={(e) =>
                        setDiscrepancy({
                          ...discrepancy,
                          amountDifference: e.target.value,
                        })
                      }
                      className={input}
                    />
                    <input
                      placeholder="Assigned user UUID (optional)"
                      value={discrepancy.assignedUserId}
                      onChange={(e) =>
                        setDiscrepancy({
                          ...discrepancy,
                          assignedUserId: e.target.value,
                        })
                      }
                      className={input}
                    />
                    <button className="rounded-xl bg-amber-600 px-4 py-2.5 text-white">
                      Flag
                    </button>
                  </form>
                </details>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Start reconciliation to use the checklist.
            </p>
          )}
        </FinanceBlock>
      </div>
    </section>
  );
}

function FinanceBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: FinanceInvoice }) {
  return (
    <article className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex justify-between gap-2">
        <b>{invoice.invoiceNumber}</b>
        <span>
          {invoice.currency} {invoice.totalAmount}
        </span>
      </div>
      <p className="mt-1 text-slate-600">
        {invoice.status.replaceAll("_", " ")} · paid {invoice.amountPaid} ·
        outstanding {invoice.outstanding}
      </p>
      <p className="mt-1 break-all text-xs text-slate-400">{invoice.id}</p>
    </article>
  );
}

function AdvanceRow({
  advance,
  allocate,
}: {
  advance: FinanceAdvance;
  allocate?: () => void;
}) {
  return (
    <article className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex justify-between gap-2">
        <b>{advance.supplier?.name ?? "Customer advance"}</b>
        <span>
          {advance.currency} {advance.originalAmount}
        </span>
      </div>
      <p className="mt-1 text-slate-600">
        Allocated {advance.allocatedAmount} · remaining{" "}
        {advance.remainingAmount}
      </p>
      {allocate && advance.remainingAmount !== "0" && (
        <button
          type="button"
          onClick={allocate}
          className="mt-2 text-xs font-semibold text-violet-700"
        >
          Allocate
        </button>
      )}
    </article>
  );
}

type AdvanceFormValue = {
  bookingSupplierId?: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  paymentDate: string;
  companyBankAccountId: string;
};
function AdvanceForm<T extends AdvanceFormValue>({
  value,
  setValue,
  submit,
  suppliers,
  bankAccounts,
}: {
  value: T;
  setValue: (value: T) => void;
  submit: (event: FormEvent) => void;
  suppliers?: BookingDetail["suppliers"];
  bankAccounts: BankAccount[];
}) {
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-semibold text-violet-700">
        Record Advance
      </summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        {suppliers && (
          <select
            required
            value={value.bookingSupplierId}
            onChange={(e) =>
              setValue({ ...value, bookingSupplierId: e.target.value })
            }
            className={input}
          >
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.supplier.name}
              </option>
            ))}
          </select>
        )}
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Amount"
          value={value.amount}
          onChange={(e) => setValue({ ...value, amount: e.target.value })}
          className={input}
        />
        <select
          value={value.paymentMethod}
          onChange={(e) =>
            setValue({ ...value, paymentMethod: e.target.value })
          }
          className={input}
        >
          {["BANK_TRANSFER", "CARD", "CASH", "WISE", "OTHER"].map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
        {value.paymentMethod === "BANK_TRANSFER" && (
          <select
            value={value.companyBankAccountId}
            onChange={(e) =>
              setValue({ ...value, companyBankAccountId: e.target.value })
            }
            className={input}
          >
            <option value="">Payment clearing account</option>
            {bankAccounts
              .filter((account) => account.currency === value.currency)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} · {account.accountName}
                </option>
              ))}
          </select>
        )}
        <input
          required
          type="date"
          value={value.paymentDate}
          onChange={(e) => setValue({ ...value, paymentDate: e.target.value })}
          className={input}
        />
        <input
          placeholder="Reference"
          value={value.paymentReference}
          onChange={(e) =>
            setValue({ ...value, paymentReference: e.target.value })
          }
          className={input}
        />
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-white">
          Record
        </button>
      </form>
    </details>
  );
}
function PaymentRow({
  payment,
  verify,
}: {
  payment: Payment;
  verify?: () => void;
}) {
  return (
    <article className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <b>
          {payment.bookingSupplier?.supplier.name ??
            payment.paymentMethod?.replaceAll("_", " ") ??
            "Payment"}
        </b>
        <span>
          {payment.currency} {payment.amount}
        </span>
      </div>
      <p className="mt-1 text-slate-600">
        {new Date(payment.paymentDate).toLocaleDateString("en-GB")} ·{" "}
        {payment.paymentReference || "No reference"} · {payment.status}
      </p>
      {(payment.recordedGbpAmount || payment.recordedGbpRate) && (
        <p className="mt-1 text-xs text-slate-500">
          Historical GBP: {payment.recordedGbpAmount ?? "—"}
          {payment.recordedGbpRate
            ? ` at recorded rate ${payment.recordedGbpRate}`
            : ""}
        </p>
      )}
      {payment.transactionFee && (
        <p className="mt-1 text-xs text-slate-500">
          Transaction fee: {payment.feeCurrency ?? payment.currency}{" "}
          {payment.transactionFee}
        </p>
      )}
      {!!payment.fundingBreakdowns?.length && (
        <details className="mt-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">
            Funding breakdown ({payment.fundingBreakdowns.length})
          </summary>
          {payment.fundingBreakdowns.map((funding) => (
            <p key={funding.id} className="mt-1">
              {funding.sourceCurrency} {funding.sourceAmount}
              {funding.convertedAmount
                ? ` → ${funding.convertedCurrency ?? ""} ${funding.convertedAmount}`
                : ""}
              {funding.feeAmount
                ? ` · Fee ${funding.feeCurrency ?? funding.sourceCurrency} ${funding.feeAmount}`
                : ""}
            </p>
          ))}
        </details>
      )}
      {payment.verifiedBy && (
        <p className="mt-1 text-xs text-slate-500">
          Verified by {payment.verifiedBy.firstName}{" "}
          {payment.verifiedBy.lastName}
        </p>
      )}
      {verify && (
        <button
          onClick={verify}
          className="mt-2 text-xs font-semibold text-violet-700"
        >
          Verify
        </button>
      )}
    </article>
  );
}
