import { buildHubSpotSyncQueue } from "./hubspotSimulation";
import type { EventConversation, EventRecord, Region, Reminder, Role } from "../types";
import type { HubSpotSyncRecord } from "./hubspotSimulation";

export type PermissionAction =
  | "createEvent"
  | "submitApproval"
  | "uploadContacts"
  | "uploadConversations"
  | "reviewDuplicates"
  | "runHubSpotSync"
  | "updateActualCost"
  | "viewScorecard"
  | "duplicateReviewAction";

type PermissionWorkflowData = {
  conversations?: EventConversation[];
  syncRecords?: HubSpotSyncRecord[];
};

export type RoleScopeSummary = {
  persona?: string;
  scope: string;
  canDo: string;
  note?: string;
};

export const simulatedUserProfile = {
  eventOwner: "Maya Chen",
  salesRep: "Sam Patel",
  region: "West" as Region,
};

export function getRoleScopeSummary(role: Role): RoleScopeSummary {
  if (role === "Leadership") {
    return {
      scope: "All events across every region, owner, workflow status, and risk queue.",
      canDo: "Review leadership dashboard, scorecards, approval status, event risk, and strategic sign-off items.",
      note: "Leadership can see all events. Operational actions remain with owners, Ops, Finance, and technical teams.",
    };
  }
  if (role === "Admin") {
    return {
      scope: "All events plus admin configuration for fields, dropdowns, approval thresholds, reminders, and mock mappings.",
      canDo: "Configure prototype settings and simulate any workflow action for review.",
      note: "Admin can see all events and system configuration.",
    };
  }
  if (role === "Event Owner") {
    return {
      persona: `Simulated persona: ${simulatedUserProfile.eventOwner}`,
      scope: `Events owned by ${simulatedUserProfile.eventOwner}.`,
      canDo: "Create events, save drafts, submit approvals, upload contacts and conversations, update post-event data, and enter actual costs.",
      note: "Buttons outside this owner scope stay disabled with an explanation.",
    };
  }
  if (role === "Sales Rep") {
    return {
      persona: `Simulated persona: ${simulatedUserProfile.salesRep}`,
      scope: `Events ${simulatedUserProfile.salesRep} attended or leads where ${simulatedUserProfile.salesRep} owns the conversation or follow-up.`,
      canDo: "Upload own conversations, mark qualified leads, and update lead follow-up activity.",
      note: "General event approval, contact upload, and finance actions are intentionally blocked.",
    };
  }
  if (role === "Regional Sales Leader") {
    return {
      persona: `Simulated region: ${simulatedUserProfile.region}`,
      scope: `${simulatedUserProfile.region} region events only.`,
      canDo: "Approve regional commitments and review overdue regional follow-up.",
      note: "Events outside the simulated region are hidden from this role.",
    };
  }
  if (role === "Channel Leader") {
    return {
      scope: "Channel, partner, reseller, DMR, and alliance-related events.",
      canDo: "Approve channel commitments and review partner obligation or enablement workflows.",
    };
  }
  if (role === "Department Head") {
    return {
      scope: "High-cost, exception, non-measurable, and in-review events.",
      canDo: "Approve high-cost or exception events and review escalated workflow risk.",
    };
  }
  if (role === "Marketing Ops") {
    return {
      scope: "All events, upload queues, duplicate review queues, and HubSpot setup simulation.",
      canDo: "Manage duplicate decisions, failed sync first review, upload support, and HubSpot sync simulation.",
      note: "Marketing Ops can see all events for workflow operations.",
    };
  }
  if (role === "Finance / CFO") {
    return {
      scope: "All events with cost, approval, reconciliation, and variance data.",
      canDo: "Approve spend, review actual costs, reconcile variance, and handle CFO threshold approvals.",
      note: "Finance / CFO can see all events for spend governance.",
    };
  }
  if (role === "Technical Team") {
    return {
      scope: "Events with failed sync, held sync records, logs, and integration errors.",
      canDo: "Review sync status, inspect logs, and mark simulated integration issues resolved.",
    };
  }
  return {
    scope: "Visible events for this role.",
    canDo: "Review assigned workflow items.",
  };
}

export function getVisibleEventsForRole(events: EventRecord[], role: Role, data: PermissionWorkflowData = {}) {
  if (["Leadership", "Marketing Ops", "Finance / CFO", "Admin"].includes(role)) return events;
  if (role === "Regional Sales Leader") return events.filter((event) => event.region === simulatedUserProfile.region);
  if (role === "Channel Leader") return events.filter((event) => /channel|partner|reseller|dmr|alliance/i.test(`${event.event_type} ${event.funding_source} ${event.skymapRoute}`));
  if (role === "Event Owner") return events.filter((event) => event.event_owner === simulatedUserProfile.eventOwner || event.owner === simulatedUserProfile.eventOwner);
  if (role === "Sales Rep") {
    const eventIds = new Set(
      (data.conversations ?? [])
        .filter((conversation) => conversation.conversation_owner === simulatedUserProfile.salesRep || conversation.follow_up_owner === simulatedUserProfile.salesRep)
        .map((conversation) => conversation.event_id),
    );
    return events.filter((event) => eventIds.has(event.event_id) || event.event_owner === simulatedUserProfile.salesRep || event.owner === simulatedUserProfile.salesRep);
  }
  if (role === "Department Head") return events.filter((event) => event.estimated_cost_total > 5000 || event.risk_flags.length > 0 || event.approval_status.includes("Review"));
  if (role === "Technical Team") {
    return events.filter((event) => {
      const queue = data.syncRecords?.length ? data.syncRecords.filter((record) => record.eventId === event.event_id) : buildHubSpotSyncQueue([event]);
      return queue.some((record) => record.syncStatus === "Failed" || record.syncStatus === "Held for review") || event.hubspotStatus === "Failed" || event.hubspotStatus === "Held for review";
    });
  }
  return events;
}

