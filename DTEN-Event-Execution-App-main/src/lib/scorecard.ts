import type { DuplicateGroup, EventContact, EventConversation, EventCostLine, EventObjective, EventRecord, Region, Reminder, SyncStatus } from "../types";

export type ScorecardStatus = "Exceeded" | "Met" | "Close" | "Behind" | "Missing Data" | "Over Budget" | "Needs Explanation";

export type ScorecardRow = {
  objective: string;
  commitment: string;
  actual: string;
  status: ScorecardStatus;
  notes: string;
};

export type ScorecardSummary = {
  overallStatus: ScorecardStatus;
  mainRisk: string;
  recommendedLeadershipAction: string;
  missingData: number;
  owner: string;
};

export type LeadershipScorecard = {
  overallStatus: ScorecardStatus;
  recommendedAction: string;
  mainRisk: string;
  behindEvents: number;
  overBudgetEvents: number;
  missingDataRows: number;
};

export type RegionalScorecard = {
  region: Region;
  events: number;
  overallStatus: ScorecardStatus;
  mainRisk: string;
  missingData: number;
  recommendedAction: string;
};

export type ScorecardSyncRecord = {
  eventId: string;
  recordType: "Contact" | "Lead";
  syncStatus: SyncStatus;
};

export type ScorecardData = {
  objectives: EventObjective[];
  contacts: EventContact[];
  conversations: EventConversation[];
  costLines: EventCostLine[];
  syncRecords: ScorecardSyncRecord[];
  duplicates: DuplicateGroup[];
  reminders: Reminder[];
};

export type EventScorecard = {
  rows: ScorecardRow[];
  summary: ScorecardSummary;
};

export function calculateEventScorecard(event: EventRecord, data: ScorecardData): EventScorecard {
  const eventData = getEventData(event, data);
  const marketingObjective = findObjective(eventData.objectives, ["Marketing List Growth"]);
  const salesObjective = findObjective(eventData.objectives, ["MQLs", "Qualified Meetings", "Executive Meetings", "Pipeline Created"]);
  const partnerConversationObjective = findObjective(eventData.objectives, ["Partner Influence"]);
  const partnerAgreementObjective = eventData.objectives.find((objective) => /agreement/i.test(`${objective.objective_type} ${objective.notes}`));
  const qualifiedLeadConversations = eventData.conversations.filter((conversation) => conversation.is_sales_lead);
  const partnerConversations = eventData.conversations.filter((conversation) => isPartnerConversation(event, conversation));
  const partnerAgreements = eventData.conversations.filter(hasPartnerAgreementSignal);
  const eligibleSyncRecords = eventData.syncRecords.filter((record) => record.syncStatus !== "Suppressed / do not market" && record.syncStatus !== "DTEN.me / SkyMap only");
  const syncedRecords = eligibleSyncRecords.filter((record) => record.syncStatus === "Synced");
  const unresolvedDuplicates = eventData.duplicates.filter((duplicate) => duplicate.action === "Review");
  const overdueReminders = eventData.reminders.filter((reminder) => reminder.status === "Overdue" || reminder.status === "Escalated");
  const costTotals = getCostTotals(eventData.costLines);

  const rows: ScorecardRow[] = [
    metricRow("Marketing contacts", getCommitment(marketingObjective), eventData.contacts.length, marketingObjective?.notes ?? "Actual uses uploaded contact records only."),
    metricRow("Sales leads", getCommitment(salesObjective), qualifiedLeadConversations.length, salesObjective?.notes ?? "Actual uses qualified event conversations only."),
    metricRow("Channel partner conversations", getCommitment(partnerConversationObjective), partnerConversations.length, partnerConversationObjective?.notes ?? "Actual uses partner/channel conversation records only."),
    metricRow("Partner agreements initiated", getCommitment(partnerAgreementObjective), partnerAgreements.length, partnerAgreementObjective?.notes ?? "Actual uses conversation text and next-step signals for partner agreement initiation."),
    costRow(costTotals, event.variance_explanation),
    syncRow(eligibleSyncRecords.length, syncedRecords.length),
    duplicateRow(eventData.duplicates.length, unresolvedDuplicates.length),
    followUpRow(qualifiedLeadConversations.length, overdueReminders.length),
  ];

  return {
    rows,
    summary: summarizeEventScorecard(event, rows),
  };
}

