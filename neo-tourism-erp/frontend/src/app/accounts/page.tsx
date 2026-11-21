import { AccountsDashboard } from "@/components/accounts-dashboard";
import { ModuleFunctions } from "@/components/module-hub";

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
            Finance
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Finance Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Reconciliation workload, discrepancies and completed folders.
          </p>
        </header>
        <AccountsDashboard />
      </main>
      <ModuleFunctions
        accent="violet"
        items={[
          {
            title: "Chart of Accounts",
            description: "Manage GL accounts and automatic posting mappings.",
            href: "/accounts/chart-of-accounts",
            permissions: ["gl.account.view"],
          },
          {
            title: "Journal Entries",
            description:
              "Create, approve, post and reverse accounting journals.",
            href: "/accounts/journals",
            permissions: ["journal.view"],
          },
          {
            title: "General Ledger",
            description: "Trace posted debit and credit activity.",
            href: "/accounts/general-ledger",
            permissions: ["general-ledger.view"],
          },
          {
            title: "Trial Balance",
            description: "Verify posted debit and credit totals.",
            href: "/accounts/trial-balance",
            permissions: ["trial-balance.view"],
          },
          {
            title: "Banking & Reconciliation",
            description:
              "Manage company accounts, bank transactions, statements and matching.",
            href: "/accounts/banking",
            permissions: ["bank.account.view"],
          },
          {
            title: "Accounting Controls",
            description:
              "Configure exchange rates, tax codes and accounting periods.",
            href: "/accounts/accounting-controls",
            permissions: [
              "accounting.period.view",
              "fx.rate.view",
              "tax.code.view",
            ],
          },
          {
            title: "Financial Reports",
            description:
              "Run P&L, balance sheet, cash flow, ageing and tax reports.",
            href: "/accounts/reports",
            permissions: [
              "report.pnl.view",
              "report.balance-sheet.view",
              "report.cash-flow.view",
              "report.audit.view",
            ],
          },
          {
            title: "Reconciliation Queue",
            description: "Review folders waiting for financial reconciliation.",
            href: "/accounts/reconciliation",
            permissions: ["finance.view"],
          },
          {
            title: "Discrepancies",
            description: "Investigate and resolve financial differences.",
            href: "/accounts/discrepancies",
            permissions: ["finance.view"],
          },
          {
            title: "Reconciled Folders",
            description: "View folders with completed reconciliation.",
            href: "/accounts/reconciled",
            permissions: ["finance.view"],
          },
        ]}
      />
    </>
  );
}
