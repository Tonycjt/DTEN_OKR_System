import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import type { getCurrentUser } from "@/server/auth";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function AppShell({ children, user }: { children: ReactNode; user: CurrentUser }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-shell">
        <TopBar user={user} />
        <main className="page-shell">{children}</main>
      </div>
    </div>
  );
}