export function calculateLeadershipScorecard(events: EventRecord[], data: ScorecardData): LeadershipScorecard {
  const summaries = events.map((event) => calculateEventScorecard(event, data).summary);
  const overallStatus = summarizeStatuses(summaries.map((summary) => summary.overallStatus));
  const missingDataRows = events.reduce((sum, event) => sum + calculateEventScorecard(event, data).rows.filter((row) => row.status === "Missing Data" || row.status === "Needs Explanation").length, 0);

  return {
    overallStatus,
    recommendedAction: getRecommendedAction(overallStatus),
    mainRisk: summaries.find((summary) => summary.overallStatus !== "Met" && summary.overallStatus !== "Exceeded")?.mainRisk ?? "No material risk",
    behindEvents: summaries.filter((summary) => summary.overallStatus === "Behind" || summary.overallStatus === "Missing Data").length,
    overBudgetEvents: summaries.filter((summary) => summary.overallStatus === "Over Budget" || summary.overallStatus === "Needs Explanation").length,
    missingDataRows,
  };
}

export function calculateRegionalScorecard(events: EventRecord[], region: Region, data: ScorecardData): RegionalScorecard {
  const regionEvents = events.filter((event) => event.region === region);
  const summaries = regionEvents.map((event) => calculateEventScorecard(event, data).summary);
  const overallStatus = summarizeStatuses(summaries.map((summary) => summary.overallStatus));

  return {
    region,
    events: regionEvents.length,
    overallStatus,
    mainRisk: summaries.find((summary) => summary.overallStatus !== "Met" && summary.overallStatus !== "Exceeded")?.mainRisk ?? "No material risk",
    missingData: summaries.reduce((sum, summary) => sum + summary.missingData, 0),
    recommendedAction: getRecommendedAction(overallStatus),
  };
}

export function getScorecardStatus(commitment: number | null, actual: number | null): ScorecardStatus {
  if (commitment === null || actual === null || Number.isNaN(actual)) return "Missing Data";
  if (commitment <= 0) return actual > 0 ? "Exceeded" : "Met";
  if (actual > commitment) return "Exceeded";
  if (actual >= commitment) return "Met";
  if (actual >= commitment * 0.8) return "Close";
  return "Behind";
}

function getEventData(event: EventRecord, data: ScorecardData) {
  return {
    objectives: data.objectives.filter((objective) => objective.event_id === event.event_id),
    contacts: data.contacts.filter((contact) => contact.event_id === event.event_id),
    conversations: data.conversations.filter((conversation) => conversation.event_id === event.event_id),
    costLines: data.costLines.filter((line) => line.event_id === event.event_id),
    syncRecords: data.syncRecords.filter((record) => record.eventId === event.event_id),
    duplicates: data.duplicates.filter((duplicate) => duplicate.eventId === event.event_id),
    reminders: data.reminders.filter((reminder) => reminder.event_id === event.event_id),
  };
}

function findObjective(objectives: EventObjective[], objectiveTypes: string[]) {
  return objectives.find((objective) => objectiveTypes.includes(objective.objective_type));
}

function getCommitment(objective: EventObjective | undefined) {
  if (!objective || !objective.expected_yes_no) return null;
  return objective.commitment_value;
}

function metricRow(objective: string, commitment: number | null, actual: number | null, notes: string): ScorecardRow {
  return {
    objective,
    commitment: formatNumber(commitment),
    actual: formatNumber(actual),
    status: getScorecardStatus(commitment, actual),
    notes,
  };
}

function costRow(costTotals: ReturnType<typeof getCostTotals>, varianceExplanation: string): ScorecardRow {
  if (costTotals.lineCount === 0) {
    return {
      objective: "Estimated cost vs actual cost",
      commitment: "Missing",
      actual: "Missing",
      status: "Missing Data",
      notes: "Cost score uses cost line records; no cost lines are attached to this event.",
    };
  }

  if (costTotals.actual <= 0) {
    return {
      objective: "Estimated cost vs actual cost",
      commitment: formatCurrency(costTotals.estimated),
      actual: "Missing",
      status: "Missing Data",
      notes: "Actual cost total is derived from actual cost lines and has not been reconciled.",
    };
  }

  const status = costTotals.variancePercentage > 10 && !varianceExplanation.trim() ? "Needs Explanation" : costTotals.variancePercentage > 10 ? "Over Budget" : "Met";

  return {
    objective: "Estimated cost vs actual cost",
    commitment: formatCurrency(costTotals.estimated),
    actual: formatCurrency(costTotals.actual),
    status,
    notes: varianceExplanation || `Variance is ${formatCurrency(costTotals.variance)} (${costTotals.variancePercentage.toFixed(1)}%).`,
  };
}

