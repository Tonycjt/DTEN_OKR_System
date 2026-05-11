"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import { mockUsers, notifications, quarters } from "@/mock-data";
import { Badge } from "@/components/ui/badge";
import { loadLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { useMockSession } from "@/lib/mock-session";
import type { Notification } from "@/types";

export function TopBar() {
  const { activeUser, setActiveUserId } = useMockSession();
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const refreshNotifications = () => setLocalNotifications(loadLocalOkrStore().notifications);
    refreshNotifications();
    window.addEventListener("dten-local-okrs-updated", refreshNotifications);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshNotifications);
  }, []);

  const unreadCount = useMemo(() => {
    return mergeById(notifications, localNotifications).filter(
      (notification) => notification.userId === activeUser.id && notification.channel === "in_app" && !notification.readAt,
    ).length;
  }, [activeUser.id, localNotifications]);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 flex-col items-stretch gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-10 w-80 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-ink-600 md:flex">
            <Search size={16} aria-hidden="true" />
            <span>Search OKRs</span>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-[96px_40px] gap-2 md:flex md:items-center md:gap-3">
          <label className="sr-only" htmlFor="quarter">
            Quarter
          </label>
          <select
            id="quarter"
            className="h-10 w-full shrink-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 md:w-auto"
            defaultValue={quarters[0].id}
          >
            {quarters.map((quarter) => (
              <option key={quarter.id} value={quarter.id}>
                {quarter.label}
              </option>
            ))}
          </select>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-ink-600 hover:bg-slate-50"
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-dten-red px-1.5 text-xs font-semibold text-white">
                {unreadCount}
              </span>
            ) : null}
          </Link>
          <label className="sr-only" htmlFor="mock-user">
            Mock user
          </label>
          <select
            id="mock-user"
            className="col-span-2 h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 md:col-span-1 md:max-w-48"
            value={activeUser.id}
            onChange={(event) => {
              setActiveUserId(event.target.value);
            }}
          >
            {mockUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.role}: {user.name}
              </option>
            ))}
          </select>
          <div className="hidden xl:block">
            <Badge tone="info">Demo session</Badge>
          </div>
        </div>
      </div>
    </header>
  );
}
