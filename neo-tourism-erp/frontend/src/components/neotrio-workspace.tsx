"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { Character, Idea, Metrics, Production } from "@/types/neotrio";
type View =
  "home" | "ideas" | "production" | "vault" | "library" | "performance";
const links: [string, string][] = [
  ["Ideas", "/marketing/neotrio/ideas"],
  ["In Production", "/marketing/neotrio/production"],
  ["Character Vault", "/marketing/neotrio/vault"],
  ["Neo Library", "/marketing/neotrio/library"],
  ["Neo Performance", "/marketing/neotrio/performance"],
];
export function NeoTrioWorkspace({ view }: { view: View }) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const path =
        view === "home"
          ? "/marketing/neotrio"
          : view === "production"
            ? "/marketing/neotrio/production/board"
            : `/marketing/neotrio/${view}`;
      setData(await apiFetch(path));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load NEO STUDIO.");
    }
  }, [view]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <main className="px-5 py-8 sm:px-8">
      <header className="rounded-3xl bg-gradient-to-br from-violet-950 via-fuchsia-900 to-amber-500 p-7 text-white">
        <p className="text-xs font-bold uppercase tracking-[.28em]">
          NEO STUDIO
        </p>
        <h1 className="mt-2 text-4xl font-black">{title(view)}</h1>
        <p className="mt-2 text-white/80">
          Ricky <span aria-hidden>•</span> Flip <span aria-hidden>•</span> Oli
        </p>
        <nav className="mt-6 flex flex-wrap gap-2">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {error && (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      {!data && !error && (
        <p className="mt-8 text-slate-500">Loading Studio…</p>
      )}
      {Boolean(data) && <ViewData view={view} data={data} reload={load} />}
    </main>
  );
}
function ViewData({
  view,
  data,
  reload,
}: {
  view: View;
  data: unknown;
  reload: () => Promise<void>;
}) {
  if (view === "home")
    return (
      <Home
        data={data as Record<string, Record<string, number> | Character[]>}
      />
    );
  if (view === "ideas")
    return <Ideas response={data as { data: Idea[] }} reload={reload} />;
  if (view === "production")
    return (
      <Board board={data as Record<string, Production[]>} reload={reload} />
    );
  if (view === "vault") return <Vault characters={data as Character[]} />;
  if (view === "library")
    return (
      <Library
        response={
          data as {
            data: Array<{
              id: string;
              title: string;
              libraryType: string;
              publishedAt: string;
              production: Production;
              performance: Metrics;
            }>;
          }
        }
      />
    );
  return <Performance data={data as Record<string, unknown>} />;
}
function Home({
  data,
}: {
  data: Record<string, Record<string, number> | Character[]>;
}) {
  const ideas = data.ideas as Record<string, number>,
    prod = data.production as Record<string, number>,
    lib = data.library as Record<string, number>;
  return (
    <div className="mt-7 grid gap-4 md:grid-cols-3">
      {[
        [
          "IDEAS",
          `New ${ideas.new} · Shortlisted ${ideas.shortlisted} · Ready ${ideas.readyToProduce}`,
          "/marketing/neotrio/ideas",
        ],
        [
          "IN PRODUCTION",
          `Script ${prod.script} · Production ${prod.production} · Review ${prod.review} · Ready ${prod.ready}`,
          "/marketing/neotrio/production",
        ],
        [
          "NEO LIBRARY",
          `This month ${lib.publishedThisMonth} · Total ${lib.totalPublished}`,
          "/marketing/neotrio/library",
        ],
      ].map(([a, b, c]) => (
        <Link
          href={c}
          key={a}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="font-black text-fuchsia-800">{a}</h2>
          <p className="mt-3 text-sm text-slate-600">{b}</p>
        </Link>
      ))}
    </div>
  );
}
function Ideas({
  response,
  reload,
}: {
  response: { data: Idea[] };
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    try {
      await apiFetch("/marketing/neotrio/ideas", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          ideaType: form.get("ideaType"),
          priority: form.get("priority"),
          destination: form.get("destination") || undefined,
        }),
      });
      setOpen(false);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-7">
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(!open)}
          className="rounded-xl bg-fuchsia-700 px-4 py-2 font-semibold text-white"
        >
          Add Idea
        </button>
      </div>
      {open && (
        <form
          action={submit}
          className="mt-4 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2"
        >
          <input
            name="title"
            required
            placeholder="Idea title"
            className="rounded-xl border p-3"
          />
          <select name="ideaType" className="rounded-xl border p-3">
            <option>TRAVEL_IDEA</option>
            <option>JOKE</option>
            <option>TREND</option>
            <option>REEL</option>
            <option>MEME</option>
          </select>
          <textarea
            name="description"
            required
            placeholder="Description / concept"
            className="rounded-xl border p-3 md:col-span-2"
          />
          <input
            name="destination"
            placeholder="Destination (optional)"
            className="rounded-xl border p-3"
          />
          <select name="priority" className="rounded-xl border p-3">
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>URGENT</option>
            <option>LOW</option>
          </select>
          <button
            disabled={busy}
            className="rounded-xl bg-slate-950 p-3 text-white md:col-span-2"
          >
            {busy ? "Saving…" : "Create Idea"}
          </button>
        </form>
      )}
      <div className="mt-5 overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              {[
                "Idea",
                "Type",
                "Characters",
                "Destination",
                "Campaign",
                "Owner",
                "Priority",
                "Status",
                "Created",
              ].map((x) => (
                <th className="p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {response.data.map((x) => (
              <tr className="border-t" key={x.id}>
                <td className="p-3 font-semibold">
                  {x.title}
                  <small className="block text-slate-400">{x.ideaCode}</small>
                </td>
                <td className="p-3">{x.ideaType}</td>
                <td className="p-3">{names(x.characters)}</td>
                <td className="p-3">{x.destination || "—"}</td>
                <td className="p-3">{x.campaign?.name || "—"}</td>
                <td className="p-3">
                  {x.assignedUser
                    ? `${x.assignedUser.firstName} ${x.assignedUser.lastName}`
                    : "—"}
                </td>
                <td className="p-3">{x.priority}</td>
                <td className="p-3">{x.status}</td>
                <td className="p-3">
                  {new Date(x.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Board({
  board,
  reload,
}: {
  board: Record<string, Production[]>;
  reload: () => Promise<void>;
}) {
  const stages = [
    "IDEA",
    "SCRIPT",
    "PRODUCTION",
    "REVIEW",
    "READY",
    "PUBLISHED",
  ];
  async function move(x: Production) {
    const next: { [key: string]: string } = {
      IDEA: "SCRIPT",
      SCRIPT: "PRODUCTION",
      PRODUCTION: "REVIEW",
    };
    if (next[x.stage]) {
      await apiFetch(`/marketing/neotrio/production/${x.id}/stage`, {
        method: "POST",
        body: JSON.stringify({ stage: next[x.stage] }),
      });
      await reload();
    }
  }
  return (
    <div className="mt-7 grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
      {stages.map((stage) => (
        <section
          key={stage}
          className="min-h-52 rounded-2xl bg-slate-200/70 p-3"
        >
          <h2 className="px-2 py-2 text-xs font-black tracking-wider">
            {stage}
          </h2>
          {(board[stage] || []).map((x) => (
            <article
              key={x.id}
              className="mt-2 rounded-xl bg-white p-4 shadow-sm"
            >
              <p className="font-bold">{x.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {x.productionType} · {names(x.characters)}
              </p>
              <p className="mt-2 text-xs">
                {x.deadline
                  ? `Due ${new Date(x.deadline).toLocaleDateString()}`
                  : "No deadline"}
              </p>
              {["IDEA", "SCRIPT", "PRODUCTION"].includes(stage) && (
                <button
                  onClick={() => void move(x)}
                  className="mt-3 text-xs font-bold text-fuchsia-700"
                >
                  Move forward →
                </button>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
function Vault({ characters }: { characters: Character[] }) {
  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-3">
      {characters.map((x) => (
        <article
          className="overflow-hidden rounded-3xl border bg-white shadow-sm"
          key={x.id}
        >
          <div className="bg-gradient-to-r from-fuchsia-700 to-amber-400 p-6 text-white">
            <p className="text-xs font-bold">{x.code}</p>
            <h2 className="text-3xl font-black">{x.name}</h2>
          </div>
          <div className="space-y-4 p-6">
            {[
              ["Overview", x.shortDescription],
              ["Personality", x.personality],
              ["Appearance", x.appearanceGuidelines],
              ["Voice / Style", x.voiceStyleGuidelines],
              ["Guidelines", x.generalGuidelines],
            ].map(([a, b]) => (
              <section key={a}>
                <h3 className="text-xs font-black uppercase text-slate-500">
                  {a}
                </h3>
                <p className="mt-1 text-sm">{b || "Not configured yet"}</p>
              </section>
            ))}
            <section>
              <h3 className="text-xs font-black uppercase text-slate-500">
                Approved assets & version history
              </h3>
              <p className="mt-1 text-sm">
                {(x.officialAssets || x.assets || []).length} official
                reference(s)
              </p>
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}
function Library({
  response,
}: {
  response: {
    data: Array<{
      id: string;
      title: string;
      libraryType: string;
      publishedAt: string;
      production: Production;
      performance: Metrics;
    }>;
  };
}) {
  return (
    <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {response.data.map((x) => (
        <article key={x.id} className="rounded-2xl border bg-white p-5">
          <div className="aspect-video rounded-xl bg-gradient-to-br from-slate-900 to-fuchsia-800" />
          <h2 className="mt-4 font-bold">{x.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {x.libraryType} · {names(x.production.characters)}
          </p>
          <p className="mt-3 text-xs">
            Published {new Date(x.publishedAt).toLocaleDateString()}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            {x.performance.enquiries} enquiries · {x.performance.sales} sales ·{" "}
            {x.performance.bookings} bookings
          </p>
        </article>
      ))}
    </div>
  );
}
function Performance({ data }: { data: Record<string, unknown> }) {
  const summary = data.summary as Record<string, { label: string } | null>;
  const groups = [
    ["Character Performance", data.characterPerformance],
    ["Exact Character Combination Performance", data.combinationPerformance],
    ["Series Performance", data.seriesPerformance],
    ["Format Performance", data.formatPerformance],
  ] as [string, unknown][];
  return (
    <section className="mt-7">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Most Published Character", summary.mostPublishedCharacter],
          ["Top Combination by Sales", summary.topCharacterCombinationBySales],
          ["Top Series by Sales", summary.topSeriesBySales],
          ["Top Format by Enquiries", summary.topContentFormatByEnquiries],
        ].map(([label, value]) => (
          <div
            className="rounded-2xl border bg-white p-5"
            key={label as string}
          >
            <p className="text-xs font-bold uppercase text-slate-500">
              {label as string}
            </p>
            <p className="mt-2 text-xl font-black">
              {(value as { label: string } | null)?.label || "Not enough data"}
            </p>
          </div>
        ))}
      </div>
      {groups.map(([label, value]) => (
        <MetricTable key={label} label={label} value={value} />
      ))}
      <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        {(data.externalEngagement as { message?: string })?.message ||
          "External metrics are shown only when verified provider data is available."}
      </p>
    </section>
  );
}
function MetricTable({ label, value }: { label: string; value: unknown }) {
  const rows = Array.isArray(value)
    ? value
    : (value as { rows?: unknown[] })?.rows || [];
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border bg-white">
      <h2 className="p-4 font-black">{label}</h2>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            {[
              "Name",
              "Content",
              "Enquiries",
              "Sales",
              "Bookings",
              "Sales Contribution",
            ].map((x) => (
              <th className="p-3 text-left" key={x}>
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows as Array<Record<string, unknown>>).map((x) => (
            <tr className="border-t" key={String(x.id)}>
              <td className="p-3 font-semibold">{String(x.label)}</td>
              {[
                "publishedContent",
                "enquiries",
                "sales",
                "bookings",
                "salesContribution",
              ].map((k) => (
                <td className="p-3" key={k}>
                  {String(x[k] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function names(items: { character: Character }[]) {
  return items.length
    ? items.map((x) => x.character.name).join(" + ")
    : "Not tagged";
}
function title(view: View) {
  return view === "home"
    ? "Creative Hub"
    : view === "vault"
      ? "CHARACTER VAULT — NeoTrio Brand References"
      : view === "library"
        ? "NEO LIBRARY — Published NeoTrio Content"
        : view === "performance"
          ? "NEO PERFORMANCE — NeoTrio Content Performance"
          : view === "production"
            ? "In Production"
            : "Ideas";
}
