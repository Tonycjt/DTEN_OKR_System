import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function NotificationsPage() {
  const user = await requireUser();

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.notification.count({
      where: {
        userId: user.id,
        readAt: null,
      },
    }),
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Notifications"
        description="In-app updates for report submissions, manager reviews, follow-ups, and KR comments."
        actions={
          unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" tone="secondary">
                <CheckCheck size={16} aria-hidden="true" />
                Mark All Read
              </Button>
            </form>
          ) : null
        }
      />

      <div className="grid grid-3">
        <Card>
          <CardContent>
            <div className="stat-card-topline">
              <span>Unread</span>
              <Badge tone={unreadCount > 0 ? "warning" : "success"}>{unreadCount > 0 ? "Action" : "Clear"}</Badge>
            </div>
            <strong>{unreadCount}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="stat-card-topline">
              <span>Total</span>
              <Badge tone="info">Latest 50</Badge>
            </div>
            <strong>{notifications.length}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="stat-card-topline">
              <span>Owner</span>
              <Badge tone="neutral">{formatEnumLabel(user.role)}</Badge>
            </div>
            <strong>{user.name}</strong>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2>Notification List</h2>
          <p>Unread items are pinned first so manager requests and review outcomes stay visible.</p>
        </CardHeader>
        <CardContent>
          <div className="route-grid">
            {notifications.map((notification) => (
              <div
                className={`route-item notification-item ${notification.readAt ? "" : "notification-unread"}`.trim()}
                key={notification.id}
              >
                <span>
                  <span className="table-actions">
                    <strong>{notification.title}</strong>
                    <Badge tone={notification.readAt ? "neutral" : "warning"}>
                      {notification.readAt ? "Read" : "Unread"}
                    </Badge>
                    <Badge tone="info">{formatEnumLabel(notification.type)}</Badge>
                  </span>
                  <br />
                  <span className="muted">{notification.body}</span>
                  <br />
                  <span className="muted">{formatDateTime(notification.createdAt)}</span>
                </span>
                <span className="table-actions">
                  {notification.relatedUrl ? (
                    <LinkButton href={notification.relatedUrl} tone="secondary">
                      Open
                    </LinkButton>
                  ) : null}
                  {notification.readAt ? null : (
                    <form action={markNotificationReadAction}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <Button type="submit" tone="ghost">
                        Mark Read
                      </Button>
                    </form>
                  )}
                </span>
              </div>
            ))}
            {notifications.length === 0 ? (
              <div className="route-item">
                <span>No notifications yet.</span>
                <Link href="/weekly-report/current">Open weekly report</Link>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
