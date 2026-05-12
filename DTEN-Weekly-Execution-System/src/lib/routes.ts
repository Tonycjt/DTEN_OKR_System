import {
  Bell,
  Building2,
  ClipboardCheck,
  FileClock,
  Home,
  ListChecks,
  Network,
  ScrollText,
  Target,
  Users,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

export const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: Home, roles: ["CEO", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
  { href: "/company-okrs", label: "Company OKRs", icon: Network, roles: ["CEO", "DEPARTMENT_HEAD", "MANAGER"] },
  { href: "/my-okrs", label: "My OKRs", icon: Target, roles: ["CEO", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
  { href: "/weekly-report/current", label: "Weekly Report", icon: ListChecks, roles: ["CEO", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
  { href: "/reviews/pending", label: "Reviews", icon: ClipboardCheck, roles: ["CEO", "DEPARTMENT_HEAD", "MANAGER"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["CEO", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
] as const;

export const adminNav = [
  { href: "/admin/users", label: "Users", icon: Users, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] },
  { href: "/admin/departments", label: "Departments", icon: Building2, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] },
  { href: "/admin/teams", label: "Teams", icon: FileClock, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText, roles: ["ADMIN", "CEO"] },
] as const;

type NavItem = (typeof primaryNav | typeof adminNav)[number];

export function canSeeNavItem(item: NavItem, role: UserRole) {
  return (item.roles as readonly UserRole[]).includes(role);
}
