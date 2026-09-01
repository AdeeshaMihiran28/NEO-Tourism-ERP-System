import { AccountsDashboard } from "@/components/accounts-dashboard";
import { ModuleFunctions } from "@/components/module-hub";

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
            Accounts
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Accounts Dashboard
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
        { title: "Reconciliation Queue", description: "Review folders waiting for financial reconciliation.", href: "/accounts/reconciliation", permissions: ["finance.view"] },
        { title: "Discrepancies", description: "Investigate and resolve financial differences.", href: "/accounts/discrepancies", permissions: ["finance.view"] },
        { title: "Reconciled Folders", description: "View folders with completed reconciliation.", href: "/accounts/reconciled", permissions: ["finance.view"] },
        ]}
      />
    </>
  );
}
