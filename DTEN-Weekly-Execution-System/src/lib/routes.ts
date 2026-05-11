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

export const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/company-okrs", label: "Company OKRs", icon: Network },
  { href: "/my-okrs", label: "My OKRs", icon: Target },
  { href: "/weekly-report/current", label: "Weekly Report", icon: ListChecks },
  { href: "/reviews/pending", label: "Reviews", icon: ClipboardCheck },
  { href: "/notifications", label: "Notifications", icon: Bell },
] as const;

export const adminNav = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/departments", label: "Departments", icon: Building2 },
  { href: "/admin/teams", label: "Teams", icon: FileClock },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
] as const;
