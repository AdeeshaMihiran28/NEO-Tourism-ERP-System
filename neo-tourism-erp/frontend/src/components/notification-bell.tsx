"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { NotificationListResponse } from "@/types/notification";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await apiFetch<NotificationListResponse>(
        "/notifications?isRead=false&limit=1",
      );
      setUnreadCount(response.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadUnreadCount);
    const interval = window.setInterval(() => void loadUnreadCount(), 30000);
    window.addEventListener("neo-notifications-changed", loadUnreadCount);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("neo-notifications-changed", loadUnreadCount);
    };
  }, [loadUnreadCount]);

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-5"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
