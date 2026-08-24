import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-5">
      <section className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">
          Not found
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          This ERP record or page is unavailable.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          It may have been removed, or your link may be out of date.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
