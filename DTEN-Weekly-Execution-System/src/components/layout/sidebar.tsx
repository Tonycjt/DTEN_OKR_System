import Link from "next/link";
import type { NavItem } from "@/lib/routes";
import { adminNav, canSeeNavItem, primaryNav } from "@/lib/routes";
import type { getCurrentUser } from "@/server/auth";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function Sidebar({ user }: { user: CurrentUser }) {
  const visibleAdminNav = user ? adminNav.filter((item) => canSeeNavItem(item, user.role)) : [];
  const brandHref = user?.role === "ADMIN" ? "/admin/users" : "/dashboard";

  return (
    <aside className="sidebar">
      <Link className="brand" href={brandHref} aria-label="DTEN Weekly Execution home">
        <span>DTEN</span>
        <strong>Weekly Execution</strong>
      </Link>

      {user ? (
        <nav aria-label="Primary navigation">
          <p className="nav-label">Work</p>

          {primaryNav.map((item) => {
            if (!canSeeNavItem(item, user.role)) return null;

            if (item.kind === "group") {
              const visibleChildren = item.children.filter((child) =>
                (child.roles as readonly string[]).includes(user.role),
              );

              if (visibleChildren.length === 0) return null;

              const GroupIcon = item.icon;

              return (
                <div className="nav-group" key={item.label}>
                  <span className="nav-group-header">
                    <GroupIcon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {visibleChildren.map((child) => {
                    const ChildIcon = child.icon;

                    return (
                      <Link key={child.href} className="nav-link nav-link-child" href={child.href}>
                        <ChildIcon size={16} aria-hidden="true" />
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            }

            const Icon = item.icon;

            return (
              <Link key={item.href} className="nav-link" href={item.href}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {visibleAdminNav.length > 0 ? (
            <>
              <p className="nav-label">Admin</p>
              {visibleAdminNav.map((adminItem) => {
                const Icon = adminItem.icon;

                return (
                  <Link key={adminItem.href} className="nav-link" href={adminItem.href}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{adminItem.label}</span>
                  </Link>
                );
              })}
            </>
          ) : null}
        </nav>
      ) : null}
    </aside>
  );
}
