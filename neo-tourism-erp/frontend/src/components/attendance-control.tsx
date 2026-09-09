"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AttendanceStatus } from "@/types/attendance";

export function AttendanceControl() {
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<AttendanceStatus>("/hr/attendance/status"));
      setLoadedAt(Date.now());
      setError("");
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const refresh = window.setInterval(() => void load(), 30000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [load]);

  async function act(path: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<AttendanceStatus>(path, { method: "POST" });
      setStatus({ ...result, eligible: true });
      setLoadedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Attendance action failed.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!status?.eligible) return null;

  const elapsed = Math.max(0, Math.floor((now - loadedAt) / 1000));
  const excess = status.excessBreakSeconds === null
    ? null
    : (status.excessBreakSeconds ?? 0) +
      (status.state === "ON_BREAK"
        ? Math.max(0, elapsed - (status.remainingBreakSeconds ?? 0))
        : 0);
  if (status.state === "NOT_CHECKED_IN") {
    return <AttendanceButton busy={busy} onClick={() => act("/hr/attendance/check-in")}>Check In</AttendanceButton>;
  }

  const checkedOut = status.state === "CHECKED_OUT";
  return (
    <div
      title={error || undefined}
      className={`flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs shadow-sm ${error ? "border-red-300" : "border-slate-200"}`}
    >
      <span className={checkedOut ? "text-emerald-700" : status.state === "ON_BREAK" ? "text-amber-600" : "text-emerald-600"}>
        {checkedOut ? "✓" : "●"}
      </span>
      <span className="whitespace-nowrap font-semibold text-slate-700">
        {checkedOut
          ? "Checked Out"
          : status.state === "ON_BREAK" ? "On Break" : "Working"}
      </span>
      {excess !== null && excess > 0 && (
        <span className="whitespace-nowrap font-semibold text-red-600">
          Break exceeded {formatTimer(excess)}
        </span>
      )}
      {checkedOut ? (
        <Action busy={busy} onClick={() => act("/hr/attendance/check-in")}>Check In</Action>
      ) : status.state === "ON_BREAK" ? (
        <Action busy={busy} onClick={() => act("/hr/attendance/break/end")}>Resume Work</Action>
      ) : (
        <Action busy={busy || !status.canStartBreak} onClick={() => act("/hr/attendance/break/start")}>Take Break</Action>
      )}
      {!checkedOut && <Action busy={busy} onClick={() => act("/hr/attendance/check-out")}>Check Out</Action>}
    </div>
  );
}

function AttendanceButton({busy, onClick, children}:{busy:boolean;onClick:()=>void;children:React.ReactNode}) {
  return <button type="button" disabled={busy} onClick={onClick} className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50">{children}</button>;
}

function Action({busy, onClick, children}:{busy:boolean;onClick:()=>void;children:React.ReactNode}) {
  return <button type="button" disabled={busy} onClick={onClick} className="whitespace-nowrap font-semibold text-cyan-700 hover:text-cyan-900 disabled:text-slate-300">{children}</button>;
}

function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}
