import Link from "next/link";
import { adminNav, canSeeNavItem, primaryNav } from "@/lib/routes";
import type { getCurrentUser } from "@/server/auth";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function Sidebar({ user }: { user: CurrentUser }) {
  const visiblePrimaryNav = user ? primaryNav.filter((item) => canSeeNavItem(item, user.role)) : [];
  const visibleAdminNav = user ? adminNav.filter((item) => canSeeNavItem(item, user.role)) : [];
  const brandHref = user?.role === "ADMIN" ? "/admin/users" : "/dashboard";

  return (
    <aside className="sidebar">
      <Link className="brand" href={brandHref} aria-label="DTEN Weekly Execution home">
        <span>DTEN</span>
        <strong>Weekly Execution</strong>
      </Link>

      <nav aria-label="Primary navigation">
        {visiblePrimaryNav.length > 0 ? (
          <>
            <p className="nav-label">Work</p>
            {visiblePrimaryNav.map((item) => {
              const Icon = item.icon;

              return (
                <Link key={item.href} className="nav-link" href={item.href}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        ) : null}

        {visibleAdminNav.length > 0 ? (
          <>
            <p className="nav-label">Admin</p>
            {visibleAdminNav.map((item) => {
              const Icon = item.icon;

              return (
                <Link key={item.href} className="nav-link" href={item.href}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
