import { currentDate } from "./workflowRules";

export function parseCsvRow(row: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const nextChar = row[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function normalizeYesNo(value: string): "Yes" | "No" | "" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "y" || normalized === "true") return "Yes";
  if (normalized === "no" || normalized === "n" || normalized === "false") return "No";
  return "";
}

export function normalizeLeadQuality(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "hot") return "High";
  if (normalized === "medium" || normalized === "warm") return "Medium";
  if (normalized === "low" || normalized === "nurture") return "Low";
  return "";
}

export function isConfiguredOption(value: string, options: readonly string[]) {
  return options.some((option) => option.toLowerCase() === value.trim().toLowerCase());
}

export function getDefaultFollowUpDate(leadQuality: string) {
  const days = leadQuality === "High" ? 1 : leadQuality === "Low" ? 5 : 3;
  const date = new Date(currentDate);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}
