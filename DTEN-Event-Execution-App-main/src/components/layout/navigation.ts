import { BarChart3, CalendarDays, CloudUpload, DatabaseZap, ListChecks, Settings, type LucideIcon } from "lucide-react";
import type { Role } from "../../types";

export type View =
  | "my-work"
  | "events"
  | "uploads"
  | "data-review"
  | "scorecards"
  | "admin";

export type AppView = View | "dashboard" | "event-detail" | "event-create";

export const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "my-work", label: "My Work", icon: ListChecks },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "uploads", label: "Uploads", icon: CloudUpload },
  { id: "data-review", label: "Data Review", icon: DatabaseZap },
  { id: "scorecards", label: "Scorecards", icon: BarChart3 },
  { id: "admin", label: "Admin Settings", icon: Settings },
];

export const roles: Role[] = [
  "Leadership",
  "Sales Rep",
  "Event Owner",
  "Regional Sales Leader",
  "Channel Leader",
  "Marketing Ops",
  "Finance / CFO",
  "Technical Team",
  "Admin",
];
