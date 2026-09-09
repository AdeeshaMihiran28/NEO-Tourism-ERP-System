"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import type {
  BankAccount,
  BankStatement,
  BankTransaction,
  StatementDetail,
} from "@/types/banking";
import { useAuth } from "./auth-provider";

const input = "rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm";
const today = new Date().toISOString().slice(0, 10);

export function BankingWorkspace() {
  const { hasPermission } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bankForm, setBankForm] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    currency: "LKR",
    openingBalance: "0",
  });
  const [transactionForm, setTransactionForm] = useState({
    transactionDate: today,
    amount: "",
    direction: "DEBIT",
    sourceType: "BANK_CHARGE",
    reference: "",
    description: "",
  });
  const [transferForm, setTransferForm] = useState({
    destinationAccountId: "",
    transactionDate: today,
    amount: "",
    reference: "",
  });
  const [statementForm, setStatementForm] = useState({
    periodStart: today,
    periodEnd: today,
    openingBalance: "",
    closingBalance: "",
  });
  const [rowForm, setRowForm] = useState({
    transactionDate: today,
    description: "",
    reference: "",
    amount: "",
    direction: "CREDIT",
  });
  const accountId = account?.id;
  const statementId = statement?.id;

  const loadAccounts = useCallback(async () => {
    const values = await apiFetch<BankAccount[]>(
      "/banking/accounts?activeOnly=false",
    );
    setAccounts(values);
    setAccount((current) => current ?? values[0] ?? null);
  }, []);

  const loadAccount = useCallback(async () => {
    if (!accountId) return;
    const [detail, bankTransactions, bankStatements] = await Promise.all([
      apiFetch<BankAccount>(`/banking/accounts/${accountId}`),
      apiFetch<BankTransaction[]>(
        `/banking/accounts/${accountId}/transactions`,
      ),
      apiFetch<BankStatement[]>(`/banking/accounts/${accountId}/statements`),
    ]);
    setAccount(detail);
    setTransactions(bankTransactions);
    setStatements(bankStatements);
  }, [accountId]);

  const loadStatement = useCallback(async () => {
    if (statementId)
      setStatement(
        await apiFetch<StatementDetail>(`/banking/statements/${statementId}`),
      );
  }, [statementId]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts).catch(showError);
  }, [loadAccounts]);
  useEffect(() => {
    void Promise.resolve().then(loadAccount).catch(showError);
  }, [loadAccount]);

  function showError(caught: unknown) {
    setError(
      caught instanceof ApiError
        ? caught.message
        : "Unable to load banking records.",
    );
  }

  async function action(
    path: string,
    body?: unknown,
    success = "Banking record updated.",
  ) {
    setError("");
    setMessage("");
    try {
      await apiFetch(path, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setMessage(success);
      await Promise.all([loadAccounts(), loadAccount(), loadStatement()]);
      return true;
    } catch (caught) {
      showError(caught);
      return false;
    }
  }

  async function submit(
    event: FormEvent,
    path: string,
    body: unknown,
    reset: () => void,
    success?: string,
  ) {
    event.preventDefault();
    if (await action(path, body, success)) reset();
  }

  if (!hasPermission("bank.account.view")) return null;
  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
        Finance
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Banking & Reconciliation</h1>
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

      <section className="mt-6 grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Company Bank Accounts</h2>
          {accounts.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setAccount(item);
                setStatement(null);
              }}
              className={`w-full rounded-xl border p-3 text-left text-sm ${account?.id === item.id ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}
            >
              <b>{item.bankName}</b>
              <br />
              {item.accountName} · {item.maskedAccountNumber}
              <br />
              <span className="text-xs text-slate-500">
                {item.currency} · {item.isActive ? "Active" : "Inactive"}
              </span>
            </button>
          ))}
          {hasPermission("bank.account.manage") && (
            <details>
              <summary className="cursor-pointer font-semibold text-violet-700">
                Add account
              </summary>
              <form
                onSubmit={(e) =>
                  void submit(e, "/banking/accounts", bankForm, () =>
                    setBankForm({
                      ...bankForm,
                      bankName: "",
                      accountName: "",
                      accountNumber: "",
                    }),
                  )
                }
                className="mt-3 grid gap-2"
              >
                {(["bankName", "accountName", "accountNumber"] as const).map(
                  (key) => (
                    <input
                      key={key}
                      required
                      placeholder={key.replace(/([A-Z])/g, " $1")}
                      value={bankForm[key]}
                      onChange={(e) =>
                        setBankForm({ ...bankForm, [key]: e.target.value })
                      }
                      className={input}
                    />
                  ),
                )}
                <input
                  required
                  maxLength={3}
                  value={bankForm.currency}
                  onChange={(e) =>
                    setBankForm({
                      ...bankForm,
                      currency: e.target.value.toUpperCase(),
                    })
                  }
                  className={input}
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  value={bankForm.openingBalance}
                  onChange={(e) =>
                    setBankForm({ ...bankForm, openingBalance: e.target.value })
                  }
                  className={input}
                />
                <button className="rounded-xl bg-violet-700 px-3 py-2 text-white">
                  Create
                </button>
              </form>
            </details>
          )}
        </aside>

        {account && (
          <div className="space-y-5">
            <section className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {account.bankName} · {account.accountName}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {account.maskedAccountNumber}
                  </p>
                </div>
                <p className="text-right text-sm">
                  Calculated balance
                  <br />
                  <b className="text-xl">
                    {account.currency}{" "}
                    {account.calculatedBalance ?? account.openingBalance}
                  </b>
                </p>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Panel title="ERP Bank Transactions">
                <div className="max-h-96 space-y-2 overflow-auto">
                  {transactions.map((row) => (
                    <TransactionRow key={row.id} row={row} />
                  ))}
                </div>
                {hasPermission("bank.transaction.manage") && (
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold text-violet-700">
                      Bank charge / adjustment
                    </summary>
                    <form
                      onSubmit={(e) =>
                        void submit(
                          e,
                          `/banking/accounts/${account.id}/transactions`,
                          transactionForm,
                          () =>
                            setTransactionForm({
                              ...transactionForm,
                              amount: "",
                              reference: "",
                              description: "",
                            }),
                        )
                      }
                      className="mt-3 grid gap-2 sm:grid-cols-2"
                    >
                      <input
                        required
                        type="date"
                        value={transactionForm.transactionDate}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            transactionDate: e.target.value,
                          })
                        }
                        className={input}
                      />
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Amount"
                        value={transactionForm.amount}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            amount: e.target.value,
                          })
                        }
                        className={input}
                      />
                      <select
                        value={transactionForm.direction}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            direction: e.target.value,
                          })
                        }
                        className={input}
                      >
                        <option>CREDIT</option>
                        <option>DEBIT</option>
                      </select>
                      <select
                        value={transactionForm.sourceType}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            sourceType: e.target.value,
                          })
                        }
                        className={input}
                      >
                        <option>BANK_CHARGE</option>
                        <option>INTEREST</option>
                        <option>MANUAL_ADJUSTMENT</option>
                      </select>
                      <input
                        value={transactionForm.reference}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            reference: e.target.value,
                          })
                        }
                        placeholder="Reference"
                        className={input}
                      />
                      <input
                        required
                        value={transactionForm.description}
                        onChange={(e) =>
                          setTransactionForm({
                            ...transactionForm,
                            description: e.target.value,
                          })
                        }
                        placeholder="Reason / description"
                        className={input}
                      />
                      <button className="rounded-xl bg-violet-700 px-3 py-2 text-white">
                        Record
                      </button>
                    </form>
                  </details>
                )}
                {hasPermission("bank.transaction.manage") &&
                  accounts.length > 1 && (
                    <details className="rounded-xl border p-3">
                      <summary className="cursor-pointer font-semibold text-violet-700">
                        Internal transfer
                      </summary>
                      <form
                        onSubmit={(e) =>
                          void submit(
                            e,
                            "/banking/transfers",
                            { ...transferForm, sourceAccountId: account.id },
                            () =>
                              setTransferForm({
                                ...transferForm,
                                amount: "",
                                reference: "",
                              }),
                          )
                        }
                        className="mt-3 grid gap-2"
                      >
                        <select
                          required
                          value={transferForm.destinationAccountId}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              destinationAccountId: e.target.value,
                            })
                          }
                          className={input}
                        >
                          <option value="">Destination account</option>
                          {accounts
                            .filter(
                              (item) =>
                                item.id !== account.id &&
                                item.currency === account.currency &&
                                item.isActive,
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.bankName} · {item.accountName}
                              </option>
                            ))}
                        </select>
                        <input
                          required
                          type="date"
                          value={transferForm.transactionDate}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              transactionDate: e.target.value,
                            })
                          }
                          className={input}
                        />
                        <input
                          required
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Amount"
                          value={transferForm.amount}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              amount: e.target.value,
                            })
                          }
                          className={input}
                        />
                        <input
                          required
                          placeholder="Transfer reference"
                          value={transferForm.reference}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              reference: e.target.value,
                            })
                          }
                          className={input}
                        />
                        <button className="rounded-xl bg-violet-700 px-3 py-2 text-white">
                          Transfer
                        </button>
                      </form>
                    </details>
                  )}
              </Panel>

              <Panel title="Bank Statements">
                {statements.map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      void apiFetch<StatementDetail>(
                        `/banking/statements/${item.id}`,
                      )
                        .then(setStatement)
                        .catch(showError)
                    }
                    className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm"
                  >
                    <b>
                      {new Date(item.periodStart).toLocaleDateString("en-GB")} –{" "}
                      {new Date(item.periodEnd).toLocaleDateString("en-GB")}
                    </b>
                    <span className="float-right">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </button>
                ))}
                {hasPermission("bank.reconciliation.perform") && (
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold text-violet-700">
                      New statement
                    </summary>
                    <form
                      onSubmit={(e) =>
                        void submit(
                          e,
                          "/banking/statements",
                          {
                            ...statementForm,
                            companyBankAccountId: account.id,
                          },
                          () =>
                            setStatementForm({
                              ...statementForm,
                              openingBalance: "",
                              closingBalance: "",
                            }),
                        )
                      }
                      className="mt-3 grid gap-2 sm:grid-cols-2"
                    >
                      <input
                        required
                        type="date"
                        value={statementForm.periodStart}
                        onChange={(e) =>
                          setStatementForm({
                            ...statementForm,
                            periodStart: e.target.value,
                          })
                        }
                        className={input}
                      />
                      <input
                        required
                        type="date"
                        value={statementForm.periodEnd}
                        onChange={(e) =>
                          setStatementForm({
                            ...statementForm,
                            periodEnd: e.target.value,
                          })
                        }
                        className={input}
                      />
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="Opening balance"
                        value={statementForm.openingBalance}
                        onChange={(e) =>
                          setStatementForm({
                            ...statementForm,
                            openingBalance: e.target.value,
                          })
                        }
                        className={input}
                      />
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="Closing balance"
                        value={statementForm.closingBalance}
                        onChange={(e) =>
                          setStatementForm({
                            ...statementForm,
                            closingBalance: e.target.value,
                          })
                        }
                        className={input}
                      />
                      <button className="rounded-xl bg-violet-700 px-3 py-2 text-white">
                        Create
                      </button>
                    </form>
                  </details>
                )}
              </Panel>
            </section>

            {statement && (
              <Reconciliation
                statement={statement}
                account={account}
                canPerform={hasPermission("bank.reconciliation.perform")}
                canFinalize={hasPermission("bank.reconciliation.finalize")}
                rowForm={rowForm}
                setRowForm={setRowForm}
                submit={submit}
                action={action}
              />
            )}
          </div>
        )}
      </section>
    </main>
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
function TransactionRow({ row }: { row: BankTransaction }) {
  return (
    <article className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex justify-between gap-2">
        <b>{row.sourceType.replaceAll("_", " ")}</b>
        <span
          className={
            row.direction === "CREDIT" ? "text-emerald-700" : "text-red-700"
          }
        >
          {row.direction === "CREDIT" ? "+" : "−"}
          {row.currency} {row.amount}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {row.reference || "No reference"} · {row.reconciliationState}
        {row.booking ? ` · ${row.booking.folderNumber}` : ""}
      </p>
    </article>
  );
}

function Reconciliation({
  statement,
  account,
  canPerform,
  canFinalize,
  rowForm,
  setRowForm,
  submit,
  action,
}: {
  statement: StatementDetail;
  account: BankAccount;
  canPerform: boolean;
  canFinalize: boolean;
  rowForm: {
    transactionDate: string;
    description: string;
    reference: string;
    amount: string;
    direction: string;
  };
  setRowForm: (value: {
    transactionDate: string;
    description: string;
    reference: string;
    amount: string;
    direction: string;
  }) => void;
  submit: (
    event: FormEvent,
    path: string,
    body: unknown,
    reset: () => void,
    success?: string,
  ) => Promise<void>;
  action: (path: string, body?: unknown, success?: string) => Promise<boolean>;
}) {
  const summary = statement.summary;
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Statement Reconciliation</h2>
          <p className="text-sm text-slate-500">
            {statement.status.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex gap-2">
          {canPerform && statement.status !== "RECONCILED" && (
            <button
              onClick={() =>
                void action(
                  `/banking/statements/${statement.id}/auto-match`,
                  undefined,
                  "Exact matches applied.",
                )
              }
              className="rounded-xl border border-violet-300 px-3 py-2 text-sm"
            >
              Exact match
            </button>
          )}
          {canFinalize && statement.status !== "RECONCILED" && (
            <button
              onClick={() =>
                void action(
                  `/banking/statements/${statement.id}/finalize`,
                  undefined,
                  "Reconciliation finalized.",
                )
              }
              className="rounded-xl bg-emerald-700 px-3 py-2 text-sm text-white"
            >
              Finalize
            </button>
          )}
          {canFinalize && statement.status === "RECONCILED" && (
            <button
              onClick={() => {
                const reason = window.prompt("Reason for reopening");
                if (reason)
                  void action(
                    `/banking/statements/${statement.id}/reopen`,
                    { reason },
                    "Reconciliation reopened.",
                  );
              }}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Opening", summary.openingBalance],
          ["ERP opening", summary.erpOpeningBalance],
          ["ERP credits", summary.erpCredits],
          ["ERP debits", summary.erpDebits],
          ["ERP closing", summary.calculatedClosingBalance],
          ["Statement closing", summary.statementClosingBalance],
          ["Difference", summary.difference],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="font-semibold">
              {account.currency} {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="ERP transactions (left)">
          {summary.unmatchedErpTransactions.map((row) => (
            <TransactionRow key={row.id} row={row} />
          ))}
          {!summary.unmatchedErpTransactions.length && (
            <p className="text-sm text-slate-500">
              No unmatched ERP transactions.
            </p>
          )}
        </Panel>
        <Panel title="Statement transactions (right)">
          {statement.transactions.map((row) => {
            const candidate = summary.unmatchedErpTransactions.find(
              (erp) =>
                erp.amount === row.amount && erp.direction === row.direction,
            );
            const match = row.matches[0];
            return (
              <article
                key={row.id}
                className="rounded-xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex justify-between">
                  <b>{row.description}</b>
                  <span>
                    {row.direction} {row.amount}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {row.reference || "No reference"} · {row.matchingStatus}
                </p>
                {canPerform &&
                  statement.status !== "RECONCILED" &&
                  row.matchingStatus === "UNMATCHED" &&
                  candidate && (
                    <button
                      onClick={() =>
                        void action(
                          `/banking/statement-transactions/${row.id}/match`,
                          { erpBankTransactionId: candidate.id },
                          "Transaction matched.",
                        )
                      }
                      className="mt-2 text-xs font-semibold text-violet-700"
                    >
                      Match suggested ERP row
                    </button>
                  )}
                {canPerform && statement.status !== "RECONCILED" && match && (
                  <button
                    onClick={() => {
                      const reason = window.prompt("Reason for unmatching");
                      if (reason)
                        void action(
                          `/banking/matches/${match.id}/unmatch`,
                          { reason },
                          "Transaction unmatched.",
                        );
                    }}
                    className="mt-2 text-xs font-semibold text-red-700"
                  >
                    Unmatch
                  </button>
                )}
              </article>
            );
          })}
        </Panel>
      </div>
      {canPerform && statement.status !== "RECONCILED" && (
        <details className="mt-5 rounded-xl border p-3">
          <summary className="cursor-pointer font-semibold text-violet-700">
            Add statement transaction
          </summary>
          <form
            onSubmit={(e) =>
              void submit(
                e,
                `/banking/statements/${statement.id}/transactions/import`,
                {
                  rows: [
                    { ...rowForm, reference: rowForm.reference || undefined },
                  ],
                },
                () =>
                  setRowForm({
                    ...rowForm,
                    amount: "",
                    description: "",
                    reference: "",
                  }),
              )
            }
            className="mt-3 grid gap-2 sm:grid-cols-3"
          >
            <input
              required
              type="date"
              value={rowForm.transactionDate}
              onChange={(e) =>
                setRowForm({ ...rowForm, transactionDate: e.target.value })
              }
              className={input}
            />
            <select
              value={rowForm.direction}
              onChange={(e) =>
                setRowForm({ ...rowForm, direction: e.target.value })
              }
              className={input}
            >
              <option>CREDIT</option>
              <option>DEBIT</option>
            </select>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              value={rowForm.amount}
              onChange={(e) =>
                setRowForm({ ...rowForm, amount: e.target.value })
              }
              className={input}
            />
            <input
              required
              placeholder="Description"
              value={rowForm.description}
              onChange={(e) =>
                setRowForm({ ...rowForm, description: e.target.value })
              }
              className={input}
            />
            <input
              placeholder="Reference"
              value={rowForm.reference}
              onChange={(e) =>
                setRowForm({ ...rowForm, reference: e.target.value })
              }
              className={input}
            />
            <button className="rounded-xl bg-violet-700 px-3 py-2 text-white">
              Add row
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
