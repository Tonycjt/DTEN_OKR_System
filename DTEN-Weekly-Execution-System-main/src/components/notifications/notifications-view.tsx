"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { addLocalNotification, loadLocalOkrStore, saveLocalOkrStore, upsertLocalNotification } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { keyResults, notifications, weeklyReports } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import type { Notification, NotificationType } from "@/types";

const notificationLabels: Record<NotificationType, string> = {
  approval_needed: "Approval needed",
  approval_approved: "Approval approved",
  approval_rejected: "Approval rejected",
  weekly_update_reminder: "Weekly update reminder",
  monday_weekly_update_reminder: "Monday weekly update reminder",
  incomplete_weekly_update_reminder: "Incomplete weekly update reminder",
  wednesday_incomplete_update_reminder: "Wednesday incomplete update reminder",
  missed_weekly_update: "Missed weekly update",
  friday_missed_update_reminder: "Friday missed update reminder",
  manager_attention_needed: "Manager attention needed",
  due_date_approaching: "Due date approaching",
  quarter_close_reminder: "Quarter close reminder",
  comment_created: "Comment added",
  comment_replied: "Reply added",
  rollup_state_changed: "Roll-up state changed",
  weekly_report_comment: "Comment added",
};

const prototypeTriggers: Array<{ type: NotificationType; label: string; resourceType: Notification["resourceType"]; resourceId: string }> = [
  { type: "monday_weekly_update_reminder", label: "Monday reminder", resourceType: "weekly_report", resourceId: "report-avery-2026-04-27" },
  { type: "wednesday_incomplete_update_reminder", label: "Wednesday incomplete reminder", resourceType: "weekly_report", resourceId: "report-lena-2026-04-27" },
  { type: "friday_missed_update_reminder", label: "Friday missed reminder", resourceType: "weekly_report", resourceId: "report-devon-2026-04-27" },
  { type: "manager_attention_needed", label: "Manager attention", resourceType: "objective", resourceId: "obj-sales-pipeline" },
  { type: "rollup_state_changed", label: "Roll-up changed", resourceType: "key_result", resourceId: "kr-company-launch-readiness" },
];

export function NotificationsView() {
  const activeUser = useMockSessionUser();
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const refreshNotifications = () => setLocalNotifications(loadLocalOkrStore().notifications);
    refreshNotifications();
    window.addEventListener("dten-local-okrs-updated", refreshNotifications);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshNotifications);
  }, []);

  const userNotifications = useMemo(() => {
    return mergeById(notifications, localNotifications)
      .filter((notification) => notification.userId === activeUser.id && notification.channel === "in_app")
      .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  }, [activeUser.id, localNotifications]);
  const unreadCount = userNotifications.filter((notification) => !notification.readAt).length;

  function markAsRead(notification: Notification) {
    const timestamp = new Date().toISOString();
    const nextNotification: Notification = {
      ...notification,
      readAt: timestamp,
      status: "Read",
    };
    const nextStore = upsertLocalNotification(loadLocalOkrStore(), nextNotification);
    saveLocalOkrStore(nextStore);
    setLocalNotifications(nextStore.notifications);
    setMessage("Notification marked as read.");
  }

  function createPrototypeNotification(type: NotificationType, resourceType: Notification["resourceType"], resourceId: string) {
    const timestamp = new Date().toISOString();
    const notification: Notification = {
      id: `local-notification-${crypto.randomUUID()}`,
      userId: activeUser.id,
      type,
      resourceType,
      resourceId,
      channel: "in_app",
      sentAt: timestamp,
      readAt: null,
      status: "Sent",
    };
    const nextStore = addLocalNotification(loadLocalOkrStore(), notification);
    saveLocalOkrStore(nextStore);
    setLocalNotifications(nextStore.notifications);
    setMessage(`${notificationLabels[type]} notification created.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`In-app notification center for ${activeUser.name} (${activeUser.role}). Email is represented as a placeholder only.`}
      />

      {message ? <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-dten-blue">{message}</div> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Notification Center</h2>
              <p className="mt-1 text-sm text-ink-600">Unread/read state is persisted in local prototype storage.</p>
            </div>
            <div className="flex gap-2">
              <Badge tone="info">{unreadCount} unread</Badge>
              <Badge tone="neutral">{userNotifications.length} total</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {userNotifications.length === 0 ? (
            <EmptyState title="No notifications" description="This selected mock user does not have notifications yet." />
          ) : (
            userNotifications.map((notification) => (
              <div key={notification.id} className={`rounded-lg border p-4 ${notification.readAt ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">{notificationLabels[notification.type]}</p>
                    <p className="mt-1 text-sm text-ink-600">{getNotificationDescription(notification)}</p>
                  </div>
                  <Badge tone={notification.readAt ? "neutral" : "info"}>{notification.readAt ? "Read" : "Unread"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href={getNotificationTargetHref(notification)}>
                    <Button variant="secondary">Open target</Button>
                  </Link>
                  {!notification.readAt ? (
                    <Button variant="ghost" onClick={() => markAsRead(notification)}>
                      Mark as read
                    </Button>
                  ) : null}
                  <Badge tone="neutral">{notification.channel}</Badge>
                  <Badge tone="neutral">{notification.status}</Badge>
                  {notification.sentAt ? <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{formatDateTime(notification.sentAt)}</span> : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Mock Triggers</h2>
          <p className="mt-1 text-sm text-ink-600">Prototype-only buttons stand in for scheduled jobs and system events.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {prototypeTriggers.map((trigger) => (
            <Button
              key={trigger.type}
              variant="secondary"
              onClick={() => createPrototypeNotification(trigger.type, trigger.resourceType, trigger.resourceId)}
            >
              Create {trigger.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function getNotificationTargetHref(notification: Notification) {
  if (notification.resourceType === "objective") {
    return `/okrs/${notification.resourceId}`;
  }

  if (notification.resourceType === "key_result") {
    const keyResult = keyResults.find((item) => item.id === notification.resourceId);
    return keyResult ? `/okrs/${keyResult.objectiveId}` : "/my-okrs";
  }

  const report = weeklyReports.find((item) => item.id === notification.resourceId);
  return report ? `/weekly-history?employeeId=${report.userId}&week=${report.weekStartDate}` : "/weekly-history";
}

function getNotificationDescription(notification: Notification) {
  if (notification.channel === "email") {
    return "Email delivery is a placeholder in this prototype.";
  }

  if (notification.type === "approval_needed") return "Review and decide an OKR approval request.";
  if (notification.type === "approval_approved") return "An OKR approval request was approved.";
  if (notification.type === "approval_rejected") return "An OKR approval request was rejected.";
  if (notification.type === "rollup_state_changed") return "A linked objective changed a parent KR roll-up state.";
  if (notification.type === "comment_created" || notification.type === "weekly_report_comment") return "A comment was added to a record you can view.";
  if (notification.type === "comment_replied") return "Someone replied in a record-bound discussion.";
  if (notification.type === "monday_weekly_update_reminder") return "Monday reminder to start this week's weekly update.";
  if (notification.type === "wednesday_incomplete_update_reminder") return "Wednesday reminder to finish incomplete OKR check-ins.";
  if (notification.type === "friday_missed_update_reminder") return "Friday reminder that a weekly update is missing or overdue.";
  if (notification.type === "manager_attention_needed") return "A direct-report update or OKR risk needs manager attention.";
  return "Prototype in-app notification for weekly execution follow-up.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
