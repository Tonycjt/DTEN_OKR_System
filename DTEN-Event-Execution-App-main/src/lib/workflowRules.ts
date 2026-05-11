import type { ApprovalStatus, EventCostLine, EventRecord, Region, Reminder } from "../types";

export const approvalPipeline: ApprovalStatus[] = ["Draft", "Submitted", "Functional Review", "Finance Review", "Approved"];
export const approvedStatuses: ApprovalStatus[] = ["Approved", "Post-Event Reporting", "Scorecard Active", "Completed"];
export const postEventStatuses: ApprovalStatus[] = ["Post-Event Reporting", "Scorecard Active", "Completed"];
export const regions: Region[] = ["West", "East", "EMEA", "APAC"];
export const currentDate = new Date("2026-05-03T12:00:00-07:00");

export function getCostTotalsForEvent(event: EventRecord, costLines: EventCostLine[]) {
  const lines = costLines.filter((line) => line.event_id === event.event_id);
  const estimated = lines.reduce((sum, line) => sum + line.estimated_amount, 0);
  const actual = lines.reduce((sum, line) => sum + line.actual_amount, 0);
  const variance = actual - estimated;
  const variancePercentage = estimated > 0 ? (variance / estimated) * 100 : 0;

  return { estimated, actual, variance, variancePercentage };
}

export function deriveEventsWithCostTotals(events: EventRecord[], costLines: EventCostLine[]) {
  return events.map((event) => {
    const totals = getCostTotalsForEvent(event, costLines);
    return {
      ...event,
      estimated_cost_total: totals.estimated,
      actual_cost_total: totals.actual,
      variance_amount: totals.variance,
      variance_percentage: totals.variancePercentage,
      budget: totals.estimated,
    };
  });
}

export function isObjectiveLocked(startDate: string) {
  if (!startDate) return false;
  return new Date(`${startDate}T00:00:00`) <= currentDate;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nextWednesdayOrFriday(value: string) {
  const date = new Date(`${value}T12:00:00`);
  for (let index = 1; index <= 7; index += 1) {
    const next = new Date(date);
    next.setDate(date.getDate() + index);
    const day = next.getDay();
    if (day === 3 || day === 5) return next.toISOString().slice(0, 10);
  }
  return addDays(value, 3);
}

export function getReminderDueState(reminder: Reminder) {
  if (reminder.status === "Completed") return "Done";
  return new Date(`${reminder.due_date}T23:59:59`) < currentDate ? "Overdue" : "Open";
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
