const positive = new Set([
  "ACTIVE",
  "APPROVED",
  "AVAILABLE",
  "CLOSED",
  "COMPLETE",
  "COMPLETED",
  "CONNECTED",
  "FULFILLED",
  "RECONCILED",
  "RESOLVED",
  "VERIFIED",
]);

const negative = new Set([
  "CANCELLED",
  "DISABLED",
  "ERROR",
  "INACTIVE",
  "LOST",
  "MISSED",
  "REJECTED",
  "TERMINATED",
]);

const warning = new Set([
  "ACTION_REQUIRED",
  "DEGRADED",
  "IN_PROGRESS",
  "NOTICE_PERIOD",
  "ON_LEAVE",
  "OPEN",
  "PENDING",
  "URGENT",
  "WAITING_USER",
]);

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone = positive.has(normalized)
    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : negative.has(normalized)
      ? "bg-rose-50 text-rose-800 ring-rose-200"
      : warning.has(normalized)
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
