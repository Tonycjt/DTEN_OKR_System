import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { prisma } from "@/server/prisma";
import type { getCurrentUser } from "@/server/auth";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

export async function AppShell({ children, user }: { children: ReactNode; user: CurrentUser }) {
  const hasDirectReports = user
    ? (await prisma.user.count({ where: { managerId: user.id } })) > 0
    : false;

  return (
    <div className="app-shell">
      <Sidebar user={user} hasDirectReports={hasDirectReports} />
      <div className="main-shell">
        <TopBar user={user} />
        <main className="page-shell">{children}</main>
      </div>
    </div>
  );
}
