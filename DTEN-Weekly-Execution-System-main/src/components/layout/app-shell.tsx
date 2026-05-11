import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MockSessionProvider } from "@/lib/mock-session";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <MockSessionProvider>
      <div className="flex min-h-screen max-w-full overflow-x-hidden bg-surface-50">
        <Sidebar />
        <div className="flex w-full min-w-0 max-w-full flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-full flex-1 overflow-x-hidden px-4 py-6 md:px-6 lg:max-w-7xl lg:px-8">{children}</main>
        </div>
      </div>
    </MockSessionProvider>
  );
}
