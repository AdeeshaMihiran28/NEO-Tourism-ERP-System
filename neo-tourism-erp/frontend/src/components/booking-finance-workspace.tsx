"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { BookingDetail } from "@/types/booking";
import type {
  Adjustment,
  FinancialSummary,
  Payment,
  Reconciliation,
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
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(
    null,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [passenger, setPassenger] = useState({
    amount: "",
    currency: booking.currency,
    paymentMethod: "BANK_TRANSFER",
    paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [supplier, setSupplier] = useState({
    bookingSupplierId: booking.suppliers[0]?.id ?? "",
    amount: "",
    currency: booking.currency,
    paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
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

  const load = useCallback(async () => {
    try {
      const [s, p, sp, a, r] = await Promise.all([
        apiFetch<FinancialSummary>(`/bookings/${booking.id}/financial-summary`),
        apiFetch<Payment[]>(`/bookings/${booking.id}/passenger-payments`),
        apiFetch<Payment[]>(`/bookings/${booking.id}/supplier-payments`),
        apiFetch<Adjustment[]>(`/bookings/${booking.id}/adjustments`),
        apiFetch<Reconciliation | null>(
          `/bookings/${booking.id}/reconciliation`,
        ),
      ]);
      setSummary(s);
      setPassengerPayments(p);
      setSupplierPayments(sp);
      setAdjustments(a);
      setReconciliation(r);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load finance records.",
      );
    }
  }, [booking.id]);
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
            Accounts
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Financial Summary & Reconciliation
          </h2>
        </div>
        {!reconciliation && hasPermission("finance.reconcile") && canEditClosed && (
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
            ["Adjustments", summary.adjustments],
            ["Passenger Balance", summary.passengerBalance],
            ["Supplier Balance", summary.supplierBalance],
            ["Expected Profit", summary.expectedProfit],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs uppercase text-slate-500">{label}</dt>
              <dd className="mt-1 font-semibold">
                {summary.currency} {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <FinanceBlock title="Passenger Payments">
          {passengerPayments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              verify={
                hasPermission("finance.payment.verify") && canEditClosed &&
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
                    passenger,
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
                  {["BANK_TRANSFER", "CARD", "CASH", "WISE", "OTHER"].map(
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
                hasPermission("finance.payment.verify") && canEditClosed &&
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
          {hasPermission("finance.payment.create") && canEditClosed &&
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
                      supplier,
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
              {!a.approvedAt && hasPermission("finance.adjustment.approve") && canEditClosed && (
                <button
                  onClick={() =>
                    void action(
                      `/booking-adjustments/${a.id}/approve`,
                      "POST",
                      undefined,
                      "Adjustment approved.",
                    )
                  }
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
                    disabled={!hasPermission("finance.reconcile") || !canEditClosed}
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
                    hasPermission("finance.discrepancy.manage") && canEditClosed && (
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
                    onClick={() =>
                      void action(
                        `/bookings/${booking.id}/reconciliation/complete`,
                        "POST",
                        undefined,
                        "Booking reconciled.",
                      )
                    }
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
