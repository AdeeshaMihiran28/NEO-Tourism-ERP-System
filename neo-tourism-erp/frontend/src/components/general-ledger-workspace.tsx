"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api/client";
import type { BankAccount } from "@/types/banking";
import type {
  AccountingMapping,
  GlAccount,
  JournalEntry,
  LedgerRow,
  TrialBalance,
} from "@/types/general-ledger";

type Mode = "accounts" | "journals" | "ledger" | "trial";
const input = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const button =
  "rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white";

export function GeneralLedgerWorkspace({ mode }: { mode: Mode }) {
  const { hasPermission } = useAuth();
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [mappings, setMappings] = useState<AccountingMapping[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [message, setMessage] = useState("");
  const [dates, setDates] = useState({ dateFrom: "", dateTo: "" });
  const [ledgerAccountId, setLedgerAccountId] = useState("");

  const load = useCallback(async () => {
    const accountRows = await apiFetch<GlAccount[]>(
      "/accounting/chart-of-accounts",
    );
    setAccounts(accountRows);
    if (mode === "accounts") {
      const [mappingRows, bankRows] = await Promise.all([
        apiFetch<AccountingMapping[]>("/accounting/mappings"),
        hasPermission("bank.account.view")
          ? apiFetch<BankAccount[]>("/banking/accounts?activeOnly=false")
          : Promise.resolve([]),
      ]);
      setMappings(mappingRows);
      setBanks(bankRows);
    }
    if (mode === "journals")
      setJournals(await apiFetch<JournalEntry[]>("/accounting/journals"));
    if (mode === "ledger")
      setLedgerRows(await apiFetch<LedgerRow[]>("/accounting/general-ledger"));
    if (mode === "trial")
      setTrial(await apiFetch<TrialBalance>("/accounting/trial-balance"));
  }, [hasPermission, mode]);

  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((error: Error) => setMessage(error.message));
  }, [load]);

  const mutate = async (path: string, method = "POST", body?: unknown) => {
    try {
      await apiFetch(path, {
        method,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      setMessage("Saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
          Finance
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          {mode === "accounts"
            ? "Chart of Accounts"
            : mode === "journals"
              ? "Journal Entries"
              : mode === "ledger"
                ? "General Ledger"
                : "Trial Balance"}
        </h1>
        {message && <p className="mt-2 text-sm text-violet-700">{message}</p>}
      </header>
      {mode === "accounts" && (
        <ChartOfAccounts
          accounts={accounts}
          mappings={mappings}
          banks={banks}
          canManage={hasPermission("gl.account.manage")}
          mutate={mutate}
        />
      )}
      {mode === "journals" && (
        <Journals
          accounts={accounts.filter((account) => account.isActive)}
          journals={journals}
          hasPermission={hasPermission}
          mutate={mutate}
        />
      )}
      {mode === "ledger" && (
        <Ledger
          accounts={accounts}
          rows={ledgerRows}
          dates={dates}
          setDates={setDates}
          accountId={ledgerAccountId}
          setAccountId={setLedgerAccountId}
          search={async () => {
            const query = new URLSearchParams();
            if (ledgerAccountId) query.set("accountId", ledgerAccountId);
            if (dates.dateFrom) query.set("dateFrom", dates.dateFrom);
            if (dates.dateTo) query.set("dateTo", dates.dateTo);
            setLedgerRows(
              await apiFetch<LedgerRow[]>(
                `/accounting/general-ledger?${query}`,
              ),
            );
          }}
        />
      )}
      {mode === "trial" && (
        <Trial
          trial={trial}
          dates={dates}
          setDates={setDates}
          search={async () => {
            const query = new URLSearchParams();
            if (dates.dateFrom) query.set("dateFrom", dates.dateFrom);
            if (dates.dateTo) query.set("dateTo", dates.dateTo);
            setTrial(
              await apiFetch<TrialBalance>(
                `/accounting/trial-balance?${query}`,
              ),
            );
          }}
        />
      )}
    </main>
  );
}

function ChartOfAccounts({
  accounts,
  mappings,
  banks,
  canManage,
  mutate,
}: {
  accounts: GlAccount[];
  mappings: AccountingMapping[];
  banks: BankAccount[];
  canManage: boolean;
  mutate: (path: string, method?: string, body?: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState({ code: "", name: "", type: "ASSET" });
  const active = accounts.filter((account) => account.isActive);
  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Panel title="Accounts">
        {canManage && (
          <form
            className="grid gap-2 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate("/accounting/chart-of-accounts", "POST", form).then(
                () => setForm({ ...form, code: "", name: "" }),
              );
            }}
          >
            <input
              required
              className={input}
              placeholder="Code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <input
              required
              className={input}
              placeholder="Account name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className={input}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
            <button className={button}>Create</button>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2">Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b">
                  <td className="p-2 font-mono">{account.code}</td>
                  <td>{account.name}</td>
                  <td>{account.type}</td>
                  <td>{account.isActive ? "Active" : "Inactive"}</td>
                  <td className="space-x-2 text-right">
                    {canManage && (
                      <button
                        className="text-violet-700"
                        onClick={() => {
                          const name = window.prompt(
                            "Account name",
                            account.name,
                          );
                          if (name)
                            void mutate(
                              `/accounting/chart-of-accounts/${account.id}`,
                              "PATCH",
                              { name },
                            );
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {canManage && (
                      <button
                        className="text-violet-700"
                        onClick={() =>
                          void mutate(
                            `/accounting/chart-of-accounts/${account.id}`,
                            "PATCH",
                            { isActive: !account.isActive },
                          )
                        }
                      >
                        {account.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel title="Posting mappings">
          {mappings.map((mapping) => (
            <label
              key={mapping.type}
              className="block text-xs font-semibold text-slate-600"
            >
              {mapping.type.replaceAll("_", " ")}
              <select
                disabled={!canManage}
                className={`${input} mt-1 w-full`}
                value={mapping.accountId}
                onChange={(e) =>
                  void mutate(`/accounting/mappings/${mapping.type}`, "PATCH", {
                    accountId: e.target.value,
                  })
                }
              >
                {active.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} · {account.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </Panel>
        {!!banks.length && (
          <Panel title="Bank GL mappings">
            {banks.map((bank) => (
              <label
                key={bank.id}
                className="block text-xs font-semibold text-slate-600"
              >
                {bank.bankName} · {bank.maskedAccountNumber}
                <select
                  disabled={!canManage}
                  className={`${input} mt-1 w-full`}
                  value={bank.glAccountId ?? ""}
                  onChange={(e) =>
                    void mutate(`/banking/accounts/${bank.id}`, "PATCH", {
                      glAccountId: e.target.value,
                    })
                  }
                >
                  <option value="">Select asset account</option>
                  {active
                    .filter((account) => account.type === "ASSET")
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}

function Journals({
  accounts,
  journals,
  hasPermission,
  mutate,
}: {
  accounts: GlAccount[];
  journals: JournalEntry[];
  hasPermission: (permission: string) => boolean;
  mutate: (path: string, method?: string, body?: unknown) => Promise<void>;
}) {
  const blank = { accountId: "", debit: "0", credit: "0", description: "" };
  const [form, setForm] = useState({
    journalDate: new Date().toISOString().slice(0, 10),
    description: "",
    currency: "LKR",
    lines: [{ ...blank }, { ...blank }],
  });
  const totals = useMemo(
    () =>
      form.lines.reduce(
        (value, line) => ({
          debit: value.debit + Number(line.debit || 0),
          credit: value.credit + Number(line.credit || 0),
        }),
        { debit: 0, credit: 0 },
      ),
    [form.lines],
  );
  const updateLine = (index: number, field: string, value: string) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  return (
    <div className="space-y-6">
      {hasPermission("journal.create") && (
        <Panel title="New manual journal">
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void mutate("/accounting/journals", "POST", form).then(() =>
                setForm({
                  ...form,
                  description: "",
                  lines: [{ ...blank }, { ...blank }],
                }),
              );
            }}
            className="space-y-3"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                required
                type="date"
                className={input}
                value={form.journalDate}
                onChange={(e) =>
                  setForm({ ...form, journalDate: e.target.value })
                }
              />
              <input
                required
                className={input}
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
              <input
                required
                className={input}
                maxLength={3}
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value.toUpperCase() })
                }
              />
            </div>
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-4">
                <select
                  required
                  className={input}
                  value={line.accountId}
                  onChange={(e) =>
                    updateLine(index, "accountId", e.target.value)
                  }
                >
                  <option value="">Account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={input}
                  placeholder="Debit"
                  value={line.debit}
                  onChange={(e) => updateLine(index, "debit", e.target.value)}
                />
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={input}
                  placeholder="Credit"
                  value={line.credit}
                  onChange={(e) => updateLine(index, "credit", e.target.value)}
                />
                <input
                  className={input}
                  placeholder="Line description"
                  value={line.description}
                  onChange={(e) =>
                    updateLine(index, "description", e.target.value)
                  }
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                className="text-violet-700"
                onClick={() =>
                  setForm({ ...form, lines: [...form.lines, { ...blank }] })
                }
              >
                + Add line
              </button>
              <b>Debit {totals.debit.toFixed(2)}</b>
              <b>Credit {totals.credit.toFixed(2)}</b>
              <button className={button}>Save draft</button>
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Journal history">
        {journals.map((journal) => (
          <article
            key={journal.id}
            className="rounded-xl border border-slate-200 p-4 text-sm"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <b>{journal.journalNumber}</b> · {journal.description}
                <p className="text-xs text-slate-500">
                  {new Date(journal.journalDate).toLocaleDateString("en-GB")} ·{" "}
                  {journal.sourceType}
                  {journal.sourceRecordId ? ` · ${journal.sourceRecordId}` : ""}
                  {journal.booking ? ` · ${journal.booking.folderNumber}` : ""}
                </p>
              </div>
              <b>{journal.status}</b>
            </div>
            <div className="mt-2 grid gap-1">
              {journal.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-4"
                >
                  <span>
                    {line.account.code} · {line.account.name}
                  </span>
                  <span>Dr {line.debit}</span>
                  <span>Cr {line.credit}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              {journal.status === "DRAFT" &&
                hasPermission("journal.approve") && (
                  <button
                    className="text-violet-700"
                    onClick={() =>
                      void mutate(`/accounting/journals/${journal.id}/approve`)
                    }
                  >
                    Approve
                  </button>
                )}
              {journal.status === "DRAFT" &&
                hasPermission("journal.approve") && (
                  <button
                    className="text-red-700"
                    onClick={() => {
                      const reason = window.prompt("Rejection reason");
                      if (reason)
                        void mutate(
                          `/accounting/journals/${journal.id}/reject`,
                          "POST",
                          { reason },
                        );
                    }}
                  >
                    Reject
                  </button>
                )}
              {journal.status === "APPROVED" &&
                hasPermission("journal.post") && (
                  <button
                    className="text-emerald-700"
                    onClick={() =>
                      void mutate(`/accounting/journals/${journal.id}/post`)
                    }
                  >
                    Post
                  </button>
                )}
              {journal.status === "POSTED" &&
                hasPermission("journal.reverse") && (
                  <button
                    className="text-red-700"
                    onClick={() => {
                      const reason = window.prompt("Reversal reason");
                      if (reason)
                        void mutate(
                          `/accounting/journals/${journal.id}/reverse`,
                          "POST",
                          { reason },
                        );
                    }}
                  >
                    Reverse
                  </button>
                )}
            </div>
          </article>
        ))}
      </Panel>
    </div>
  );
}

function Ledger({
  accounts,
  rows,
  dates,
  setDates,
  accountId,
  setAccountId,
  search,
}: {
  accounts: GlAccount[];
  rows: LedgerRow[];
  dates: { dateFrom: string; dateTo: string };
  setDates: (value: { dateFrom: string; dateTo: string }) => void;
  accountId: string;
  setAccountId: (value: string) => void;
  search: () => Promise<void>;
}) {
  return (
    <Panel title="Posted ledger activity">
      <Filters
        accounts={accounts}
        dates={dates}
        setDates={setDates}
        accountId={accountId}
        setAccountId={setAccountId}
        search={search}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="p-2">Date / Journal</th>
              <th>Account</th>
              <th>Description</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">
                  {new Date(row.date).toLocaleDateString("en-GB")}
                  <br />
                  <span className="font-mono text-xs">{row.journalNumber}</span>
                </td>
                <td>
                  {row.account.code} · {row.account.name}
                </td>
                <td>
                  {row.description}
                  <br />
                  <span className="text-xs text-slate-500">
                    {row.sourceType}
                  </span>
                </td>
                <td>{row.debit}</td>
                <td>{row.credit}</td>
                <td>{row.runningBalance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Trial({
  trial,
  dates,
  setDates,
  search,
}: {
  trial: TrialBalance | null;
  dates: { dateFrom: string; dateTo: string };
  setDates: (value: { dateFrom: string; dateTo: string }) => void;
  search: () => Promise<void>;
}) {
  return (
    <Panel title="Posted trial balance">
      <Filters
        accounts={[]}
        dates={dates}
        setDates={setDates}
        accountId=""
        setAccountId={() => undefined}
        search={search}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="p-2">Code</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Closing balance</th>
            </tr>
          </thead>
          <tbody>
            {trial?.data.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2 font-mono">{row.code}</td>
                <td>{row.name}</td>
                <td>{row.totalDebit}</td>
                <td>{row.totalCredit}</td>
                <td>{row.closingBalance}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="p-2" colSpan={2}>
                TOTAL
              </td>
              <td>{trial?.totalDebit ?? "0"}</td>
              <td>{trial?.totalCredit ?? "0"}</td>
              <td>Difference {trial?.difference ?? "0"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

function Filters({
  accounts,
  dates,
  setDates,
  accountId,
  setAccountId,
  search,
}: {
  accounts: GlAccount[];
  dates: { dateFrom: string; dateTo: string };
  setDates: (value: { dateFrom: string; dateTo: string }) => void;
  accountId: string;
  setAccountId: (value: string) => void;
  search: () => Promise<void>;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {!!accounts.length && (
        <select
          className={input}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} · {account.name}
            </option>
          ))}
        </select>
      )}
      <input
        type="date"
        className={input}
        value={dates.dateFrom}
        onChange={(e) => setDates({ ...dates, dateFrom: e.target.value })}
      />
      <input
        type="date"
        className={input}
        value={dates.dateTo}
        onChange={(e) => setDates({ ...dates, dateTo: e.target.value })}
      />
      <button className={button} onClick={() => void search()}>
        Apply
      </button>
    </div>
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
    <section className="space-y-3 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
