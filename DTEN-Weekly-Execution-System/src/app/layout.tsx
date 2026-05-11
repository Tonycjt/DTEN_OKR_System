import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/server/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "DTEN Weekly Execution System",
  description: "Release 1 MVP for OKR-linked weekly execution, check-ins, reviews, and leadership visibility.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
