import {
  Building2,
  CalendarCheck2,
  ClipboardList,
  FileClock,
  GitBranch,
  History,
  Home,
  Network,
  ScrollText,
  Target,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

// Primary nav for normal users: Dashboard / OKR group / Weekly Report.
// Reviews, Summary, Search, and Notifications are accessible from within pages
// (dashboard links, report pages, top-bar) but not in the primary sidebar.

export type NavItem =
  | { kind: "link"; href: string; label: string; icon: LucideIcon; roles: readonly UserRole[] }
  | { kind: "group"; label: string; icon: LucideIcon; roles: readonly UserRole[]; children: Array<{ href: string; label: string; icon: LucideIcon; roles: readonly UserRole[] }> };

export const primaryNav: NavItem[] = [
  {
    kind: "link",
    href: "/dashboard",
    label: "Dashboard",
    icon: Home,
    roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"],
  },
  {
    kind: "group",
    label: "OKR",
    icon: Network,
    roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"],
    children: [
      { href: "/company-okrs", label: "Company OKRs", icon: Network, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"] },
      { href: "/my-okrs", label: "My OKRs", icon: Target, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
    ],
  },
  // Company Tree is shown only when the user has direct reports — sidebar gates this with hasDirectReports.
  {
    kind: "link",
    href: "/company-tree",
    label: "My Team",
    icon: GitBranch,
    roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"],
  },
  {
    kind: "group",
    label: "Weekly Report",
    icon: CalendarCheck2,
    roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"],
    children: [
      { href: "/weekly-report/current", label: "Current Report", icon: CalendarCheck2, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
      { href: "/weekly-report/history", label: "Report History", icon: History, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
      { href: "/reviews/pending", label: "Pending Reviews", icon: ClipboardList, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"] },
      { href: "/reviews/history", label: "Review History", icon: History, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"] },
    ],
  },
];

export const adminNav = [
  { href: "/admin/users", label: "Users", icon: Users, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] as readonly UserRole[] },
  { href: "/admin/departments", label: "Departments", icon: Building2, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] as readonly UserRole[] },
  { href: "/admin/teams", label: "Teams", icon: FileClock, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] as readonly UserRole[] },
  { href: "/admin/org-import", label: "Org Import", icon: Upload, roles: ["ADMIN", "CEO"] as readonly UserRole[] },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText, roles: ["ADMIN", "CEO"] as readonly UserRole[] },
] as const;

type AdminNavItem = (typeof adminNav)[number];

export function canSeeNavItem(item: NavItem | AdminNavItem, role: UserRole) {
  return (item.roles as readonly UserRole[]).includes(role);
}
