"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationType,
} from "@/types/notification";

const types: Array<{ value: "" | NotificationType; label: string }> = [
  { value: "", label: "All types" },
  { value: "LEAD_ASSIGNED", label: "Lead assigned" },
  { value: "LEAD_UPDATED", label: "Lead updated" },
  { value: "CALLBACK_DUE", label: "Callback due" },
  { value: "MISSED_CALLBACK", label: "Missed callback" },
  { value: "ATTENTION_LEAD", label: "Attention lead" },
  { value: "LEAD_REASSIGNED", label: "Lead reassigned" },
  { value: "NEW_SALE", label: "New sale" },
  { value: "SALE_ACCEPTED", label: "Sale accepted" },
  { value: "GENERAL", label: "General" },
  { value: "SYSTEM", label: "System" },
];

export default function NotificationsPage() {
  const [result, setResult] = useState<NotificationListResponse | null>(null);
  const [type, setType] = useState<"" | NotificationType>("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (selectedType: "" | NotificationType, onlyUnread: boolean) => {
    setLoading(true);
    const query = new URLSearchParams({ limit: "50" });
    if (selectedType) query.set("type", selectedType);
    if (onlyUnread) query.set("isRead", "false");
    try {
      const response = await apiFetch<NotificationListResponse>(
        `/notifications?${query.toString()}`,
      );
      setResult(response);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load("", false));
  }, [load]);

  async function markRead(notification: NotificationItem) {
    if (notification.isRead) return;
    try {
      await apiFetch(`/notifications/${notification.id}/read`, {
        method: "PATCH",
      });
      setResult((current) =>
        current
          ? {
              ...current,
              unreadCount: Math.max(0, current.unreadCount - 1),
              data: current.data.map((item) =>
                item.id === notification.id
                  ? { ...item, isRead: true, readAt: new Date().toISOString() }
                  : item,
              ),
            }
          : current,
      );
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update notification.");
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/notifications/read-all", { method: "PATCH" });
      setResult((current) =>
        current
          ? {
              ...current,
              unreadCount: 0,
              data: current.data.map((item) => ({
                ...item,
                isRead: true,
                readAt: item.readAt ?? new Date().toISOString(),
              })),
            }
          : current,
      );
      window.dispatchEvent(new Event("neo-notifications-changed"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update notifications.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Notification Center
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Your updates</h1>
          <p className="mt-2 text-sm text-slate-600">
            {result?.unreadCount ?? 0} unread notification{result?.unreadCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={!result?.unreadCount}
          className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark all as read
        </button>
      </header>

      <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <select
          value={type}
          onChange={(event) => {
            const value = event.target.value as "" | NotificationType;
            setType(value);
            void load(value, unreadOnly);
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              void load(type, event.target.checked);
            }}
          />
          Unread only
        </label>
      </div>

      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-12 text-center text-sm text-slate-500">Loading notifications…</div>}
        {!loading && !error && result?.data.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">No notifications match these filters.</div>
        )}
        {!loading && result?.data.map((notification) => (
          <article
            key={notification.id}
            className={`border-b border-slate-100 p-5 last:border-b-0 ${notification.isRead ? "bg-white" : "bg-cyan-50/60"}`}
          >
            <div className="flex items-start gap-4">
              <span className={`mt-1 size-2.5 shrink-0 rounded-full ${notification.isRead ? "bg-slate-200" : "bg-cyan-600"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-950">{notification.title}</h2>
                  <time className="text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString("en-GB")}</time>
                </div>
                <p className="mt-1 text-sm text-slate-700">{notification.message}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
                  {!notification.isRead && (
                    <button type="button" onClick={() => void markRead(notification)} className="text-cyan-700 hover:text-cyan-900">
                      Mark as read
                    </button>
                  )}
                  {notification.entityType === "Lead" && notification.entityId && (
                    <Link href={`/leads/${notification.entityId}`} onClick={() => void markRead(notification)} className="text-slate-600 hover:text-slate-950">
                      Open lead →
                    </Link>
                  )}
                  {notification.entityType === "SaleSubmission" && notification.entityId && (
                    <Link href={notification.type === "NEW_SALE" ? `/admin/sales/${notification.entityId}` : `/sales/submissions/${notification.entityId}`} onClick={() => void markRead(notification)} className="text-slate-600 hover:text-slate-950">
                      Open Payment Card →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
