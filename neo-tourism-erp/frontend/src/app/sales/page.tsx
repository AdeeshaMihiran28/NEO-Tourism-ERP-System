import { ModuleFunctions } from "@/components/module-hub";
import { SalesDashboard } from "@/components/sales-dashboard";

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-700">
            Sales CRM
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Sales Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Live leads, pipeline progress, follow-ups and attention items.
          </p>
        </header>
        <SalesDashboard />
      </main>
      <ModuleFunctions
        items={[
        { title: "Live New Leads", description: "Review and claim new enquiries.", href: "/leads/live", permissions: ["lead.view"] },
        { title: "My Pipeline", description: "Manage assigned leads and their progress.", href: "/leads/pipeline", permissions: ["lead.view"] },
        { title: "Attention Leads", description: "Handle overdue callbacks and leads needing action.", href: "/leads/attention", permissions: ["lead.attention.view"] },
        { title: "Sale Submissions", description: "Prepare and track sale handovers to administration.", href: "/sales/submissions", permissions: ["sale.view_own"] },
        { title: "Approved Offers", description: "Use approved Marketing offers with customers.", href: "/sales/offers", permissions: ["marketing.deal.sales_view"] },
        { title: "Marketing Signal", description: "Share customer demand and market insights.", href: "/sales/marketing-signals", permissions: ["marketing.sales_signal.create"] },
        { title: "Customers", description: "Search and manage Customer 360 records.", href: "/customers", permissions: ["customer.view"] },
        ]}
      />
    </>
  );
}
