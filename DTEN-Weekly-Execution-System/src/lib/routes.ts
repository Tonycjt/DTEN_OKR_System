import {
  Bell,
  Building2,
  ClipboardCheck,
  FileText,
  FileClock,
  Home,
  ListChecks,
  Network,
  PlusCircle,
  Search,
  ScrollText,
  Target,
  Upload,
  Users,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

export const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: Home, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"] },
  { href: "/company-okrs", label: "Company OKRs", icon: Network, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "VIEWER"] },
  { href: "/my-okrs", label: "My OKRs", icon: Target, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
  { href: "/objectives/new", label: "Create Objective", icon: PlusCircle, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
  { href: "/weekly-report/current", label: "Weekly Report", icon: ListChecks, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
  { href: "/reviews/pending", label: "Reviews", icon: ClipboardCheck, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"] },
  { href: "/executive-summary", label: "Summary", icon: FileText, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"] },
  { href: "/search", label: "Search", icon: Search, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"] },
] as const;

export const adminNav = [
  { href: "/admin/users", label: "Users", icon: Users, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] },
  { href: "/admin/departments", label: "Departments", icon: Building2, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] },
  { href: "/admin/teams", label: "Teams", icon: FileClock, roles: ["ADMIN", "CEO", "DEPARTMENT_HEAD"] },
  { href: "/admin/org-import", label: "Org Import", icon: Upload, roles: ["ADMIN", "CEO"] },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText, roles: ["ADMIN", "CEO"] },
] as const;

type NavItem = (typeof primaryNav | typeof adminNav)[number];

export function canSeeNavItem(item: NavItem, role: UserRole) {
  return (item.roles as readonly UserRole[]).includes(role);
}
