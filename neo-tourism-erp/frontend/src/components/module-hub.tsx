"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";

export type ModuleHubItem = {
  title: string;
  description: string;
  href: string;
  permissions: string[];
};

type ModuleHubAccent = "cyan" | "emerald" | "violet" | "amber";

const accentStyles: Record<ModuleHubAccent, string> = {
  cyan: "text-cyan-700 group-hover:text-cyan-800",
  emerald: "text-emerald-700 group-hover:text-emerald-800",
  violet: "text-violet-700 group-hover:text-violet-800",
  amber: "text-amber-700 group-hover:text-amber-800",
};

export function ModuleHub({
  eyebrow,
  title,
  description,
  items,
  accent = "cyan",
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: ModuleHubItem[];
  accent?: ModuleHubAccent;
}) {
  const styles = accentStyles[accent];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="max-w-3xl">
        <p className={`text-sm font-bold uppercase tracking-[0.18em] ${styles}`}>
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
      </header>

      <ModuleHubCards title={title} items={items} accent={accent} />
    </main>
  );
}

export function ModuleHubCards({
  title,
  items,
  accent = "cyan",
}: {
  title: string;
  items: ModuleHubItem[];
  accent?: ModuleHubAccent;
}) {
  const { hasPermission } = useAuth();
  const visibleItems = items.filter((item) =>
    item.permissions.some(hasPermission),
  );
  const styles = accentStyles[accent];

  if (!visibleItems.length) {
    return (
      <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Your account does not currently have access to functions in this
        module.
      </p>
    );
  }

  return (
    <section
      aria-label={`${title} functions`}
      className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {visibleItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
            </div>
            <span aria-hidden="true" className={`text-xl ${styles}`}>
              →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

export function ModuleFunctions({
  items,
  accent = "cyan",
  description = "Open another workspace. Available functions are based on your role.",
}: {
  items: ModuleHubItem[];
  accent?: ModuleHubAccent;
  description?: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-12 sm:px-8">
      <div className="border-t border-slate-200 pt-8">
        <h2 className="text-2xl font-semibold text-slate-950">Functions</h2>
        <p className="mt-2 text-slate-600">{description}</p>
      </div>
      <ModuleHubCards title="Module" items={items} accent={accent} />
    </section>
  );
}
