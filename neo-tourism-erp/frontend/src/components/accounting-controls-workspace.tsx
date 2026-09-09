"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api/client";
import type { GlAccount } from "@/types/general-ledger";
import type {
  AccountingPeriod,
  ExchangeRate,
  ReportResult,
  TaxCode,
} from "@/types/accounting-controls";

const input = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const button =
  "rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function AccountingControlsWorkspace({
  reports = false,
}: {
  reports?: boolean;
}) {
  const { hasPermission } = useAuth();
  const [message, setMessage] = useState("");
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [reportPath, setReportPath] = useState("profit-and-loss");
  const [partyId, setPartyId] = useState("");
  const [dates, setDates] = useState({ dateFrom: "", dateTo: "", asOf: "" });

  const load = useCallback(async () => {
    if (reports) return;
    const [rateRows, taxRows, periodRows, accountRows] = await Promise.all([
      hasPermission("fx.rate.view")
        ? apiFetch<ExchangeRate[]>("/accounting/exchange-rates")
        : [],
      hasPermission("tax.code.view")
        ? apiFetch<TaxCode[]>("/accounting/tax-codes")
        : [],
      hasPermission("accounting.period.view")
        ? apiFetch<AccountingPeriod[]>("/accounting/periods")
        : [],
      hasPermission("gl.account.view")
        ? apiFetch<GlAccount[]>("/accounting/chart-of-accounts?activeOnly=true")
        : [],
    ]);
    setRates(rateRows);
    setTaxCodes(taxRows);
    setPeriods(periodRows);
    setAccounts(accountRows);
  }, [hasPermission, reports]);

  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((error: Error) => setMessage(error.message));
  }, [load]);

  const mutate = async (path: string, body?: unknown) => {
    try {
      await apiFetch(path, {
        method: "POST",
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      setMessage("Saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    }
  };

  const runReport = async () => {
    const query = new URLSearchParams();
    Object.entries(dates).forEach(
      ([key, value]) => value && query.set(key, value),
    );
    if (partyId) query.set("partyId", partyId);
    try {
      const path =
        reportPath === "booking-profitability"
          ? "/accounts/booking-profitability"
          : `/accounting/reports/${reportPath}?${query}`;
      setReport(await apiFetch<ReportResult>(path));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report failed.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
          Finance
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          {reports ? "Financial Reports" : "Accounting Controls"}
        </h1>
        {message && <p className="mt-2 text-sm text-violet-700">{message}</p>}
      </header>
      {reports ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap gap-3">
            <select
              className={input}
              value={reportPath}
              onChange={(event) => setReportPath(event.target.value)}
            >
              <option value="profit-and-loss">Profit &amp; Loss</option>
              <option value="balance-sheet">Balance Sheet</option>
              <option value="cash-flow">Direct Cash Flow &amp; Forecast</option>
              <option value="ar-ageing">Accounts Receivable Ageing</option>
              <option value="ap-ageing">Accounts Payable Ageing</option>
              <option value="tax-summary">Tax Summary</option>
              <option value="customer-statement">Customer Statement</option>
              <option value="supplier-statement">Supplier Statement</option>
              <option value="booking-profitability">
                Booking Profitability
              </option>
            </select>
            <input
              className={input}
              type="date"
              value={dates.dateFrom}
              onChange={(e) => setDates({ ...dates, dateFrom: e.target.value })}
              aria-label="From date"
            />
            <input
              className={input}
              type="date"
              value={dates.dateTo}
              onChange={(e) => setDates({ ...dates, dateTo: e.target.value })}
              aria-label="To date"
            />
            <input
              className={input}
              type="date"
              value={dates.asOf}
              onChange={(e) => setDates({ ...dates, asOf: e.target.value })}
              aria-label="As-of date"
            />
            {["customer-statement", "supplier-statement"].includes(
              reportPath,
            ) && (
              <input
                className={input}
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                placeholder="Customer or supplier UUID"
                aria-label="Party ID"
                required
              />
            )}
            <button className={button} onClick={runReport}>
              Run report
            </button>
          </div>
          <pre className="max-h-[36rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
            {report
              ? JSON.stringify(report, null, 2)
              : "Select dates and run a report."}
          </pre>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Rates
            rows={rates}
            canManage={hasPermission("fx.rate.manage")}
            mutate={mutate}
          />
          <Taxes
            rows={taxCodes}
            accounts={accounts}
            canManage={hasPermission("tax.code.manage")}
            mutate={mutate}
          />
          <Periods
            rows={periods}
            canManage={hasPermission("accounting.period.manage")}
            canClose={hasPermission("accounting.period.close")}
            canReopen={hasPermission("accounting.period.reopen")}
            mutate={mutate}
          />
        </div>
      )}
    </main>
  );
}

function Rates({
  rows,
  canManage,
  mutate,
}: {
  rows: ExchangeRate[];
  canManage: boolean;
  mutate: (path: string, body?: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState({
    fromCurrency: "USD",
    toCurrency: "LKR",
    rate: "",
    effectiveDate: "",
    source: "MANUAL",
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate("/accounting/exchange-rates", form);
  };
  return (
    <Panel title="Exchange rates">
      {canManage && (
        <form className="grid gap-2" onSubmit={submit}>
          {Object.entries(form).map(([key, value]) => (
            <input
              key={key}
              className={input}
              type={key === "effectiveDate" ? "date" : "text"}
              value={value}
              placeholder={key}
              aria-label={key}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required
            />
          ))}
          <button className={button}>Add rate</button>
        </form>
      )}
      <Rows
        rows={rows.map((row) => [
          row.effectiveDate.slice(0, 10),
          `${row.fromCurrency}/${row.toCurrency}`,
          row.rate,
          row.isActive ? "Active" : "Inactive",
        ])}
      />
    </Panel>
  );
}

function Taxes({
  rows,
  accounts,
  canManage,
  mutate,
}: {
  rows: TaxCode[];
  accounts: GlAccount[];
  canManage: boolean;
  mutate: (path: string, body?: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    rate: "",
    taxType: "VAT",
    classification: "OUTPUT",
    effectiveFrom: "",
    glAccountId: "",
    isRecoverable: false,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate("/accounting/tax-codes", form);
  };
  return (
    <Panel title="Tax codes">
      {canManage && (
        <form className="grid gap-2" onSubmit={submit}>
          {(["code", "name", "rate", "taxType"] as const).map((key) => (
            <input
              key={key}
              className={input}
              value={form[key]}
              placeholder={key}
              aria-label={key}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required
            />
          ))}
          <select
            className={input}
            value={form.classification}
            onChange={(e) =>
              setForm({ ...form, classification: e.target.value })
            }
          >
            <option>OUTPUT</option>
            <option>INPUT</option>
            <option>NONE</option>
          </select>
          <input
            className={input}
            type="date"
            value={form.effectiveFrom}
            onChange={(e) =>
              setForm({ ...form, effectiveFrom: e.target.value })
            }
            required
          />
          <select
            className={input}
            value={form.glAccountId}
            onChange={(e) => setForm({ ...form, glAccountId: e.target.value })}
          >
            <option value="">Tax GL account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
          <label className="text-sm">
            <input
              type="checkbox"
              checked={form.isRecoverable}
              onChange={(e) =>
                setForm({ ...form, isRecoverable: e.target.checked })
              }
            />{" "}
            Recoverable input tax
          </label>
          <button className={button}>Add tax code</button>
        </form>
      )}
      <Rows
        rows={rows.map((row) => [
          row.code,
          row.name,
          `${row.rate}%`,
          row.classification,
        ])}
      />
    </Panel>
  );
}

function Periods({
  rows,
  canManage,
  canClose,
  canReopen,
  mutate,
}: {
  rows: AccountingPeriod[];
  canManage: boolean;
  canClose: boolean;
  canReopen: boolean;
  mutate: (path: string, body?: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    fiscalYear: new Date().getFullYear(),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate("/accounting/periods", form);
  };
  return (
    <Panel title="Accounting periods">
      {canManage && (
        <form className="grid gap-2" onSubmit={submit}>
          <input
            className={input}
            value={form.name}
            placeholder="Period name"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className={input}
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            required
          />
          <input
            className={input}
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            required
          />
          <input
            className={input}
            type="number"
            value={form.fiscalYear}
            onChange={(e) =>
              setForm({ ...form, fiscalYear: Number(e.target.value) })
            }
            required
          />
          <button className={button}>Add period</button>
        </form>
      )}
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-200 p-3 text-sm"
          >
            <p className="font-semibold">
              {row.name} · {row.status}
            </p>
            <p>
              {row.startDate.slice(0, 10)} — {row.endDate.slice(0, 10)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {canClose && row.status === "OPEN" && (
                <button
                  className={button}
                  onClick={() =>
                    mutate(`/accounting/periods/${row.id}/start-closing`)
                  }
                >
                  Start close
                </button>
              )}
              {canClose && row.status === "CLOSING" && (
                <button
                  className={button}
                  onClick={() =>
                    mutate(`/accounting/periods/${row.id}/close`, {})
                  }
                >
                  Close
                </button>
              )}
              {canClose && row.status === "CLOSED" && (
                <button
                  className={button}
                  onClick={() => mutate(`/accounting/periods/${row.id}/lock`)}
                >
                  Lock
                </button>
              )}
              {canReopen && ["CLOSED", "LOCKED"].includes(row.status) && (
                <button
                  className={button}
                  onClick={() =>
                    mutate(`/accounting/periods/${row.id}/reopen`, {
                      reason: "Reopened from accounting controls",
                    })
                  }
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Rows({ rows }: { rows: string[][] }) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex flex-wrap gap-2 rounded-lg bg-slate-50 p-2 text-xs"
        >
          {row.map((cell, cellIndex) => (
            <span key={cellIndex}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
