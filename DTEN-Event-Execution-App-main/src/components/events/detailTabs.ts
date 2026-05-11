export const detailTabs = [
  "Overview",
  "Cost Estimate",
  "Objectives & Commitments",
  "Approval",
  "Contact Upload",
  "Conversation Upload",
  "Duplicate Review",
  "HubSpot Sync",
  "Scorecard",
  "Reminders",
  "Activity Log",
] as const;

export type DetailTab = (typeof detailTabs)[number];
