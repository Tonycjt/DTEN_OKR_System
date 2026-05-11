"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/mock-data";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="text-lg font-semibold text-ink-950">DTEN.me</div>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-600">Weekly Execution</div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                isActive ? "bg-blue-50 text-dten-blue" : "text-ink-600 hover:bg-slate-50 hover:text-ink-950"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 px-6 py-4 text-xs leading-5 text-ink-600">
        Weekly OKRs, check-ins, risks, and execution visibility.
      </div>
    </aside>
  );
}