export function getRolePermission(role: Role, action: PermissionAction, event?: EventRecord) {
  const allowed = (reason = "") => ({ allowed: true, reason });
  const denied = (reason: string) => ({ allowed: false, reason });
  if (role === "Admin") return allowed("Admin can perform all prototype actions.");
  if (action === "viewScorecard") return allowed("Visible events can be reviewed in scorecards.");
  if (role === "Leadership") {
    if (action === "submitApproval") return allowed("Leadership can review strategic workflow state.");
    return denied("Leadership has review visibility in this prototype; operational actions stay with owners and Ops teams.");
  }
  if (role === "Event Owner") {
    if (["createEvent", "submitApproval", "uploadContacts", "uploadConversations", "updateActualCost"].includes(action)) return allowed("Event Owner can create, submit, upload, and update post-event data.");
  }
  if (role === "Sales Rep") {
    if (action === "uploadConversations") return allowed("Sales reps can upload and update their own event conversations.");
    return denied("Sales reps can only update attended events, conversations, and lead follow-up.");
  }
  if (role === "Regional Sales Leader") {
    return denied(event?.region === simulatedUserProfile.region ? "Regional Sales Leader can approve regional commitments from the Approval tab." : "Regional Sales Leader only acts on events in their region.");
  }
  if (role === "Channel Leader") return denied("Channel Leader actions are approval and channel commitment review actions.");
  if (role === "Department Head") return denied("Department Head actions are approval actions for high-cost or exception events.");
  if (role === "Marketing Ops") {
    if (["uploadContacts", "uploadConversations", "reviewDuplicates", "duplicateReviewAction", "runHubSpotSync"].includes(action)) return allowed("Marketing Ops can manage uploads, duplicate review, and HubSpot sync simulation.");
    if (action === "createEvent") return allowed("Marketing Ops can create events for intake support.");
  }
  if (role === "Finance / CFO") {
    if (action === "updateActualCost") return allowed("Finance / CFO can review and reconcile actual costs.");
    return denied("Finance / CFO actions are spend approval and cost reconciliation.");
  }
  if (role === "Technical Team") {
    if (action === "runHubSpotSync") return allowed("Technical Team can simulate and resolve integration errors.");
    return denied("Technical Team access is focused on sync status, logs, and failed records.");
  }
  return denied(`${role} does not have permission for this prototype action.`);
}

export function getApprovalPermission(role: Role, event: EventRecord, approver: string) {
  if (role === "Admin") return { allowed: true, reason: "Admin can simulate any approval." };
  if (role === "Leadership") return { allowed: /Leadership/.test(approver), reason: "Leadership can approve leadership sign-off. CEO visibility is informational only." };
  if (role === "Finance / CFO") return { allowed: /Finance|CFO/.test(approver), reason: "Finance / CFO can approve spend and CFO threshold items." };
  if (role === "Department Head") return { allowed: /Department Head/.test(approver), reason: "Department Head approves high-cost and exception events." };
  if (role === "Regional Sales Leader") return { allowed: /Regional|Sales/.test(approver) && event.region === simulatedUserProfile.region, reason: "Regional Sales Leader approves regional commitments in their region." };
  if (role === "Channel Leader") return { allowed: /Channel|Alliance/.test(approver), reason: "Channel Leader approves channel, alliance, partner, reseller, and DMR commitments." };
  if (role === "Marketing Ops") return { allowed: /Marketing/.test(approver), reason: "Marketing Ops can simulate marketing approval routing for prototype review." };
  return { allowed: false, reason: `${role} cannot approve this approver step.` };
}

export function getReminderPermission(role: Role, event: EventRecord, reminder: Reminder) {
  if (role === "Admin") return { allowed: true, reason: "Admin can manage all reminders." };
  if (role === "Event Owner" && (reminder.owner.includes(event.event_owner) || reminder.owner.includes("Event Owner"))) return { allowed: true, reason: "Event Owner owns this reminder." };
  if (role === "Sales Rep" && /Lead Status|Sales Follow-Up/i.test(reminder.reminder_type)) return { allowed: true, reason: "Sales reps can update lead follow-up reminders." };
  if (role === "Regional Sales Leader" && /Regional|Sales Follow-Up|Lead Status/i.test(`${reminder.owner} ${reminder.escalation_owner} ${reminder.reminder_type}`)) return { allowed: true, reason: "Regional Sales Leader can review overdue regional follow-up." };
  if (role === "Marketing Ops" && /HubSpot|Duplicate|Upload|Missing/i.test(reminder.reminder_type)) return { allowed: true, reason: "Marketing Ops manages upload, duplicate, and HubSpot reminder queues." };
  if (role === "Finance / CFO" && /Cost|Budget|Variance|Approval/i.test(reminder.reminder_type)) return { allowed: true, reason: "Finance / CFO manages spend and reconciliation reminders." };
  if (role === "Technical Team" && /HubSpot|sync|Technical/i.test(`${reminder.reminder_type} ${reminder.owner} ${reminder.escalation_owner}`)) return { allowed: true, reason: "Technical Team manages integration error reminders." };
  return { allowed: false, reason: `${role} can view this reminder but cannot update it.` };
}
