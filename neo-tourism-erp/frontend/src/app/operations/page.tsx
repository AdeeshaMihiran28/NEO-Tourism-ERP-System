import { LifecycleDashboard } from "@/components/lifecycle-dashboard";
import { ModuleFunctions } from "@/components/module-hub";

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
            Admin & Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Booking Operations Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Current travel, folder and operational lifecycle status.
          </p>
        </header>
        <LifecycleDashboard />
      </main>
      <ModuleFunctions
        accent="emerald"
        items={[
        { title: "New Sales", description: "Review and accept submitted sales for handover.", href: "/admin/sales", permissions: ["admin.sale_queue.view"] },
        { title: "Bookings", description: "Manage folders, passengers, suppliers, references and tasks.", href: "/bookings", permissions: ["booking.view"] },
        ]}
      />
    </>
  );
}