function syncRow(eligibleRecords: number, syncedRecords: number): ScorecardRow {
  return {
    objective: "HubSpot sync success",
    commitment: eligibleRecords === 0 ? "0 eligible" : formatNumber(eligibleRecords),
    actual: formatNumber(syncedRecords),
    status: eligibleRecords === 0 ? "Met" : getScorecardStatus(eligibleRecords, syncedRecords),
    notes: "Eligible records exclude suppressed contacts and DTEN.me / SkyMap intelligence-only conversations.",
  };
}

function duplicateRow(totalDuplicates: number, unresolvedDuplicates: number): ScorecardRow {
  return {
    objective: "Duplicate review status",
    commitment: "0 open",
    actual: `${unresolvedDuplicates} open / ${totalDuplicates} total`,
    status: unresolvedDuplicates === 0 ? "Met" : "Behind",
    notes: "Duplicate contacts are held until Marketing Ops resolves the duplicate queue.",
  };
}

function followUpRow(qualifiedLeads: number, overdueReminders: number): ScorecardRow {
  if (qualifiedLeads === 0) {
    return {
      objective: "Follow-up compliance",
      commitment: "Lead follow-up complete",
      actual: "No qualified leads",
      status: "Missing Data",
      notes: "No qualified lead conversations are available to score follow-up compliance.",
    };
  }

  const completed = Math.max(0, qualifiedLeads - overdueReminders);
  return {
    objective: "Follow-up compliance",
    commitment: formatNumber(qualifiedLeads),
    actual: `${completed} complete / ${overdueReminders} overdue`,
    status: overdueReminders === 0 ? "Met" : completed / qualifiedLeads >= 0.8 ? "Close" : "Behind",
    notes: "Overdue and escalated reminders lower follow-up compliance.",
  };
}

function summarizeEventScorecard(event: EventRecord, rows: ScorecardRow[]): ScorecardSummary {
  const overallStatus = summarizeStatuses(rows.map((row) => row.status));
  const mainRisk = rows.find((row) => ["Behind", "Missing Data", "Over Budget", "Needs Explanation"].includes(row.status))?.objective ?? "No material risk";

  return {
    overallStatus,
    mainRisk,
    recommendedLeadershipAction: getRecommendedAction(overallStatus),
    missingData: rows.filter((row) => row.status === "Missing Data" || row.status === "Needs Explanation").length,
    owner: event.event_owner,
  };
}

function summarizeStatuses(statuses: ScorecardStatus[]): ScorecardStatus {
  if (statuses.length === 0) return "Missing Data";
  if (statuses.some((status) => status === "Needs Explanation")) return "Needs Explanation";
  if (statuses.some((status) => status === "Over Budget")) return "Over Budget";
  if (statuses.some((status) => status === "Behind")) return "Behind";
  if (statuses.some((status) => status === "Missing Data")) return "Missing Data";
  if (statuses.some((status) => status === "Close")) return "Close";
  if (statuses.every((status) => status === "Exceeded")) return "Exceeded";
  return "Met";
}

function getRecommendedAction(status: ScorecardStatus) {
  if (status === "Exceeded" || status === "Met") return "Scale / repeat";
  if (status === "Over Budget" || status === "Needs Explanation") return "Review spend controls";
  if (status === "Behind") return "Escalate follow-up";
  if (status === "Missing Data") return "Complete data";
  return "Monitor";
}

function getCostTotals(costLines: EventCostLine[]) {
  const estimated = costLines.reduce((sum, line) => sum + line.estimated_amount, 0);
  const actual = costLines.reduce((sum, line) => sum + line.actual_amount, 0);
  const variance = actual - estimated;
  const variancePercentage = estimated > 0 ? (variance / estimated) * 100 : 0;
  return { estimated, actual, variance, variancePercentage, lineCount: costLines.length };
}

function isPartnerConversation(event: EventRecord, conversation: EventConversation) {
  return /partner|channel|reseller|dmr|alliance/i.test(
    `${event.event_type} ${event.funding_source} ${event.skymapRoute} ${conversation.company} ${conversation.title} ${conversation.conversation_summary} ${conversation.next_step}`,
  );
}

function hasPartnerAgreementSignal(conversation: EventConversation) {
  return /agreement|mou|contract|reseller agreement|partner agreement|initiated/i.test(`${conversation.conversation_summary} ${conversation.next_step}`);
}

function formatNumber(value: number | null) {
  if (value === null) return "Missing";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
