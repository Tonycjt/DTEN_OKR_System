import Link from "next/link";
import { adminNav, primaryNav } from "@/lib/routes";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/dashboard" aria-label="DTEN OKR dashboard">
        <span>DTEN</span>
        <strong>Weekly Execution</strong>
      </Link>

      <nav aria-label="Primary navigation">
        <p className="nav-label">Work</p>
        {primaryNav.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.href} className="nav-link" href={item.href}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <p className="nav-label">Admin</p>
        {adminNav.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.href} className="nav-link" href={item.href}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
