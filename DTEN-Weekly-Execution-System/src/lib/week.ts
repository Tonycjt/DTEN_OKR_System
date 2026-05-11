const dayMs = 24 * 60 * 60 * 1000;

export function getMondayWeekStart(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(utc.getTime() + diff * dayMs);
}

export function getSundayWeekEnd(weekStart: Date) {
  const weekEnd = new Date(weekStart.getTime() + 6 * dayMs);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return weekEnd;
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatWeekRange(weekStart: Date, weekEnd: Date) {
  return `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
}
