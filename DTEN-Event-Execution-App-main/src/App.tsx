import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleX,
  CircleDollarSign,
  CloudUpload,
  DatabaseZap,
  FileCheck2,
  Filter,
  Home,
  Info,
  Layers3,
  ListChecks,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { AdminSettings } from "./components/admin/AdminSettings";
import { Scorecards } from "./components/dashboard/Scorecards";
import { detailTabs, type DetailTab } from "./components/events/detailTabs";
import { navItems, roles, type AppView, type View } from "./components/layout/navigation";
import {
  activityLogs as initialActivityLogs,
  duplicateGroups as initialDuplicates,
  eventContacts,
  eventConversations,
  eventCostLines,
  eventObjectives,
  events as initialEvents,
  reminders,
  uploads,
} from "./data/mockData";
import { getDefaultFollowUpDate, isConfiguredOption, normalizeLeadQuality, normalizeYesNo, parseCsvRow } from "./lib/csv";
import { buildHubSpotSyncQueue, mapHubSpotSyncStatusToSyncStatus, upsertSyncRecords } from "./lib/hubspotSimulation";
import { getApprovalPermission, getReminderPermission, getRolePermission, getRoleScopeSummary, getVisibleEventsForRole, simulatedUserProfile, type PermissionAction, type RoleScopeSummary } from "./lib/permissions";
import { calculateEventScorecard } from "./lib/scorecard";
import { processSkyMapRecord, type SkyMapProcessingResult } from "./lib/skymap";
import { addDays, approvalPipeline, approvedStatuses, currentDate, deriveEventsWithCostTotals, formatDate, formatDateTime, getCostTotalsForEvent, getReminderDueState, isObjectiveLocked, nextWednesdayOrFriday, postEventStatuses, regions } from "./lib/workflowRules";
import { CONSENT_STATUSES, COST_CATEGORIES, EVENT_TIERS, EVENT_TYPES, LEAD_QUALITY, MATCH_STATUSES, PRODUCT_INTEREST, SYNC_STATUSES } from "./types";
import type { ActivityLog, ApprovalStatus, ConsentStatus, DuplicateGroup, EventContact, EventConversation, EventCostLine, EventObjective, EventRecord, EventStage, EventStatus, LeadQuality, MatchStatus, ProductInterest, Region, Reminder, SyncStatus, UploadBatch, Role } from "./types";
import type { ScorecardRow, ScorecardStatus } from "./lib/scorecard";
import type { HubSpotSyncRecord, HubSpotSyncStatus } from "./lib/hubspotSimulation";

type EventFilterKey =
  | "all"
  | "awaiting-approval"
  | "approved"
  | "over-budget"
  | "contacts-uploaded"
  | "contacts-synced"
  | "conversations-uploaded"
  | "leads-synced"
  | "duplicate-held"
  | "missing-attendee-list"
  | "missing-cost-reconciliation"
  | "non-measurable"
  | "marketing-list-only"
  | "missing-uploads"
  | "missing-contact-upload"
  | "missing-conversation-upload"
  | "failed-sync"
  | "duplicate-review"
  | "cost-variance"
  | "follow-up-overdue"
  | `approval:${ApprovalStatus}`
  | `region:${Region}`
  | `cohort:${string}`;

type EventFilter = {
  key: EventFilterKey;
  label: string;
};

type NextActionCard = {
  title: string;
  count: number;
  copy: string;
  badge?: string;
  onClick: () => void;
};

type NextActionContext = {
  visibleEvents: EventRecord[];
  eventsForFilter: (key: EventFilterKey) => EventRecord[];
  openFilteredEvents: (filter: EventFilter) => void;
  openFirstEventTab: (candidates: EventRecord[], tab: DetailTab, fallback?: () => void) => void;
  setView: (view: AppView) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
  missingLeadFieldConversations: EventConversation[];
  overdueLeadReminders: Reminder[];
  leadHandoffRecords: HubSpotSyncRecord[];
  financeApprovalEvents: EventRecord[];
  varianceExplanationEvents: EventRecord[];
  duplicateReviewRecords: DuplicateReviewRecord[];
  readySyncRecords: HubSpotSyncRecord[];
  heldSyncRecords: HubSpotSyncRecord[];
  failedSyncRecords: HubSpotSyncRecord[];
  behindCommitmentEvents: EventRecord[];
  postEventScorecardEvents: EventRecord[];
  eventsForIds: (eventIds: Set<string>) => EventRecord[];
};

type PrimaryEventStatus =
  | "Ready"
  | "Needs your action"
  | "Waiting on approval"
  | "Waiting on Ops"
  | "Overdue"
  | "Over budget"
  | "Behind commitment"
  | "Missing data";

type EventListFilters = {
  search: string;
  eventStatus: string;
  region: string;
  owner: string;
  eventType: string;
  eventTier: string;
  approvalStatus: string;
  overdueItems: string;
  startDateFrom: string;
  startDateTo: string;
  functionalOwner: string;
  costVariance: string;
  commitmentStatus: string;
};

type CreateEventForm = {
  eventName: string;
  startDate: string;
  endDate: string;
  location: string;
  region: string;
  eventType: string;
  eventTier: string;
  eventTierExplanation: string;
  eventOwner: string;
  functionalOwner: string;
  fundingSource: string;
  estimatedCost: string;
  costLines: CostEstimateLine[];
  varianceExplanation: string;
  measurableObjectives: {
    marketingListGrowth: "" | "Yes" | "No";
    salesLeadGeneration: "" | "Yes" | "No";
    channelExpansion: "" | "Yes" | "No";
  };
  objectiveCommitments: {
    targetContactCount: string;
    targetQualifiedLeadCount: string;
    targetQualifiedPartnerConversations: string;
    partnerAgreementsInitiated: string;
  };
  objectiveActuals: {
    targetContactCount: string;
    targetQualifiedLeadCount: string;
    targetQualifiedPartnerConversations: string;
    partnerAgreementsInitiated: string;
  };
  objectiveStatuses: {
    marketingListGrowth: string;
    salesLeadGeneration: string;
    channelExpansion: string;
  };
  objectiveNotes: {
    marketingListGrowth: string;
    salesLeadGeneration: string;
    channelExpansion: string;
  };
  overrideRequests: {
    marketingListGrowth: string;
    salesLeadGeneration: string;
    channelExpansion: string;
  };
  objectiveCategories: Record<string, boolean>;
  reasonToBelieve: string;
  leadCaptureMethod: string;
  postEventPlan: string;
  outreachOwner: string;
  followUpTimeline: string;
};

type CreateEventPersistResult = {
  event: EventRecord;
  costLines: EventCostLine[];
  objectives: EventObjective[];
};

type CostEstimateLine = {
  id: string;
  costCategory: string;
  estimatedAmount: number;
  actualAmount: string;
  vendor: string;
  notes: string;
};

type ContactUploadStatus =
  | "New contact"
  | "Existing contact found"
  | "Possible duplicate"
  | "Existing company found"
  | "New company will be created"
  | "Missing required fields"
  | "Conflict"
  | "Synced"
  | "Failed";

type UploadedContactLine = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  country: string;
  captureMethod: string;
  consentStatus: string;
  notes: string;
  status: ContactUploadStatus;
  reason: string;
  skyMapResult: SkyMapProcessingResult;
};

type ConversationUploadStatus =
  | "Ready for HubSpot Lead sync"
  | "Hold and complete missing fields"
  | "Conversation intelligence only"
  | "Duplicate contact review";

type UploadedConversationLine = {
  id: string;
  contactEmail: string;
  company: string;
  contactName: string;
  title: string;
  conversationOwner: string;
  conversationSummary: string;
  productInterest: string;
  isSalesLead: "Yes" | "No" | "";
  leadQuality: string;
  buyingTimeline: string;
  estimatedOpportunitySize: string;
  nextStep: string;
  followUpOwner: string;
  followUpDate: string;
  notes: string;
  status: ConversationUploadStatus;
  reason: string;
};

type ApprovalDecision = "Approved" | "Rejected" | "Needs Revision";

type ApprovalState = Record<string, Record<string, ApprovalDecision>>;

type DuplicateReviewAction =
  | "Create new contact"
  | "Match to existing contact"
  | "Update existing contact"
  | "Do not sync"
  | "Send to Sales Ops review"
  | "Mark as resolved";

type DuplicateReviewRecord = {
  id: string;
  eventId: string;
  eventName: string;
  uploadBatchId: string;
  owner: string;
  uploadedContact: string;
  uploadedEmail: string;
  existingHubSpotContact: string;
  companyMatch: string;
  duplicateType: string;
  matchReason: string;
  confidence: string;
  recommendedAction: DuplicateReviewAction;
  status: "Open" | "Resolved" | "Sales Ops Review" | "Do Not Sync";
};

type DuplicateReviewFilters = {
  eventId: string;
  uploadBatchId: string;
  duplicateType: string;
  confidence: string;
  owner: string;
  status: string;
};

type MyWorkItem = {
  id: string;
  title: string;
  meta: string;
  detail: string;
  badge: string;
  onClick: () => void;
};

type WorkflowData = {
  contacts: EventContact[];
  conversations: EventConversation[];
  costLines: EventCostLine[];
  objectives: EventObjective[];
  uploads: UploadBatch[];
  duplicates: DuplicateGroup[];
  syncRecords: HubSpotSyncRecord[];
};

type ToastTone = "success" | "error" | "info";

type ToastMessage = {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
};

const defaultCreateEventForm: CreateEventForm = {
  eventName: "",
  startDate: "",
  endDate: "",
  location: "",
  region: "",
  eventType: "",
  eventTier: "",
  eventTierExplanation: "",
  eventOwner: "",
  functionalOwner: "",
  fundingSource: "",
  estimatedCost: "",
  costLines: [],
  varianceExplanation: "",
  measurableObjectives: {
    marketingListGrowth: "",
    salesLeadGeneration: "",
    channelExpansion: "",
  },
  objectiveCommitments: {
    targetContactCount: "",
    targetQualifiedLeadCount: "",
    targetQualifiedPartnerConversations: "",
    partnerAgreementsInitiated: "",
  },
  objectiveActuals: {
    targetContactCount: "",
    targetQualifiedLeadCount: "",
    targetQualifiedPartnerConversations: "",
    partnerAgreementsInitiated: "",
  },
  objectiveStatuses: {
    marketingListGrowth: "Not Started",
    salesLeadGeneration: "Not Started",
    channelExpansion: "Not Started",
  },
  objectiveNotes: {
    marketingListGrowth: "",
    salesLeadGeneration: "",
    channelExpansion: "",
  },
  overrideRequests: {
    marketingListGrowth: "",
    salesLeadGeneration: "",
    channelExpansion: "",
  },
  objectiveCategories: {
    "Brand presence and credibility": false,
    "Marketing list growth": false,
    "Sales lead generation": false,
    "Channel expansion": false,
    "Partner obligation and enablement": false,
    "Customer retention and expansion": false,
    "Market intelligence": false,
  },
  reasonToBelieve: "",
  leadCaptureMethod: "",
  postEventPlan: "",
  outreachOwner: "",
  followUpTimeline: "",
};

const functionalOwnerOptions = ["Sales", "Channel", "Marketing", "Alliance"];
const leadCaptureMethods = ["Badge Scan", "CSV Upload", "Webinar Registration", "Sales Nomination", "Partner List", "Manual Entry"];
const followUpTimelineOptions = ["24 hours", "2 business days", "5 business days", "10 business days", "No follow-up required"];
const requiredCostCsvColumns = ["Cost Category", "Estimated Amount", "Vendor", "Notes"];
const requiredContactCsvColumns = ["First Name", "Last Name", "Email", "Company", "Title", "Phone", "Country", "Capture Method", "Consent Status", "Notes"];
const genericEmailPrefixes = ["info", "sales", "contact", "hello", "admin", "support"];
const requiredConversationCsvColumns = [
  "Contact Email",
  "Company",
  "Contact Name",
  "Title",
  "Conversation Owner",
  "Conversation Summary",
  "Product Interest",
  "Is Sales Lead",
  "Lead Quality",
  "Buying Timeline",
  "Estimated Opportunity Size",
  "Next Step",
  "Follow-Up Owner",
  "Follow-Up Date",
  "Notes",
];
const objectiveCategoryOptions = [
  "Brand presence and credibility",
  "Marketing list growth",
  "Sales lead generation",
  "Channel expansion",
  "Partner obligation and enablement",
  "Customer retention and expansion",
  "Market intelligence",
];

const defaultFilter: EventFilter = { key: "all", label: "All events" };

const defaultListFilters: EventListFilters = {
  search: "",
  eventStatus: "All",
  region: "All",
  owner: "All",
  eventType: "All",
  eventTier: "All",
  approvalStatus: "All",
  overdueItems: "All",
  startDateFrom: "",
  startDateTo: "",
  functionalOwner: "All",
  costVariance: "All",
  commitmentStatus: "All",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-US");

let runtimeWorkflowData: WorkflowData | null = null;

function getWorkflowData(): WorkflowData {
  return runtimeWorkflowData ?? {
    contacts: eventContacts,
    conversations: eventConversations,
    costLines: eventCostLines,
    objectives: eventObjectives,
    uploads,
    duplicates: initialDuplicates,
    syncRecords: [],
  };
}

function setRuntimeWorkflowData(data: WorkflowData) {
  runtimeWorkflowData = data;
}

function getScorecardData(reminders: Reminder[]) {
  const data = getWorkflowData();
  return {
    objectives: data.objectives,
    contacts: data.contacts,
    conversations: data.conversations,
    costLines: data.costLines,
    syncRecords: data.syncRecords,
    duplicates: data.duplicates,
    reminders,
  };
}

function App() {
  const [view, setView] = useState<AppView>("dashboard");
  const [role, setRole] = useState<Role>("Leadership");
  const [isLoadingDemo, setIsLoadingDemo] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>(initialDuplicates);
  const [contactEntries, setContactEntries] = useState<EventContact[]>(eventContacts);
  const [conversationEntries, setConversationEntries] = useState<EventConversation[]>(eventConversations);
  const [costLineEntries, setCostLineEntries] = useState<EventCostLine[]>(eventCostLines);
  const [objectiveEntries, setObjectiveEntries] = useState<EventObjective[]>(eventObjectives);
  const [uploadEntries, setUploadEntries] = useState<UploadBatch[]>(uploads);
  const [syncEntries, setSyncEntries] = useState<HubSpotSyncRecord[]>(() => buildHubSpotSyncQueue(initialEvents));
  const [approvalState, setApprovalState] = useState<ApprovalState>(() => createInitialApprovalState(initialEvents));
  const [activityLogEntries, setActivityLogEntries] = useState<ActivityLog[]>(initialActivityLogs);
  const [reminderEntries, setReminderEntries] = useState<Reminder[]>(() => createReminderQueue(initialEvents, reminders));
  const [selectedId, setSelectedId] = useState(initialEvents[0].id);
  const [selectedDetailTab, setSelectedDetailTab] = useState<DetailTab>("Overview");
  const [eventFilter, setEventFilter] = useState<EventFilter>(defaultFilter);
  const eventsWithDerivedCosts = useMemo(() => deriveEventsWithCostTotals(events, costLineEntries), [events, costLineEntries]);
  const workflowData = { contacts: contactEntries, conversations: conversationEntries, costLines: costLineEntries, objectives: objectiveEntries, uploads: uploadEntries, duplicates, syncRecords: syncEntries };
  setRuntimeWorkflowData(workflowData);
  const visibleEvents = useMemo(() => getVisibleEventsForRole(eventsWithDerivedCosts, role, workflowData), [eventsWithDerivedCosts, role, conversationEntries, syncEntries]);
  const roleScope = useMemo(() => getRoleScopeSummary(role), [role]);
  const selectedEvent = eventsWithDerivedCosts.find((event) => event.id === selectedId) ?? visibleEvents[0] ?? eventsWithDerivedCosts[0];

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoadingDemo(false), 450);
    return () => window.clearTimeout(timer);
  }, []);

  const notify = (tone: ToastTone, title: string, message: string) => {
    const id = `TOAST-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, tone, title, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  };

  const totals = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        acc.budget += event.budget;
        acc.forecast += event.forecastPipeline;
        acc.actual += event.actualPipeline;
        acc.leads += event.leads;
        acc.mqls += event.mqls;
        acc.needsReview += event.hubspotStatus === "Held for review" || event.duplicates > 0 ? 1 : 0;
        return acc;
      },
      { budget: 0, forecast: 0, actual: 0, leads: 0, mqls: 0, needsReview: 0 },
    );
  }, [events]);

  const updateEvent = (eventId: string, patch: Partial<EventRecord>) => {
    setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)));
  };

  const updateCostLineActual = (costLineId: string, value: number) => {
    setCostLineEntries((current) => current.map((line) => (line.cost_line_id === costLineId ? { ...line, actual_amount: value } : line)));
  };

  const updateObjective = (objectiveId: string, patch: Partial<EventObjective>) => {
    setObjectiveEntries((current) =>
      current.map((objective) => {
        if (objective.objective_id !== objectiveId) return objective;
        const nextObjective = { ...objective, ...patch };
        return {
          ...nextObjective,
          status: getDerivedObjectiveStatus(nextObjective),
        };
      }),
    );
  };

  const saveCreateEventDraft = (form: CreateEventForm, existingEventId?: string | null) => {
    const result = buildCreateEventPersistResult(form, "Draft", role, existingEventId ?? undefined);
    const wasExisting = events.some((event) => event.event_id === result.event.event_id);

    setEvents((current) => upsertEventRecord(current, result.event));
    setCostLineEntries((current) => replaceEventRows(current, result.event.event_id, result.costLines));
    setObjectiveEntries((current) => replaceEventRows(current, result.event.event_id, result.objectives));
    setSelectedId(result.event.id);
    appendActivityLogs(setActivityLogEntries, [
      ...(wasExisting ? [] : [createActivityLog(result.event.event_id, role, "Event created", `${result.event.event_name} was created from the local intake form.`, "Create Event")]),
      createActivityLog(result.event.event_id, role, "Draft saved", `${result.event.event_name} was saved as a Draft event and added to Event List.`, "Create Event"),
    ]);

    return result.event;
  };

  const submitCreateEventForApproval = (form: CreateEventForm, existingEventId?: string | null) => {
    const result = buildCreateEventPersistResult(form, "Submitted", role, existingEventId ?? undefined);
    const wasExisting = events.some((event) => event.event_id === result.event.event_id);
    const requiredApprovers = getRequiredApprovers(result.event);
    const visibilityNotices = getApprovalVisibilityNotices(result.event);
    const generatedReminders = getDefaultRemindersForEvent(result.event).map((reminder) => ({
      ...reminder,
      status: getReminderDueState(reminder) === "Overdue" ? "Overdue" as const : reminder.status,
    }));

    setEvents((current) => upsertEventRecord(current, result.event));
    setCostLineEntries((current) => replaceEventRows(current, result.event.event_id, result.costLines));
    setObjectiveEntries((current) => replaceEventRows(current, result.event.event_id, result.objectives));
    setApprovalState((current) => ({ ...current, [result.event.event_id]: current[result.event.event_id] ?? {} }));
    setReminderEntries((current) => mergeEventReminders(current, result.event.event_id, generatedReminders));
    setSelectedId(result.event.id);
    setSelectedDetailTab("Approval");
    appendActivityLogs(setActivityLogEntries, [
      ...(wasExisting ? [] : [createActivityLog(result.event.event_id, role, "Event created", `${result.event.event_name} was created from the local intake form.`, "Create Event")]),
      createActivityLog(result.event.event_id, role, "Event submitted for approval", `${result.event.event_name} was submitted with ${result.costLines.length} cost line(s) and ${result.objectives.length} objective record(s).`, "Approval Workflow"),
      createActivityLog(result.event.event_id, role, "Approval routing generated", `Required approvers: ${requiredApprovers.join(", ") || "None"}. Visibility-only notices: ${visibilityNotices.join(", ") || "None"}.`, "Approval Workflow"),
      createActivityLog(result.event.event_id, role, "Cost CSV upload", `${result.costLines.length} initial cost line(s) created. Estimated all-in cost is ${money.format(result.event.estimated_cost_total)}.`, "Cost Estimate"),
      createActivityLog(result.event.event_id, role, "Objectives declared", `Measurable commitments were declared before approval. Commitment status: ${getCommitmentStatusFromObjectives(result.objectives)}.`, "Objectives & Commitments"),
    ]);

    return result.event;
  };

  const addContactUpload = (event: EventRecord, lines: UploadedContactLine[], fileName: string) => {
    const batchId = `UP-${Date.now()}`;
    const newContacts = lines.map((line, index) => uploadedContactLineToEventContact(line, event, batchId, index));
    const newDuplicates = lines
      .map((line, index) => createDuplicateGroupFromContactLine(line, event, batchId, index))
      .filter((duplicate): duplicate is DuplicateGroup => Boolean(duplicate));
    const summary = getContactUploadSummary(lines);
    const batch: UploadBatch = {
      upload_batch_id: batchId,
      event_id: event.event_id,
      upload_type: event.event_type === "Marketing List Build" ? "Marketing List" : "Attendance",
      uploaded_by: event.event_owner,
      upload_date: new Date().toISOString(),
      total_records: lines.length,
      valid_records: summary.ready,
      duplicate_records: summary.duplicatesHeld,
      possible_duplicate_records: summary.possibleDuplicatesHeld,
      failed_records: summary.failed + summary.missingRequired,
      synced_records: 0,
      held_for_review_records: summary.duplicatesHeld + summary.possibleDuplicatesHeld + summary.missingRequired,
      status: summary.duplicatesHeld + summary.possibleDuplicatesHeld + summary.missingRequired + summary.failed > 0 ? "Needs Review" : "Complete",
    };

    const nextContacts = [...contactEntries, ...newContacts];
    setContactEntries(nextContacts);
    setUploadEntries((current) => [...current, batch]);
    if (newDuplicates.length > 0) setDuplicates((current) => [...current, ...newDuplicates]);
    setSyncEntries((current) => upsertSyncRecords(current, buildHubSpotSyncQueue([event], nextContacts, conversationEntries)));
    updateEvent(event.id, {
      leads: nextContacts.filter((contact) => contact.event_id === event.event_id).length,
      duplicates: duplicates.filter((duplicate) => duplicate.eventId === event.event_id && duplicate.action === "Review").length + newDuplicates.length,
      hubspotStatus: newDuplicates.length > 0 || summary.failed > 0 || summary.missingRequired > 0 ? "Held for review" : "Ready to sync",
    });
    notify("success", "Shared contact state updated", `${lines.length} contact rows from ${fileName} now feed duplicate review, HubSpot sync, scorecards, and dashboard metrics.`);
  };

  const addConversationUpload = (event: EventRecord, lines: UploadedConversationLine[], fileName: string) => {
    const batchId = `UP-${Date.now()}`;
    const newConversations = lines.map((line, index) => uploadedConversationLineToEventConversation(line, event, index));
    const duplicateLines = lines.filter((line) => line.status === "Duplicate contact review");
    const newDuplicates = duplicateLines.map((line, index) => ({
      id: `DUP-${batchId}-CONV-${index + 1}`,
      eventId: event.event_id,
      primary: line.contactEmail || line.contactName,
      matched: line.company || "Existing contact review",
      confidence: 82,
      reason: line.reason,
      action: "Review" as const,
    }));
    const summary = getConversationUploadSummary(lines);
    const batch: UploadBatch = {
      upload_batch_id: batchId,
      event_id: event.event_id,
      upload_type: "Conversation Notes",
      uploaded_by: role === "Sales Rep" ? simulatedUserProfile.salesRep : event.event_owner,
      upload_date: new Date().toISOString(),
      total_records: lines.length,
      valid_records: summary.readyLeadSync + summary.intelligenceOnly,
      duplicate_records: summary.duplicateReview,
      possible_duplicate_records: 0,
      failed_records: summary.holdMissing,
      synced_records: 0,
      held_for_review_records: summary.holdMissing + summary.duplicateReview,
      status: summary.holdMissing + summary.duplicateReview > 0 ? "Needs Review" : "Complete",
    };

    const nextConversations = [...conversationEntries, ...newConversations];
    setConversationEntries(nextConversations);
    setUploadEntries((current) => [...current, batch]);
    if (newDuplicates.length > 0) setDuplicates((current) => [...current, ...newDuplicates]);
    setSyncEntries((current) => upsertSyncRecords(current, buildHubSpotSyncQueue([event], contactEntries, nextConversations)));
    updateEvent(event.id, {
      mqls: nextConversations.filter((conversation) => conversation.event_id === event.event_id && conversation.is_sales_lead).length,
      duplicates: duplicates.filter((duplicate) => duplicate.eventId === event.event_id && duplicate.action === "Review").length + newDuplicates.length,
      hubspotStatus: summary.holdMissing + summary.duplicateReview > 0 ? "Held for review" : "Ready to sync",
    });
    notify("success", "Shared conversation state updated", `${lines.length} conversation rows from ${fileName} now feed lead sync, reminders, scorecards, and dashboard metrics.`);
  };

  const applyDuplicateDecision = (record: DuplicateReviewRecord, action: DuplicateReviewAction, status: DuplicateReviewRecord["status"]) => {
    const normalizedUploadedEmail = normalizeEmail(record.uploadedEmail);
    const isResolved = status === "Resolved";
    const nextContactStatus: SyncStatus = isResolved ? "Ready to sync" : "Held for review";
    const nextMatchStatus: MatchStatus = isResolved ? (action === "Create new contact" ? "No Match" : "Matched") : "Possible Duplicate";
    setDuplicates((current) =>
      current.map((duplicate) =>
        duplicate.id === record.id || (duplicate.eventId === record.eventId && normalizeEmail(duplicate.primary) === normalizedUploadedEmail)
          ? { ...duplicate, action: action === "Do not sync" ? "Ignore" : isResolved ? "Merge" : "Review" }
          : duplicate,
      ),
    );
    setContactEntries((current) =>
      current.map((contact) =>
        contact.event_id === record.eventId && normalizeEmail(contact.email) === normalizedUploadedEmail
          ? {
              ...contact,
              skymap_match_status: nextMatchStatus,
              hubspot_sync_status: nextContactStatus,
              error_message: isResolved ? null : `${action}: ${record.matchReason}`,
            }
          : contact,
      ),
    );
    setSyncEntries((current) =>
      current.map((syncRecord) =>
        syncRecord.eventId === record.eventId && normalizeEmail(syncRecord.email) === normalizedUploadedEmail
          ? {
              ...syncRecord,
              syncStatus: isResolved ? "Ready to sync" : "Held for review",
              errorReason: isResolved ? "" : `${action}: ${record.matchReason}`,
              correctionAction: isResolved ? "Ready for next sync simulation" : "Await review owner decision",
            }
          : syncRecord,
      ),
    );
  };

  const approveForRole = (eventId: string) => {
    const event = events.find((item) => item.id === eventId);
    if (!event) return;
    const approval = { ...event.approval };
    if (role === "Marketing Ops") approval.marketing = true;
    if (role === "Finance / CFO") approval.finance = true;
    if (role === "Regional Sales Leader") approval.sales = true;
    if (role === "Leadership") {
      approval.marketing = true;
      approval.finance = true;
      approval.sales = true;
    }
    const allApproved = approval.marketing && approval.finance && approval.sales;
    updateEvent(eventId, { approval, stage: allApproved ? "Approved" : event.stage, status: allApproved ? "On Track" : event.status });
  };

  const resolveDuplicate = (duplicateId: string) => {
    setDuplicates((current) => current.map((item) => (item.id === duplicateId ? { ...item, action: "Merge" } : item)));
  };

  const openFilteredEvents = (filter: EventFilter) => {
    setEventFilter(filter);
    setView("events");
  };

  const handleRoleChange = (nextRole: Role) => {
    const nextVisibleEvents = getVisibleEventsForRole(eventsWithDerivedCosts, nextRole, workflowData);

    setRole(nextRole);
    setSelectedDetailTab("Overview");
    setEventFilter(getDefaultEventFilterForRole(nextRole, nextVisibleEvents));
    if (nextVisibleEvents[0]) setSelectedId(nextVisibleEvents[0].id);
    setView(nextRole === "Leadership" ? "dashboard" : "my-work");
  };

  const getDefaultEventFilterForRole = (nextRole: Role, nextVisibleEvents: EventRecord[]): EventFilter => {
    if (nextRole === "Finance / CFO") {
      const nextFinanceReviewEvents = nextVisibleEvents.filter((event) => event.approval_status === "Finance Review");
      const nextOverBudgetEvents = getFilteredEvents(nextVisibleEvents, "over-budget");
      if (nextFinanceReviewEvents.length > 0) return { key: "approval:Finance Review", label: "Finance Review events" };
      if (nextOverBudgetEvents.length > 0) return { key: "over-budget", label: "Over-budget events" };
      return { key: "missing-cost-reconciliation", label: "Cost reconciliation queue" };
    }
    if (nextRole === "Event Owner") return { key: "all", label: `${simulatedUserProfile.eventOwner}'s events` };
    if (nextRole === "Sales Rep") return { key: "all", label: `${simulatedUserProfile.salesRep}'s attended events and owned leads` };
    if (nextRole === "Regional Sales Leader") return { key: `region:${simulatedUserProfile.region}`, label: `${simulatedUserProfile.region} region events` };
    if (nextRole === "Channel Leader") return { key: "all", label: "Channel and partner events" };
    return defaultFilter;
  };

  const openFirstEventTab = (candidates: EventRecord[], tab: DetailTab, fallback?: () => void) => {
    const event = candidates[0];
    if (event) {
      setSelectedId(event.id);
      setSelectedDetailTab(tab);
      setView("event-detail");
      return;
    }
    if (fallback) {
      fallback();
      return;
    }
    setView("events");
  };

  const visibleEventIds = new Set(visibleEvents.map((event) => event.event_id));
  const visibleConversations = conversationEntries.filter((conversation) => visibleEventIds.has(conversation.event_id));
  const roleScopedConversations = getRoleScopedConversations(role, visibleConversations);
  const visibleSyncRecords = syncEntries.filter((record) => visibleEventIds.has(record.eventId));
  const roleScopedSyncRecords = visibleSyncRecords.filter((record) => isSyncRecordAssignedToRole(role, record, visibleEvents, roleScopedConversations));
  const visibleReminders = reminderEntries.filter((reminder) => visibleEventIds.has(reminder.event_id));
  const eventsForFilter = (key: EventFilterKey) => getFilteredEvents(visibleEvents, key);
  const eventsForIds = (eventIds: Set<string>) => visibleEvents.filter((event) => eventIds.has(event.event_id));
  const overdueLeadReminders = visibleReminders.filter((reminder) => {
    const event = visibleEvents.find((item) => item.event_id === reminder.event_id);
    return (reminder.status === "Overdue" || reminder.status === "Escalated" || getReminderDueState(reminder) === "Overdue") && /Sales Follow-Up|Lead Status/i.test(reminder.reminder_type) && (!event || isReminderOwnedByRole(role, event, reminder));
  });
  const missingLeadFieldConversations = roleScopedConversations.filter((conversation) => conversation.is_sales_lead && conversation.hubspot_sync_status === "Held for review" && /missing|required|complete/i.test(conversation.error_message ?? ""));
  const behindCommitmentEvents = visibleEvents.filter((event) => ["Behind Commitment", "Missed"].includes(getCommitmentStatus(event)) || getEventRiskBadges(event).includes("Behind Commitment"));
  const postEventScorecardEvents = visibleEvents.filter((event) => isPastOrPostEvent(event) || ["Scorecard Active", "Completed", "Post-Event Reporting"].includes(event.approval_status));
  const financeApprovalEvents = visibleEvents.filter((event) => event.approval_status === "Finance Review" || (getRequiredApprovers(event).some((approver) => /Finance|CFO/.test(approver)) && !event.approved_by_finance));
  const varianceExplanationEvents = visibleEvents.filter((event) => event.variance_percentage > 10 && !event.variance_explanation.trim());
  const duplicateReviewRecords = buildDuplicateReviewRecords(visibleEvents, duplicates).filter((record) => record.status === "Open" || record.status === "Sales Ops Review");
  const syncRecordsForRole = role === "Sales Rep" || role === "Event Owner" || role === "Technical Team" ? roleScopedSyncRecords : visibleSyncRecords;
  const failedSyncRecords = syncRecordsForRole.filter((record) => record.syncStatus === "Failed");
  const readySyncRecords = syncRecordsForRole.filter((record) => record.syncStatus === "Ready to sync");
  const heldSyncRecords = syncRecordsForRole.filter((record) => record.syncStatus === "Held for review");
  const leadHandoffRecords = syncRecordsForRole.filter((record) => record.recordType === "Lead" && record.syncStatus !== "Synced");
  const nextActions = getNextActionsForRole(role, {
    visibleEvents,
    eventsForFilter,
    openFilteredEvents,
    openFirstEventTab,
    setView,
    setSelectedDetailTab,
    missingLeadFieldConversations,
    overdueLeadReminders,
    leadHandoffRecords,
    financeApprovalEvents,
    varianceExplanationEvents,
    duplicateReviewRecords,
    readySyncRecords,
    heldSyncRecords,
    failedSyncRecords,
    behindCommitmentEvents,
    postEventScorecardEvents,
    eventsForIds,
  });

  const visibleNavItems = useMemo(() => navItems.filter((item) => canRoleAccessSidebarView(role, item.id)), [role]);
  const effectiveView = canRoleAccessWorkspaceView(role, view) ? view : getDefaultLandingViewForRole(role);
  const scopedUploadEntries = getVisibleUploadsForRole(role, uploadEntries, visibleEvents, conversationEntries);
  const scopedSyncEntries = getVisibleSyncRecordsForRole(role, syncEntries, visibleEvents, conversationEntries);
  const scopedScorecardData = getScorecardDataForRole(role, visibleEvents, reminderEntries);
  const currentTitle = getRoleFacingLabel(role, getViewTitle(effectiveView));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-800 bg-slate-950 lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-800 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-emerald-500 text-slate-950">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">DTEN.me</p>
                <p className="text-lg font-semibold text-white">Event Execution</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-2 px-3 py-5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  aria-current={effectiveView === item.id ? "page" : undefined}
                  onClick={() => {
                    if (item.id === "events") setEventFilter(defaultFilter);
                    setView(item.id);
                  }}
                  className={`group flex min-h-11 w-full items-center gap-3 rounded-full border border-transparent px-3.5 py-2.5 text-left text-sm font-medium transition ${
                    effectiveView === item.id ? "border-emerald-500/35 bg-slate-900 text-emerald-500" : "text-slate-500 hover:border-slate-800 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {getRoleFacingLabel(role, item.label)}
                </button>
              );
            })}
          </nav>
          <div className="m-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product boundary</p>
            <p className="mt-2 text-sm leading-5 text-slate-700">
              DTEN.me orchestrates workflow. SkyMap handles routing. HubSpot receives engagement activity.
            </p>
          </div>
        </div>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Internal prototype</p>
              <h1 className="page-title">{currentTitle}</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Search events, owners, routes"
                  className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-slate-400 sm:w-72 xl:w-80"
                  placeholder="Search events, owners, routes"
                />
              </div>
              <select
                value={role}
                onChange={(event) => handleRoleChange(event.target.value as Role)}
                aria-label="Switch role"
                className="h-10 min-w-52 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-slate-400"
              >
                {roles.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
          <nav className="mobile-nav lg:hidden" aria-label="Primary navigation">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  aria-current={effectiveView === item.id ? "page" : undefined}
                  onClick={() => {
                    if (item.id === "events") setEventFilter(defaultFilter);
                    setView(item.id);
                  }}
                  className={`mobile-nav-item ${effectiveView === item.id ? "is-active" : ""}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{getRoleFacingLabel(role, item.label)}</span>
                </button>
              );
            })}
          </nav>
          <RoleScopeBanner role={role} scope={roleScope} visibleCount={visibleEvents.length} totalCount={eventsWithDerivedCosts.length} />
          {effectiveView !== "my-work" && <MyNextActionsStrip role={role} actions={nextActions} />}
      </header>

        <ToastStack toasts={toasts} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

        <section className="px-4 py-6 md:px-8">
          {isLoadingDemo ? (
            <DemoLoadingState />
          ) : null}
          {!isLoadingDemo && effectiveView === "my-work" && (
            <MyWork
              role={role}
              events={visibleEvents}
              reminders={visibleReminders}
              activityLogs={activityLogEntries}
              nextActions={nextActions}
              openFilteredEvents={openFilteredEvents}
              setView={setView}
              setSelectedId={setSelectedId}
              setSelectedDetailTab={setSelectedDetailTab}
            />
          )}
          {!isLoadingDemo && effectiveView === "dashboard" && <Dashboard events={visibleEvents} reminders={reminderEntries} openFilteredEvents={openFilteredEvents} setView={setView} setSelectedId={setSelectedId} setSelectedDetailTab={setSelectedDetailTab} notify={notify} />}
          {effectiveView === "events" && <EventList events={visibleEvents} role={role} reminders={reminderEntries} filter={eventFilter} setFilter={setEventFilter} setView={setView} setSelectedId={setSelectedId} setSelectedDetailTab={setSelectedDetailTab} />}
          {effectiveView === "event-detail" && (
            <EventDetail
              event={selectedEvent}
              role={role}
              selectedDetailTab={selectedDetailTab}
              setSelectedDetailTab={setSelectedDetailTab}
              objectives={objectiveEntries}
              approvalState={approvalState}
              activityLogs={activityLogEntries}
              reminders={reminderEntries}
              setApprovalState={setApprovalState}
              setActivityLogs={setActivityLogEntries}
              setReminders={setReminderEntries}
              updateEvent={updateEvent}
              updateCostLineActual={updateCostLineActual}
              updateObjective={updateObjective}
              onContactsUploaded={addContactUpload}
              onConversationsUploaded={addConversationUpload}
              notify={notify}
            />
          )}
          {effectiveView === "event-create" && <CreateEvent role={role} notify={notify} onSaveDraft={saveCreateEventDraft} onSubmitForApproval={submitCreateEventForApproval} />}
          {effectiveView === "uploads" && (
            <UploadsSection
              events={visibleEvents}
              role={role}
              uploads={scopedUploadEntries}
              reminders={reminderEntries}
              setActivityLogs={setActivityLogEntries}
              onContactsUploaded={addContactUpload}
              onConversationsUploaded={addConversationUpload}
              updateEvent={updateEvent}
              updateCostLineActual={updateCostLineActual}
              setView={setView}
              setSelectedId={setSelectedId}
              setSelectedDetailTab={setSelectedDetailTab}
              notify={notify}
            />
          )}
          {effectiveView === "data-review" && (
            <DataReview
              duplicates={duplicates}
              events={visibleEvents}
              role={role}
              records={scopedSyncEntries}
              activityLogs={activityLogEntries}
              setRecords={setSyncEntries}
              setContacts={setContactEntries}
              setConversations={setConversationEntries}
              setActivityLogs={setActivityLogEntries}
              resolveDuplicate={resolveDuplicate}
              applyDuplicateDecision={applyDuplicateDecision}
              updateEvent={updateEvent}
              setView={setView}
              setSelectedId={setSelectedId}
              setSelectedDetailTab={setSelectedDetailTab}
              notify={notify}
            />
          )}
          {effectiveView === "scorecards" && <Scorecards events={visibleEvents} scorecardData={scopedScorecardData} role={role} />}
          {effectiveView === "admin" && <AdminSettings />}
        </section>
      </main>
    </div>
  );
}

function MyWork({
  role,
  events,
  reminders,
  activityLogs,
  nextActions,
  openFilteredEvents,
  setView,
  setSelectedId,
  setSelectedDetailTab,
}: {
  role: Role;
  events: EventRecord[];
  reminders: Reminder[];
  activityLogs: ActivityLog[];
  nextActions: NextActionCard[];
  openFilteredEvents: (filter: EventFilter) => void;
  setView: (view: AppView) => void;
  setSelectedId: (id: string) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
}) {
  const data = getWorkflowData();
  const eventMap = new Map(events.map((event) => [event.event_id, event]));
  const visibleEventIds = new Set(events.map((event) => event.event_id));
  const visibleSyncRecords = data.syncRecords.filter((record) => visibleEventIds.has(record.eventId));
  const roleScopedConversations = getRoleScopedConversations(role, data.conversations.filter((conversation) => visibleEventIds.has(conversation.event_id)));
  const roleScopedSyncRecords = visibleSyncRecords.filter((record) => isSyncRecordAssignedToRole(role, record, events, roleScopedConversations));
  const visibleDuplicateRecords = buildDuplicateReviewRecords(events, data.duplicates).filter((record) => record.status === "Open" || record.status === "Sales Ops Review");
  const openEventTab = (event: EventRecord, tab: DetailTab = "Overview") => {
    setSelectedId(event.id);
    setSelectedDetailTab(tab);
    setView("event-detail");
  };
  const makeEventItem = (event: EventRecord, detail: string, badge: string, tab: DetailTab = "Overview"): MyWorkItem => ({
    id: `${event.event_id}-${tab}-${detail}`,
    title: event.event_name,
    meta: `${event.region} · ${event.event_owner} · ${event.approval_status}`,
    detail,
    badge,
    onClick: () => openEventTab(event, tab),
  });

  const missingContactEvents = getFilteredEvents(events, "missing-contact-upload");
  const missingConversationEvents = getFilteredEvents(events, "missing-conversation-upload");
  const missingUploadEvents = getFilteredEvents(events, "missing-uploads");
  const missingCostEvents = getFilteredEvents(events, "missing-cost-reconciliation");
  const overBudgetEvents = getFilteredEvents(events, "over-budget");
  const awaitingApprovalEvents = getFilteredEvents(events, "awaiting-approval");
  const syncRecordsForRole = role === "Sales Rep" || role === "Event Owner" || role === "Technical Team" ? roleScopedSyncRecords : visibleSyncRecords;
  const failedSyncEvents = uniqueEventsFromIds(events, new Set(syncRecordsForRole.filter((record) => record.syncStatus === "Failed").map((record) => record.eventId)));
  const heldSyncEvents = uniqueEventsFromIds(events, new Set(syncRecordsForRole.filter((record) => record.syncStatus === "Held for review").map((record) => record.eventId)));
  const duplicateEvents = uniqueEventsFromIds(events, new Set(visibleDuplicateRecords.map((record) => record.eventId)));
  const behindCommitmentEvents = events.filter((event) => ["Behind Commitment", "Missed"].includes(getCommitmentStatus(event)) || getEventRiskBadges(event).includes("Behind Commitment"));
  const draftEvents = events.filter((event) => event.approval_status === "Draft" || event.approval_status === "Needs Revision");
  const varianceExplanationEvents = events.filter((event) => event.variance_percentage > 10 && !event.variance_explanation.trim());
  const financeApprovalEvents = events.filter((event) => event.approval_status === "Finance Review" || (getRequiredApprovers(event).some((approver) => /Finance|CFO/.test(approver)) && !event.approved_by_finance));
  const leadHandoffEvents = uniqueEventsFromIds(events, new Set(syncRecordsForRole.filter((record) => record.recordType === "Lead" && record.syncStatus !== "Synced").map((record) => record.eventId)));
  const missingLeadFieldEvents = uniqueEventsFromIds(
    events,
    new Set(
      roleScopedConversations
        .filter((conversation) => conversation.is_sales_lead && conversation.hubspot_sync_status === "Held for review" && /missing|required|complete/i.test(conversation.error_message ?? ""))
        .map((conversation) => conversation.event_id),
    ),
  );
  const overdueLeadEvents = uniqueEventsFromIds(
    events,
    new Set(
      reminders
        .filter((reminder) => {
          const event = eventMap.get(reminder.event_id);
          return Boolean(event) && (reminder.status === "Overdue" || reminder.status === "Escalated" || getReminderDueState(reminder) === "Overdue") && /Sales Follow-Up|Lead Status/i.test(reminder.reminder_type) && isReminderOwnedByRole(role, event!, reminder);
        })
        .map((reminder) => reminder.event_id),
    ),
  );

  const eventsNeedingAction = getMyWorkEventItems(role, {
    draftEvents,
    missingContactEvents,
    missingConversationEvents,
    missingUploadEvents,
    missingCostEvents,
    overBudgetEvents,
    awaitingApprovalEvents,
    failedSyncEvents,
    heldSyncEvents,
    duplicateEvents,
    behindCommitmentEvents,
    varianceExplanationEvents,
    financeApprovalEvents,
    leadHandoffEvents,
    missingLeadFieldEvents,
    overdueLeadEvents,
    makeEventItem,
  }).slice(0, 8);

  const overdueReminderItems = reminders
    .filter((reminder) => reminder.status !== "Completed" && getReminderDueState(reminder) === "Overdue")
    .filter((reminder) => {
      const event = eventMap.get(reminder.event_id);
      return event ? isReminderOwnedByRole(role, event, reminder) : role === "Admin";
    })
    .slice(0, 8)
    .map<MyWorkItem>((reminder) => {
      const event = eventMap.get(reminder.event_id);
      return {
        id: reminder.reminder_id,
        title: reminder.reminder_type,
        meta: `${event?.event_name ?? reminder.event_id} · owner: ${reminder.owner}`,
        detail: `Due ${formatDate(reminder.due_date)} · escalation: ${reminder.escalation_owner}`,
        badge: "Behind Commitment",
        onClick: () => {
          if (event) openEventTab(event, "Reminders");
        },
      };
    });

  const blockedRecords = getMyWorkBlockedRecords(role, events, reminders, syncRecordsForRole, visibleDuplicateRecords, varianceExplanationEvents, missingCostEvents, overBudgetEvents, behindCommitmentEvents, openEventTab).slice(0, 8);
  const recentUpdates = getRecentUpdatedEventItems(events, activityLogs, openEventTab).slice(0, 8);
  const exceptionCount = eventsNeedingAction.length + overdueReminderItems.length + blockedRecords.length;

  return (
    <div className="space-y-6">
      <Panel
        title="My Work"
        action={<PrimaryStatusBadge status={exceptionCount > 0 ? "Needs your action" : "Ready"} />}
        className="spatial-signature-panel"
      >
        <div className="my-work-hero-grid grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{role} task center</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{getMyWorkHeadline(role)}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">What needs your attention now. {getMyWorkDescription(role)}</p>
            {nextActions[0] && (
              <div className="my-work-priority mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start here</p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{nextActions[0].title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{nextActions[0].copy}</p>
                  </div>
                  <RiskBadge value={nextActions[0].badge ?? (nextActions[0].count > 0 ? "Needs Review" : "Healthy")} label={`${number.format(nextActions[0].count)} item${nextActions[0].count === 1 ? "" : "s"}`} />
                </div>
              </div>
            )}
          </div>
          <div className="my-work-metrics grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <MiniStat label="Events needing action" value={String(eventsNeedingAction.length)} />
            <MiniStat label="Overdue reminders" value={String(overdueReminderItems.length)} />
            <MiniStat label="Blocked records" value={String(blockedRecords.length)} />
          </div>
        </div>
      </Panel>

      <MyNextActionsStrip role={role} actions={nextActions} />

      <div className="grid gap-6 xl:grid-cols-2">
        <WorkQueue title="Events needing my action" items={eventsNeedingAction} emptyTitle="No actions assigned" emptyCopy="There is nothing assigned to your role right now." />
        <WorkQueue title="Overdue reminders assigned to me" items={overdueReminderItems} emptyTitle="No overdue reminders assigned to you" emptyCopy="Overdue owner or escalation reminders will show here when they need attention." />
        <WorkQueue title="Blocked records I own" items={blockedRecords} emptyTitle="No blocked records in your queue" emptyCopy="Duplicate, sync, missing field, cost, and exception blockers will appear here." />
        <WorkQueue title="Recently updated events" items={recentUpdates} emptyTitle="No recent updates in this role scope" emptyCopy="Recent approval, upload, sync, reminder, and scorecard activity will appear here." />
      </div>

      <Panel title="Work shortcuts" action={<StageBadge value="All pages still available" />}>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => openFilteredEvents({ key: "awaiting-approval", label: "Awaiting approval" })}>Approval queue</button>
          <button className="btn-secondary" onClick={() => openFilteredEvents({ key: "missing-uploads", label: "Missing uploads" })}>Missing uploads</button>
          <button className="btn-secondary" onClick={() => setView("data-review")}>{getRoleFacingLabel(role, "Duplicate Review")}</button>
          <button className="btn-secondary" onClick={() => setView("data-review")}>{getRoleFacingLabel(role, "HubSpot Sync")}</button>
          <button className="btn-secondary" onClick={() => setView("scorecards")}>Scorecards</button>
          {role === "Admin" && <button className="btn-secondary" onClick={() => setView("admin")}>Admin Settings</button>}
        </div>
      </Panel>
    </div>
  );
}

function Dashboard({
  events,
  reminders,
  openFilteredEvents,
  setView,
  setSelectedId,
  setSelectedDetailTab,
  notify,
}: {
  events: EventRecord[];
  reminders: Reminder[];
  openFilteredEvents: (filter: EventFilter) => void;
  setView: (view: AppView) => void;
  setSelectedId: (id: string) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const summary = getDashboardSummary(events);
  const reminderSummary = getReminderSummary(reminders);
  const urgentReminders = reminders
    .filter((reminder) => reminder.status === "Overdue" || reminder.status === "Escalated" || getReminderDueState(reminder) === "Overdue")
    .slice(0, 6);
  const approvalRows = approvalPipeline.map((status) => ({
    label: status,
    count: events.filter((event) => event.approval_status === status).length,
    filter: { key: `approval:${status}` as EventFilterKey, label: `${status} events` },
  }));
  const riskRows = [
    { label: "Missing contact upload", count: getFilteredEvents(events, "missing-contact-upload").length, badge: "Missing Data", filter: { key: "missing-contact-upload" as EventFilterKey, label: "Missing contact upload" } },
    { label: "Missing conversation upload", count: getFilteredEvents(events, "missing-conversation-upload").length, badge: "Missing Data", filter: { key: "missing-conversation-upload" as EventFilterKey, label: "Missing conversation upload" } },
    { label: "Failed HubSpot sync", count: getFilteredEvents(events, "failed-sync").length, badge: "Sync Issue", filter: { key: "failed-sync" as EventFilterKey, label: "Failed HubSpot sync" } },
    { label: "Duplicate review pending", count: getFilteredEvents(events, "duplicate-review").length, badge: "Needs Review", filter: { key: "duplicate-review" as EventFilterKey, label: "Duplicate review pending" } },
    { label: "Cost variance >10%", count: getFilteredEvents(events, "cost-variance").length, badge: "Over Budget", filter: { key: "cost-variance" as EventFilterKey, label: "Cost variance >10%" } },
    { label: "Follow-up overdue", count: getFilteredEvents(events, "follow-up-overdue").length, badge: "Behind Commitment", filter: { key: "follow-up-overdue" as EventFilterKey, label: "Follow-up overdue" } },
  ];
  const regionalRows = regions.map((region) => getRegionalPerformance(events, region));
  const cohortRows = getAgedCohorts(events);

  return (
    <div className="space-y-6">
      <DemoModeGuide
        events={events}
        setView={setView}
        setSelectedId={setSelectedId}
        setSelectedDetailTab={setSelectedDetailTab}
        openFilteredEvents={openFilteredEvents}
        notify={notify}
      />

      <Panel title="Leadership Command Center" action={<RiskBadge value={summary.failedSyncEvents || summary.eventsOverBudget ? "Needs Review" : "Healthy"} label="Executive view" />} className="spatial-signature-panel">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Demo narrative</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Approve the right events, clean the data, sync what is ready, and review outcomes by cohort.</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">DTEN.me is the workflow layer. SkyMap validates and routes records. HubSpot receives marketing contacts and qualified leads. Twenty remains a Phase 2 preview only.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Visible demo events" value={String(events.length)} />
            <MiniStat label="Open risks" value={String(events.filter((event) => getEventRiskBadges(event).some((risk) => risk !== "Healthy")).length)} />
            <MiniStat label="Approval queue" value={String(getFilteredEvents(events, "awaiting-approval").length)} />
            <MiniStat label="Post-event queue" value={String(postEventStatuses.reduce((sum, status) => sum + events.filter((event) => event.approval_status === status).length, 0))} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricButton title="Total approved events" value={String(summary.totalApprovedEvents)} detail="Approved or later stage" badge="Healthy" icon={CheckCircle2} onClick={() => openFilteredEvents({ key: "approved", label: "Approved events" })} />
        <MetricButton title="Total estimated spend" value={money.format(summary.estimatedSpend)} detail="Planned event investment" icon={CircleDollarSign} onClick={() => openFilteredEvents(defaultFilter)} />
        <MetricButton title="Total actual spend" value={money.format(summary.actualSpend)} detail="Posted actuals to date" icon={CircleDollarSign} onClick={() => openFilteredEvents({ key: "missing-cost-reconciliation", label: "Missing cost reconciliation" })} />
        <MetricButton title="Events over budget" value={String(summary.eventsOverBudget)} detail="Actual cost exceeds estimate" badge="Over Budget" icon={TriangleAlert} onClick={() => openFilteredEvents({ key: "over-budget", label: "Events over budget" })} />
        <MetricButton title="Contacts uploaded" value={number.format(summary.contactsUploaded)} detail="Captured across events" icon={Users} onClick={() => openFilteredEvents({ key: "contacts-uploaded", label: "Events with uploaded contacts" })} />
        <MetricButton title="Prospects synced to HubSpot" value={number.format(summary.prospectsSynced)} detail="Contact records synced" badge={summary.failedSyncEvents ? "Sync Issue" : "Healthy"} icon={DatabaseZap} onClick={() => openFilteredEvents({ key: "contacts-synced", label: "Prospects synced to HubSpot" })} />
        <MetricButton title="Conversations uploaded" value={number.format(summary.conversationsUploaded)} detail="Sales notes captured" icon={FileCheck2} onClick={() => openFilteredEvents({ key: "conversations-uploaded", label: "Events with conversations uploaded" })} />
        <MetricButton title="Leads synced to HubSpot" value={number.format(summary.leadsSynced)} detail="Sales lead records synced" badge={summary.leadsSynced === 0 ? "Needs Review" : "Healthy"} icon={ShieldCheck} onClick={() => openFilteredEvents({ key: "leads-synced", label: "Leads synced to HubSpot" })} />
        <MetricButton title="Duplicate contacts held" value={number.format(summary.duplicateContactsHeld)} detail="Held or needs review" badge="Needs Review" icon={Layers3} onClick={() => openFilteredEvents({ key: "duplicate-held", label: "Duplicate contacts held" })} />
        <MetricButton title="Missing attendee list" value={String(summary.missingAttendeeList)} detail="Post-event attendance gap" badge="Missing Data" icon={CloudUpload} onClick={() => openFilteredEvents({ key: "missing-attendee-list", label: "Events missing attendee list" })} />
        <MetricButton title="Missing cost reconciliation" value={String(summary.missingCostReconciliation)} detail="Past events without actuals" badge="Missing Data" icon={CircleDollarSign} onClick={() => openFilteredEvents({ key: "missing-cost-reconciliation", label: "Events missing cost reconciliation" })} />
        <MetricButton title="Non-measurable events" value={String(summary.nonMeasurableEvents)} detail="Excluded from pipeline scorecard" icon={BarChart3} onClick={() => openFilteredEvents({ key: "non-measurable", label: "Non-measurable events" })} />
        <MetricButton title="Marketing-list-only events" value={String(summary.marketingListOnlyEvents)} detail="Audience hygiene, no pipeline" icon={ListChecks} onClick={() => openFilteredEvents({ key: "marketing-list-only", label: "Marketing-list-only events" })} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel title="Approval Pipeline" action={<button className="btn-secondary" onClick={() => openFilteredEvents(defaultFilter)}>View all events</button>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {approvalRows.map((row) => (
              <button key={row.label} onClick={() => openFilteredEvents(row.filter)} className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.label}</p>
                <p className="mt-3 text-3xl font-semibold">{row.count}</p>
                <div className="mt-4 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-slate-950" style={{ width: `${Math.max(8, (row.count / Math.max(events.length, 1)) * 100)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Post-Event Risk" action={<button className="btn-secondary" onClick={() => setView("data-review")}>Review sync</button>}>
          <div className="space-y-3">
            {riskRows.map((row) => (
              <button key={row.label} onClick={() => openFilteredEvents(row.filter)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold">{row.label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{row.count} event{row.count === 1 ? "" : "s"} need attention</p>
                </div>
                <RiskBadge value={row.count > 0 ? row.badge : "Healthy"} />
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Reminder Panel" action={<RiskBadge value={reminderSummary.overdue > 0 ? "Behind Commitment" : "Healthy"} label={`${reminderSummary.overdue} overdue`} />}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniStat label="Open reminders" value={String(reminderSummary.open)} />
          <MiniStat label="Overdue" value={String(reminderSummary.overdue)} />
          <MiniStat label="Escalated" value={String(reminderSummary.escalated)} />
          <MiniStat label="Completed" value={String(reminderSummary.completed)} />
        </div>
        <div className="mt-4 space-y-2">
          {urgentReminders.map((reminder) => {
            const event = events.find((item) => item.event_id === reminder.event_id);
            return (
              <button
                key={reminder.reminder_id}
                onClick={() => {
	                  if (event) {
	                    setSelectedId(event.id);
	                    setSelectedDetailTab("Reminders");
	                    setView("event-detail");
	                  }
                }}
                className="flex w-full flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">{reminder.reminder_type}: {reminder.owner}</p>
                  <p className="mt-1 text-sm text-slate-500">{event?.event_name ?? reminder.event_id} · due {formatDate(reminder.due_date)} · escalation: {reminder.escalation_owner}</p>
                </div>
                <ReminderStatusBadge reminder={reminder} />
              </button>
            );
          })}
          {urgentReminders.length === 0 && <p className="text-sm text-slate-500">No overdue reminders right now.</p>}
        </div>
      </Panel>

      <Panel title="Regional Performance Table">
        <div className="table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Follow-up compliance</th>
                <th className="px-4 py-3">Overdue items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {regionalRows.map((row) => (
                <tr key={row.region} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <button className="font-semibold hover:underline" onClick={() => openFilteredEvents({ key: `region:${row.region}`, label: `${row.region} events` })}>{row.region}</button>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{row.events}</td>
                  <td className="px-4 py-4 text-slate-600">{money.format(row.spend)}</td>
                  <td className="px-4 py-4 text-slate-600">{number.format(row.contacts)}</td>
                  <td className="px-4 py-4 text-slate-600">{number.format(row.leads)}</td>
                  <td className="px-4 py-4"><RiskBadge value={row.compliance >= 90 ? "Healthy" : row.compliance >= 70 ? "Needs Review" : "Behind Commitment"} label={`${row.compliance}%`} /></td>
                  <td className="px-4 py-4"><button className="font-semibold text-slate-800 hover:underline" onClick={() => openFilteredEvents({ key: `region:${row.region}`, label: `${row.region} events` })}>{row.overdueItems}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Aged Cohort View">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cohortRows.map((row) => (
            <button key={row.label} onClick={() => openFilteredEvents({ key: `cohort:${row.label}`, label: `${row.label} event cohort` })} className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{row.label}</p>
                <RiskBadge value={row.risk} />
              </div>
              <p className="mt-3 text-3xl font-semibold">{row.events}</p>
              <p className="mt-1 text-sm text-slate-500">{row.overdueItems} overdue item{row.overdueItems === 1 ? "" : "s"}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Leadership pipeline view" action={<button className="btn-secondary" onClick={() => setView("scorecards")}>Open scorecards</button>}>
        <div className="space-y-4">
          {events.slice(0, 5).map((event) => {
            const percent = Math.min(100, Math.round((event.actualPipeline / Math.max(event.forecastPipeline, 1)) * 100));
            return (
              <button
                key={event.id}
                onClick={() => {
                  setSelectedId(event.id);
                  setSelectedDetailTab("Overview");
                  setView("event-detail");
                }}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{event.name}</h3>
                      <StatusBadge value={event.status} />
                      <StageBadge value={event.stage} />
                      {getEventRiskBadges(event).slice(0, 2).map((badge) => <RiskBadge key={badge} value={badge} />)}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{event.city} · {event.owner} · {event.skymapRoute}</p>
                  </div>
                  <ChevronRight className="hidden size-5 text-slate-400 md:block" />
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-xs font-medium text-slate-500">
                    <span>{money.format(event.actualPipeline)} actual</span>
                    <span>{money.format(event.forecastPipeline)} forecast</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function RoleScopeBanner({ role, scope, visibleCount, totalCount }: { role: Role; scope: RoleScopeSummary; visibleCount: number; totalCount: number }) {
  return (
    <div className="role-scope-banner mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
            <Users className="size-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{role} scope</p>
              {scope.persona && <StageBadge value={scope.persona} />}
              {role === "Admin" || role === "Leadership" ? <StageBadge value="All events visible" /> : null}
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">{scope.scope}</p>
          </div>
        </div>
        <div className="role-scope-count rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 xl:text-right">
          {visibleCount} of {totalCount} events visible
        </div>
      </div>
    </div>
  );
}

function MyNextActionsStrip({ role, actions }: { role: Role; actions: NextActionCard[] }) {
  return (
    <div className="next-actions-strip mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">My Next Actions</p>
          <h3 className="text-sm font-semibold text-slate-950">{role} task shortcuts</h3>
        </div>
        <StageBadge value="Prototype local state" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.title}
            type="button"
            onClick={action.onClick}
            title={action.copy}
            className="next-action-card group rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{action.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{action.copy}</p>
              </div>
              <span className="rounded-md bg-white px-2.5 py-1 text-sm font-semibold text-slate-950 ring-1 ring-slate-200 group-hover:bg-slate-950 group-hover:text-white">
                {number.format(action.count)}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <RiskBadge value={action.badge ?? (action.count > 0 ? "Needs Review" : "Healthy")} />
              <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-950">Open</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkQueue({ title, items, emptyTitle, emptyCopy }: { title: string; items: MyWorkItem[]; emptyTitle: string; emptyCopy: string }) {
  return (
    <Panel title={title} action={<StageBadge value={`${items.length} item${items.length === 1 ? "" : "s"}`} />}>
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="flex w-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm md:flex-row md:items-start md:justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                <RiskBadge value={item.badge} />
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{item.meta}</p>
              <p className="mt-2 text-sm leading-5 text-slate-600">{item.detail}</p>
            </div>
            <ChevronRight className="hidden size-5 shrink-0 text-slate-400 md:block" />
          </button>
        ))}
        {items.length === 0 && <EmptyState title={emptyTitle} copy={emptyCopy} />}
      </div>
    </Panel>
  );
}

function getMyWorkEventItems(
  role: Role,
  context: {
    draftEvents: EventRecord[];
    missingContactEvents: EventRecord[];
    missingConversationEvents: EventRecord[];
    missingUploadEvents: EventRecord[];
    missingCostEvents: EventRecord[];
    overBudgetEvents: EventRecord[];
    awaitingApprovalEvents: EventRecord[];
    failedSyncEvents: EventRecord[];
    heldSyncEvents: EventRecord[];
    duplicateEvents: EventRecord[];
    behindCommitmentEvents: EventRecord[];
    varianceExplanationEvents: EventRecord[];
    financeApprovalEvents: EventRecord[];
    leadHandoffEvents: EventRecord[];
    missingLeadFieldEvents: EventRecord[];
    overdueLeadEvents: EventRecord[];
    makeEventItem: (event: EventRecord, detail: string, badge: string, tab?: DetailTab) => MyWorkItem;
  },
) {
  const items: MyWorkItem[] = [];
  const add = (events: EventRecord[], detail: string, badge: string, tab: DetailTab = "Overview") => {
    events.forEach((event) => items.push(context.makeEventItem(event, detail, badge, tab)));
  };

  if (role === "Sales Rep") {
    add(context.missingConversationEvents, "Upload sales conversations so qualified leads can be handed off.", "Missing Data", "Conversation Upload");
    add(context.missingLeadFieldEvents, "Complete required fields for qualified lead handoff.", "Missing Data", "Conversation Upload");
    add(context.overdueLeadEvents, "Follow up overdue event leads and update next steps.", "Behind Commitment", "Reminders");
    add(context.leadHandoffEvents, "Review Lead Handoff Status for held, failed, or pending qualified leads assigned to you.", "Needs Review", "HubSpot Sync");
    add(context.behindCommitmentEvents, "Lead follow-up or commitment performance needs attention.", "Behind Commitment", "Scorecard");
    return uniqueWorkItems(items);
  }

  if (role === "Event Owner") {
    add(context.draftEvents, "Complete the event request and submit it for approval.", "Needs Review", "Approval");
    add(context.missingContactEvents, "Upload contacts from badge scans, attendee lists, partners, or manual event lists.", "Missing Data", "Contact Upload");
    add(context.missingConversationEvents, "Upload event conversations for sales lead review.", "Missing Data", "Conversation Upload");
    add(context.missingCostEvents, "Enter actual cost lines for post-event reconciliation.", "Missing Data", "Cost Estimate");
    add(context.varianceExplanationEvents, "Actual cost is more than 10% over estimate and needs an explanation.", "Over Budget", "Cost Estimate");
    add(context.behindCommitmentEvents, "Review scorecard results and explain commitment gaps.", "Behind Commitment", "Scorecard");
    return uniqueWorkItems(items);
  }

  if (role === "Marketing Ops") {
    add(context.duplicateEvents, "Duplicate or uncertain records need review before HubSpot sync.", "Needs Review", "Duplicate Review");
    add(context.failedSyncEvents, "Failed sync records need Marketing Ops or Technical Team review.", "Sync Issue", "HubSpot Sync");
    add(context.heldSyncEvents, "Held records need review before simulated HubSpot sync.", "Needs Review", "HubSpot Sync");
    add(context.missingUploadEvents, "Event data is incomplete and needs upload queue follow-up.", "Missing Data", "Contact Upload");
    return uniqueWorkItems(items);
  }

  if (role === "Finance / CFO") {
    add(context.financeApprovalEvents, "Spend approval or CFO threshold approval is pending.", "Needs Review", "Approval");
    add(context.missingCostEvents, "Actual cost reconciliation is missing.", "Missing Data", "Cost Estimate");
    add(context.overBudgetEvents, "Actual spend is above the approved estimate.", "Over Budget", "Cost Estimate");
    add(context.varianceExplanationEvents, "Variance above 10% needs explanation.", "Needs Review", "Cost Estimate");
    return uniqueWorkItems(items);
  }

  if (role === "Leadership") {
    add(context.overBudgetEvents, "High-level spend exception needs leadership review.", "Over Budget", "Scorecard");
    add(context.behindCommitmentEvents, "Commitment outcome is behind target.", "Behind Commitment", "Scorecard");
    add(context.failedSyncEvents, "Sync issue may block accurate leadership reporting.", "Sync Issue", "HubSpot Sync");
    add(context.missingUploadEvents, "Missing data may weaken scorecard confidence.", "Missing Data", "Scorecard");
    return uniqueWorkItems(items);
  }

  if (role === "Admin") {
    add(context.awaitingApprovalEvents, "Approval actions across all roles are pending.", "Needs Review", "Approval");
    add(context.duplicateEvents, "Records needing review are blocking clean sync.", "Needs Review", "Duplicate Review");
    add(context.failedSyncEvents, "Failed HubSpot sync records need operational or technical cleanup.", "Sync Issue", "HubSpot Sync");
    add(context.heldSyncEvents, "Held records need Data Review decisions.", "Needs Review", "HubSpot Sync");
    add(context.missingUploadEvents, "Upload queues are incomplete and need owner follow-up.", "Missing Data", "Contact Upload");
    add(context.missingCostEvents, "Cost reconciliation is missing.", "Missing Data", "Cost Estimate");
    add(context.varianceExplanationEvents, "Variance above 10% needs explanation.", "Over Budget", "Cost Estimate");
    add(context.behindCommitmentEvents, "Scorecard commitments are behind target.", "Behind Commitment", "Scorecard");
    return uniqueWorkItems(items);
  }

  if (role === "Regional Sales Leader") {
    add(context.awaitingApprovalEvents, "Regional approval action or commitment review is pending.", "Needs Review", "Approval");
    add(context.overdueLeadEvents, "Regional lead follow-up is overdue.", "Behind Commitment", "Reminders");
    add(context.behindCommitmentEvents, "Regional commitment performance needs review.", "Behind Commitment", "Scorecard");
    add(context.overBudgetEvents, "Spend exception is visible for regional review.", "Over Budget", "Cost Estimate");
    return uniqueWorkItems(items);
  }

  if (role === "Channel Leader") {
    add(context.awaitingApprovalEvents, "Channel, partner, reseller, DMR, or alliance approval action is pending.", "Needs Review", "Approval");
    add(context.behindCommitmentEvents, "Channel or partner commitment is behind target.", "Behind Commitment", "Scorecard");
    add(context.missingConversationEvents, "Partner or channel conversations have not been uploaded.", "Missing Data", "Conversation Upload");
    return uniqueWorkItems(items);
  }

  if (role === "Department Head") {
    add(context.awaitingApprovalEvents, "High-cost or exception approval action is pending.", "Needs Review", "Approval");
    add(context.overBudgetEvents, "Spend exception needs department review.", "Over Budget", "Cost Estimate");
    add(context.varianceExplanationEvents, "Variance exception needs owner or finance explanation.", "Needs Review", "Cost Estimate");
    add(context.behindCommitmentEvents, "Outcome exception needs department review.", "Behind Commitment", "Scorecard");
    return uniqueWorkItems(items);
  }

  if (role === "Technical Team") {
    add(context.failedSyncEvents, "Simulated integration error needs technical review.", "Sync Issue", "HubSpot Sync");
    add(context.heldSyncEvents, "Held sync records may need technical diagnosis.", "Needs Review", "HubSpot Sync");
    return uniqueWorkItems(items);
  }

  add(context.awaitingApprovalEvents, "Approval or routing action is pending for this role.", "Needs Review", "Approval");
  add(context.behindCommitmentEvents, "Commitment performance needs review.", "Behind Commitment", "Scorecard");
  add(context.overBudgetEvents, "Spend exception needs review.", "Over Budget", "Cost Estimate");
  add(context.missingUploadEvents, "Missing event data needs owner follow-up.", "Missing Data", "Contact Upload");
  return uniqueWorkItems(items);
}

function getMyWorkBlockedRecords(
  role: Role,
  events: EventRecord[],
  reminderEntries: Reminder[],
  syncRecords: HubSpotSyncRecord[],
  duplicateRecords: DuplicateReviewRecord[],
  varianceExplanationEvents: EventRecord[],
  missingCostEvents: EventRecord[],
  overBudgetEvents: EventRecord[],
  behindCommitmentEvents: EventRecord[],
  openEventTab: (event: EventRecord, tab?: DetailTab) => void,
) {
  const eventMap = new Map(events.map((event) => [event.event_id, event]));
  const items: MyWorkItem[] = [];
  const relevantSyncRecords = syncRecords.filter((record) => {
    if (!["Held for review", "Failed"].includes(record.syncStatus)) return false;
    if (role === "Finance / CFO") return false;
    return isSyncRecordAssignedToRole(role, record, events, getWorkflowData().conversations);
  });

  relevantSyncRecords.forEach((record) => {
    const event = eventMap.get(record.eventId);
    const leadHandoff = record.recordType === "Lead";
    items.push({
      id: record.id,
      title: `${leadHandoff ? getRoleFacingLabel(role, "HubSpot Sync") : "Record Review"}: ${record.name || record.email || record.id}`,
      meta: `${record.eventName} · owner: ${record.issueOwner}`,
      detail: `${record.syncStatus}. ${record.errorReason || record.correctionAction}`,
      badge: record.syncStatus === "Failed" ? "Sync Issue" : isBusinessInfoSyncRecord(record) ? "Missing Data" : "Needs Review",
      onClick: () => {
        if (event) openEventTab(event, leadHandoff ? "HubSpot Sync" : "Contact Upload");
      },
    });
  });

  if (role === "Marketing Ops" || role === "Admin") {
    duplicateRecords.forEach((record) => {
      const event = eventMap.get(record.eventId);
      if (!event) return;
      items.push({
        id: record.id,
        title: `${getRoleFacingLabel(role, "Records Needing Review")}: ${record.uploadedContact}`,
        meta: `${record.eventName} · ${record.duplicateType} · ${record.confidence} confidence`,
        detail: `${record.matchReason}. Recommended action: ${record.recommendedAction}.`,
        badge: "Needs Review",
        onClick: () => openEventTab(event, "Duplicate Review"),
      });
    });
  }

  if (["Event Owner", "Finance / CFO", "Leadership", "Department Head", "Admin"].includes(role)) {
    varianceExplanationEvents.forEach((event) => {
      items.push({
        id: `${event.event_id}-variance`,
        title: event.event_name,
        meta: `${event.region} · variance ${event.variance_percentage}%`,
        detail: "Actual cost is more than 10% above estimate and needs a variance explanation.",
        badge: "Over Budget",
        onClick: () => openEventTab(event, "Cost Estimate"),
      });
    });
  }

  if (role === "Finance / CFO" || role === "Admin") {
    missingCostEvents.forEach((event) => {
      items.push({
        id: `${event.event_id}-missing-cost`,
        title: event.event_name,
        meta: `${event.region} · ${event.approval_status}`,
        detail: "Actual cost reconciliation is missing for this post-event workflow.",
        badge: "Missing Data",
        onClick: () => openEventTab(event, "Cost Estimate"),
      });
    });
  }

  if (role === "Leadership") {
    [...overBudgetEvents, ...behindCommitmentEvents].forEach((event) => {
      items.push({
        id: `${event.event_id}-leadership-exception`,
        title: event.event_name,
        meta: `${event.region} · ${event.event_owner}`,
        detail: getEventPlainEnglishStatus(event, reminderEntries),
        badge: getEventRiskBadges(event).includes("Over Budget") ? "Over Budget" : "Behind Commitment",
        onClick: () => openEventTab(event, "Scorecard"),
      });
    });
  }

  return uniqueWorkItems(items);
}

function getRecentUpdatedEventItems(events: EventRecord[], activityLogs: ActivityLog[], openEventTab: (event: EventRecord, tab?: DetailTab) => void) {
  const eventMap = new Map(events.map((event) => [event.event_id, event]));
  const seen = new Set<string>();
  return [...activityLogs]
    .filter((log) => eventMap.has(log.event_id))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .filter((log) => {
      if (seen.has(log.event_id)) return false;
      seen.add(log.event_id);
      return true;
    })
    .map<MyWorkItem>((log) => {
      const event = eventMap.get(log.event_id)!;
      return {
        id: log.log_id,
        title: event.event_name,
        meta: `${formatDateTime(log.timestamp)} · ${log.actor}`,
        detail: `${log.action}: ${log.details}`,
        badge: getEventRiskBadges(event)[0] ?? "Healthy",
        onClick: () => openEventTab(event, "Activity Log"),
      };
    });
}

function getRoleScopedConversations(role: Role, conversations: EventConversation[]) {
  if (role === "Sales Rep") {
    return conversations.filter((conversation) => conversation.conversation_owner === simulatedUserProfile.salesRep || conversation.follow_up_owner === simulatedUserProfile.salesRep);
  }
  return conversations;
}

function isSyncRecordAssignedToRole(role: Role, record: HubSpotSyncRecord, events: EventRecord[], conversations: EventConversation[]) {
  const event = events.find((item) => item.event_id === record.eventId);
  if (role === "Admin" || role === "Marketing Ops") return true;
  if (role === "Technical Team") return record.syncStatus === "Failed" || /technical|api|system|integration/i.test(`${record.issueOwner} ${record.errorReason} ${record.correctionAction}`);
  if (role === "Finance / CFO") return false;
  if (role === "Leadership") return record.syncStatus === "Failed";
  if (role === "Event Owner") return Boolean(event && event.event_owner === simulatedUserProfile.eventOwner && isBusinessInfoSyncRecord(record));
  if (role === "Sales Rep") {
    if (record.recordType !== "Lead") return false;
    return conversations.some(
      (conversation) =>
        (`HS-LEAD-${conversation.conversation_id}` === record.id || normalizeEmail(conversation.contact_email) === normalizeEmail(record.email)) &&
        (conversation.conversation_owner === simulatedUserProfile.salesRep || conversation.follow_up_owner === simulatedUserProfile.salesRep),
    );
  }
  if (role === "Regional Sales Leader") return Boolean(event && event.region === simulatedUserProfile.region && record.recordType === "Lead");
  if (role === "Channel Leader") return Boolean(event && /channel|partner|reseller|dmr|alliance/i.test(`${event.event_type} ${event.funding_source} ${event.skymapRoute}`));
  if (role === "Department Head") return Boolean(event && (event.estimated_cost_total > 5000 || event.risk_flags.length > 0));
  return Boolean(event);
}

function isBusinessInfoSyncRecord(record: HubSpotSyncRecord) {
  return /missing|required|complete|incorrect|business|field|email|company|follow-up|next step|summary|product interest/i.test(`${record.errorReason} ${record.correctionAction} ${record.issueOwner}`);
}

function uniqueEventsFromIds(events: EventRecord[], eventIds: Set<string>) {
  return events.filter((event) => eventIds.has(event.event_id));
}

function uniqueWorkItems(items: MyWorkItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isReminderOwnedByRole(role: Role, event: EventRecord, reminder: Reminder) {
  if (role === "Admin") return true;
  if (role === "Leadership") return reminder.status === "Escalated" || getPrimaryEventStatus(event, [reminder]) !== "Ready";
  if (role === "Event Owner") return reminder.owner.includes(simulatedUserProfile.eventOwner) || reminder.owner.includes(event.event_owner) || reminder.owner.includes("Event Owner");
  if (role === "Sales Rep") return reminder.owner.includes(simulatedUserProfile.salesRep) || /Sales Follow-Up|Lead Status/i.test(reminder.reminder_type);
  return getReminderPermission(role, event, reminder).allowed;
}

function getMyWorkHeadline(role: Role) {
  const headlines: Partial<Record<Role, string>> = {
    "Sales Rep": "Upload conversations, complete lead details, and follow up on event leads.",
    "Event Owner": "Move your events from request through uploads, actuals, and scorecard review.",
    "Marketing Ops": "Clear duplicate, data-quality, and HubSpot handoff blockers.",
    "Finance / CFO": "Approve spend, reconcile actuals, and resolve variance exceptions.",
    Leadership: "Review the exceptions that need leadership attention.",
    "Technical Team": "Find failed handoff records and simulated integration errors fast.",
    Admin: "Review every queue and jump into configuration when needed.",
  };
  return headlines[role] ?? "Review the work that needs your role next.";
}

function getMyWorkDescription(role: Role) {
  const descriptions: Partial<Record<Role, string>> = {
    "Sales Rep": "This view keeps sales focused on the lightest workflow: conversations, qualified lead completeness, and follow-up status.",
    "Event Owner": "This view combines intake status, post-event uploads, actual cost work, and outcome review for the event owner persona.",
    "Marketing Ops": "This view prioritizes records that block clean HubSpot sync: duplicate review, held records, failed records, and missing upload queues.",
    "Finance / CFO": "This view keeps spend governance separate from marketing operations: approvals, cost reconciliation, over-budget events, and explanations.",
    Leadership: "Leadership still lands on the dashboard by default, but My Work provides a clean exception list when needed.",
    "Technical Team": "This view strips the work down to sync failures, held handoff records, and recent audit activity.",
    Admin: "This view gives admins a queue-first starting point without hiding the Admin Settings page.",
  };
  return descriptions[role] ?? "This task-first view uses the same client-side mock state as the dashboard, event detail, reminders, duplicate review, and sync simulation.";
}

function getNextActionsForRole(role: Role, context: NextActionContext): NextActionCard[] {
  const missingContactEvents = context.eventsForFilter("missing-contact-upload");
  const missingConversationEvents = context.eventsForFilter("missing-conversation-upload");
  const missingCostEvents = context.eventsForFilter("missing-cost-reconciliation");
  const overBudgetEvents = context.eventsForFilter("over-budget");
  const missingUploadEvents = context.eventsForFilter("missing-uploads");
  const awaitingApprovalEvents = context.eventsForFilter("awaiting-approval");
  const draftEvents = context.visibleEvents.filter((event) => event.approval_status === "Draft" || event.approval_status === "Needs Revision");
  const missingLeadFieldEvents = context.eventsForIds(new Set(context.missingLeadFieldConversations.map((conversation) => conversation.event_id)));
  const overdueLeadEvents = context.eventsForIds(new Set(context.overdueLeadReminders.map((reminder) => reminder.event_id)));
  const leadHandoffEvents = context.eventsForIds(new Set(context.leadHandoffRecords.map((record) => record.eventId)));
  const failedSyncEvents = context.eventsForIds(new Set(context.failedSyncRecords.map((record) => record.eventId)));
  const readySyncEvents = context.eventsForIds(new Set(context.readySyncRecords.map((record) => record.eventId)));
  const duplicateEvents = context.eventsForIds(new Set(context.duplicateReviewRecords.map((record) => record.eventId)));

  const openFilter = (key: EventFilterKey, label: string) => () => context.openFilteredEvents({ key, label });
  const openTab = (events: EventRecord[], tab: DetailTab, fallback?: () => void) => () => context.openFirstEventTab(events, tab, fallback);
  const openView = (view: AppView) => () => context.setView(view);

  if (role === "Sales Rep") {
    return [
      {
        title: "Upload sales conversations",
        count: missingConversationEvents.length,
        copy: "Add conversation notes so qualified leads can be classified and handed off.",
        badge: missingConversationEvents.length > 0 ? "Missing Data" : "Healthy",
        onClick: openTab(missingConversationEvents.length ? missingConversationEvents : context.visibleEvents, "Conversation Upload", openFilter("missing-conversation-upload", "Missing conversation upload")),
      },
      {
        title: "Complete missing qualified lead fields",
        count: context.missingLeadFieldConversations.length,
        copy: "Fill required lead handoff fields before HubSpot lead sync.",
        badge: context.missingLeadFieldConversations.length > 0 ? "Missing Data" : "Healthy",
        onClick: openTab(missingLeadFieldEvents, "Conversation Upload", openView("data-review")),
      },
      {
        title: "Follow up overdue leads",
        count: context.overdueLeadReminders.length,
        copy: "Open overdue lead reminders and update next steps.",
        badge: context.overdueLeadReminders.length > 0 ? "Behind Commitment" : "Healthy",
        onClick: openTab(overdueLeadEvents, "Reminders", openFilter("follow-up-overdue", "Follow-up overdue")),
      },
      {
        title: "Review lead handoff status",
        count: context.leadHandoffRecords.length,
        copy: "Check which qualified leads are ready, held, failed, or synced.",
        badge: context.leadHandoffRecords.some((record) => record.syncStatus === "Failed") ? "Sync Issue" : context.leadHandoffRecords.length > 0 ? "Needs Review" : "Healthy",
        onClick: leadHandoffEvents.length ? openView("data-review") : openTab(context.visibleEvents, "HubSpot Sync", openView("data-review")),
      },
    ];
  }

  if (role === "Event Owner") {
    return [
      {
        title: "Submit event request",
        count: draftEvents.length,
        copy: "Move drafts and revision requests into approval routing.",
        badge: draftEvents.length > 0 ? "Needs Review" : "Healthy",
        onClick: openTab(draftEvents, "Approval", openView("event-create")),
      },
      {
        title: "Upload contacts",
        count: missingContactEvents.length,
        copy: "Add attendee, badge scan, partner list, or event app contacts.",
        badge: missingContactEvents.length > 0 ? "Missing Data" : "Healthy",
        onClick: openTab(missingContactEvents, "Contact Upload", openFilter("missing-contact-upload", "Missing contact upload")),
      },
      {
        title: "Upload conversations",
        count: missingConversationEvents.length,
        copy: "Capture meaningful event conversations for qualified lead review.",
        badge: missingConversationEvents.length > 0 ? "Missing Data" : "Healthy",
        onClick: openTab(missingConversationEvents, "Conversation Upload", openFilter("missing-conversation-upload", "Missing conversation upload")),
      },
      {
        title: "Update actual costs",
        count: missingCostEvents.length,
        copy: "Enter actual line-item costs so Finance can reconcile spend.",
        badge: missingCostEvents.length > 0 ? "Missing Data" : "Healthy",
        onClick: openTab(missingCostEvents, "Cost Estimate", openFilter("missing-cost-reconciliation", "Missing cost reconciliation")),
      },
      {
        title: "Review scorecard",
        count: context.postEventScorecardEvents.length,
        copy: "Compare commitments with actual contacts, leads, spend, sync, and follow-up.",
        badge: context.behindCommitmentEvents.length > 0 ? "Behind Commitment" : "Healthy",
        onClick: openTab(context.postEventScorecardEvents.length ? context.postEventScorecardEvents : context.visibleEvents, "Scorecard", openView("scorecards")),
      },
    ];
  }

  if (role === "Marketing Ops") {
    return [
      {
        title: "Review duplicates",
        count: context.duplicateReviewRecords.length,
        copy: "Resolve duplicate contacts, generic emails, personal domains, and company conflicts.",
        badge: context.duplicateReviewRecords.length > 0 ? "Needs Review" : "Healthy",
        onClick: duplicateEvents.length ? openView("data-review") : openFilter("duplicate-review", "Duplicate review pending"),
      },
      {
        title: "Run HubSpot sync simulation",
        count: context.readySyncRecords.length,
        copy: "Sync eligible prospects and qualified leads into the simulated HubSpot queue.",
        badge: context.readySyncRecords.length > 0 ? "Needs Review" : "Healthy",
        onClick: readySyncEvents.length ? openView("data-review") : openView("data-review"),
      },
      {
        title: "Resolve failed sync records",
        count: context.failedSyncRecords.length,
        copy: "Review simulated API or system errors before retry.",
        badge: context.failedSyncRecords.length > 0 ? "Sync Issue" : "Healthy",
        onClick: failedSyncEvents.length ? openView("data-review") : openFilter("failed-sync", "Failed HubSpot sync"),
      },
      {
        title: "Review missing upload queues",
        count: missingUploadEvents.length,
        copy: "Find events missing contacts, attendee lists, or conversation uploads.",
        badge: missingUploadEvents.length > 0 ? "Missing Data" : "Healthy",
        onClick: openFilter("missing-uploads", "Missing uploads"),
      },
    ];
  }

  if (role === "Finance / CFO") {
    return [
      {
        title: "Review finance approvals",
        count: context.financeApprovalEvents.length,
        copy: "Review spend approvals and CFO threshold items.",
        badge: context.financeApprovalEvents.length > 0 ? "Needs Review" : "Healthy",
        onClick: openTab(context.financeApprovalEvents, "Approval", openFilter("approval:Finance Review", "Finance Review events")),
      },
      {
        title: "Update actual costs",
        count: missingCostEvents.length,
        copy: "Reconcile actual cost lines for completed or post-event workflows.",
        badge: missingCostEvents.length > 0 ? "Missing Data" : "Healthy",
        onClick: openTab(missingCostEvents, "Cost Estimate", openFilter("missing-cost-reconciliation", "Missing cost reconciliation")),
      },
      {
        title: "Review over-budget events",
        count: overBudgetEvents.length,
        copy: "Inspect events where actual cost is above estimate.",
        badge: overBudgetEvents.length > 0 ? "Over Budget" : "Healthy",
        onClick: openFilter("over-budget", "Events over budget"),
      },
      {
        title: "Add variance explanation",
        count: context.varianceExplanationEvents.length,
        copy: "Complete required explanations when actual cost is more than 10% above estimate.",
        badge: context.varianceExplanationEvents.length > 0 ? "Needs Review" : "Healthy",
        onClick: openTab(context.varianceExplanationEvents, "Cost Estimate", openFilter("cost-variance", "Cost variance >10%")),
      },
    ];
  }

  if (role === "Leadership") {
    return [
      {
        title: "Review event dashboard",
        count: context.visibleEvents.length,
        copy: "Start with the leadership command center and operating risk summary.",
        badge: "Healthy",
        onClick: openView("dashboard"),
      },
      {
        title: "Review over-budget events",
        count: overBudgetEvents.length,
        copy: "Focus on events where spend is exceeding approved estimate.",
        badge: overBudgetEvents.length > 0 ? "Over Budget" : "Healthy",
        onClick: openFilter("over-budget", "Events over budget"),
      },
      {
        title: "Review behind-commitment events",
        count: context.behindCommitmentEvents.length,
        copy: "Open scorecards for events behind lead, contact, partner, or follow-up commitments.",
        badge: context.behindCommitmentEvents.length > 0 ? "Behind Commitment" : "Healthy",
        onClick: openTab(context.behindCommitmentEvents, "Scorecard", openView("scorecards")),
      },
      {
        title: "Review scorecards",
        count: context.postEventScorecardEvents.length || context.visibleEvents.length,
        copy: "See event-level, regional, and leadership scorecard views.",
        badge: context.behindCommitmentEvents.length > 0 || overBudgetEvents.length > 0 ? "Needs Review" : "Healthy",
        onClick: openView("scorecards"),
      },
    ];
  }

  if (role === "Technical Team") {
    return [
      {
        title: "Resolve failed sync records",
        count: context.failedSyncRecords.length,
        copy: "Inspect simulated integration errors and retry blockers.",
        badge: context.failedSyncRecords.length > 0 ? "Sync Issue" : "Healthy",
        onClick: openView("data-review"),
      },
      {
        title: "Review held sync records",
        count: context.heldSyncRecords.length,
        copy: "Check records held before HubSpot handoff.",
        badge: context.heldSyncRecords.length > 0 ? "Needs Review" : "Healthy",
        onClick: openView("data-review"),
      },
      {
        title: "Review activity logs",
        count: context.visibleEvents.length,
        copy: "Open the first event in scope to inspect workflow and sync audit logs.",
        badge: "Healthy",
        onClick: openTab(context.visibleEvents, "Activity Log", openView("events")),
      },
      {
        title: "Review sync queue",
        count: context.readySyncRecords.length + context.failedSyncRecords.length,
        copy: "Open the simulated HubSpot queue.",
        badge: context.failedSyncRecords.length > 0 ? "Sync Issue" : "Healthy",
        onClick: openView("data-review"),
      },
    ];
  }

  return [
    {
      title: "Review approval queue",
      count: awaitingApprovalEvents.length,
      copy: "Open events waiting for functional, regional, department, or finance approval.",
      badge: awaitingApprovalEvents.length > 0 ? "Needs Review" : "Healthy",
      onClick: openFilter("awaiting-approval", "Awaiting approval"),
    },
    {
      title: "Review overdue follow-up",
      count: context.overdueLeadReminders.length,
      copy: "Inspect overdue lead or regional follow-up reminders.",
      badge: context.overdueLeadReminders.length > 0 ? "Behind Commitment" : "Healthy",
      onClick: openTab(overdueLeadEvents, "Reminders", openFilter("follow-up-overdue", "Follow-up overdue")),
    },
    {
      title: "Review over-budget events",
      count: overBudgetEvents.length,
      copy: "Open events with spend risk.",
      badge: overBudgetEvents.length > 0 ? "Over Budget" : "Healthy",
      onClick: openFilter("over-budget", "Events over budget"),
    },
    {
      title: "Review scorecards",
      count: context.postEventScorecardEvents.length || context.visibleEvents.length,
      copy: "Open scorecard results for events in your scope.",
      badge: context.behindCommitmentEvents.length > 0 ? "Behind Commitment" : "Healthy",
      onClick: openView("scorecards"),
    },
  ];
}

function getDefaultLandingViewForRole(role: Role): AppView {
  return role === "Leadership" ? "dashboard" : "my-work";
}

function canRoleAccessSidebarView(role: Role, targetView: View) {
  const roleSections: Record<Role, View[]> = {
    Leadership: ["my-work", "events", "scorecards"],
    "Sales Rep": ["my-work", "events", "uploads", "scorecards"],
    "Event Owner": ["my-work", "events", "uploads", "scorecards"],
    "Regional Sales Leader": ["my-work", "events", "uploads", "scorecards"],
    "Channel Leader": ["my-work", "events", "uploads", "scorecards"],
    "Department Head": ["my-work", "events", "scorecards"],
    "Marketing Ops": ["my-work", "events", "uploads", "data-review", "scorecards"],
    "Finance / CFO": ["my-work", "events", "scorecards"],
    "Technical Team": ["my-work", "data-review"],
    Admin: ["my-work", "events", "uploads", "data-review", "scorecards", "admin"],
  };
  return roleSections[role]?.includes(targetView) ?? false;
}

function canRoleAccessWorkspaceView(role: Role, targetView: AppView) {
  if (canRoleAccessSidebarView(role, targetView as View)) return true;
  if (targetView === "dashboard") return role === "Leadership" || role === "Admin";
  if (targetView === "event-detail") return true;
  if (targetView === "event-create") return ["Event Owner", "Marketing Ops", "Admin"].includes(role);
  if (targetView === "data-review") return ["Sales Rep", "Event Owner", "Marketing Ops", "Technical Team", "Admin"].includes(role);
  return false;
}

function canRoleSeeCostData(role: Role) {
  return !["Sales Rep", "Technical Team"].includes(role);
}

function getVisibleUploadsForRole(role: Role, uploadRows: UploadBatch[], events: EventRecord[], conversations: EventConversation[]) {
  const visibleEventIds = new Set(events.map((event) => event.event_id));
  const visibleUploads = uploadRows.filter((upload) => visibleEventIds.has(upload.event_id));
  if (["Admin", "Marketing Ops", "Leadership", "Finance / CFO"].includes(role)) return visibleUploads;
  if (role === "Sales Rep") {
    const ownEventIds = new Set(getRoleScopedConversations(role, conversations).map((conversation) => conversation.event_id));
    return visibleUploads.filter((upload) => upload.uploaded_by === simulatedUserProfile.salesRep || (upload.upload_type === "Conversation Notes" && ownEventIds.has(upload.event_id)));
  }
  if (role === "Event Owner") return visibleUploads.filter((upload) => events.some((event) => event.event_id === upload.event_id && (upload.uploaded_by === event.event_owner || event.event_owner === simulatedUserProfile.eventOwner)));
  if (role === "Regional Sales Leader") return visibleUploads.filter((upload) => events.some((event) => event.event_id === upload.event_id && event.region === simulatedUserProfile.region));
  if (role === "Channel Leader") return visibleUploads.filter((upload) => events.some((event) => event.event_id === upload.event_id && /channel|partner|reseller|dmr|alliance/i.test(`${event.event_type} ${event.funding_source} ${event.skymapRoute}`)));
  return [];
}

function getVisibleSyncRecordsForRole(role: Role, records: HubSpotSyncRecord[], events: EventRecord[], conversations: EventConversation[]) {
  const visibleEventIds = new Set(events.map((event) => event.event_id));
  const visibleRecords = records.filter((record) => visibleEventIds.has(record.eventId));
  if (role === "Admin" || role === "Marketing Ops" || role === "Leadership" || role === "Finance / CFO") return visibleRecords;
  const scopedConversations = getRoleScopedConversations(role, conversations.filter((conversation) => visibleEventIds.has(conversation.event_id)));
  return visibleRecords.filter((record) => isSyncRecordAssignedToRole(role, record, events, scopedConversations));
}

function getScorecardDataForRole(role: Role, events: EventRecord[], reminderRows: Reminder[]) {
  const data = getWorkflowData();
  const eventIds = new Set(events.map((event) => event.event_id));
  const conversations = data.conversations.filter((conversation) => eventIds.has(conversation.event_id));
  const scopedConversations = getRoleScopedConversations(role, conversations);
  const syncRecords = getVisibleSyncRecordsForRole(role, data.syncRecords, events, scopedConversations);
  return {
    objectives: data.objectives.filter((objective) => eventIds.has(objective.event_id)),
    contacts: data.contacts.filter((contact) => eventIds.has(contact.event_id)),
    conversations: role === "Sales Rep" ? scopedConversations : conversations,
    costLines: data.costLines.filter((line) => eventIds.has(line.event_id) && canRoleSeeCostData(role)),
    syncRecords,
    duplicates: role === "Marketing Ops" || role === "Admin" ? data.duplicates.filter((duplicate) => eventIds.has(duplicate.eventId)) : [],
    reminders: reminderRows.filter((reminder) => {
      if (!eventIds.has(reminder.event_id)) return false;
      if (role === "Admin" || role === "Marketing Ops" || role === "Leadership" || role === "Finance / CFO") return true;
      const event = events.find((item) => item.event_id === reminder.event_id);
      return event ? isReminderOwnedByRole(role, event, reminder) : false;
    }),
  };
}

function getPrimaryDetailTabsForRole(role: Role): DetailTab[] {
  if (role === "Sales Rep") return ["Overview", "Conversation Upload", "HubSpot Sync", "Scorecard", "Reminders", "Activity Log"];
  if (role === "Event Owner") return ["Overview", "Cost Estimate", "Objectives & Commitments", "Approval", "Contact Upload", "Conversation Upload", "Scorecard", "Reminders", "Activity Log"];
  if (role === "Marketing Ops") return ["Overview", "Contact Upload", "Conversation Upload", "Duplicate Review", "HubSpot Sync", "Activity Log"];
  if (role === "Finance / CFO") return ["Overview", "Cost Estimate", "Approval", "Scorecard", "Activity Log"];
  if (role === "Leadership") return ["Overview", "Approval", "Scorecard", "Activity Log"];
  if (role === "Technical Team") return ["Overview", "HubSpot Sync", "Activity Log"];
  if (role === "Regional Sales Leader" || role === "Channel Leader" || role === "Department Head") return ["Overview", "Approval", "Objectives & Commitments", "Scorecard", "Reminders", "Activity Log"];
  return [...detailTabs];
}

function getAvailableDetailTabsForRole(role: Role): DetailTab[] {
  if (role === "Admin") return [...detailTabs];
  return getPrimaryDetailTabsForRole(role);
}

function isSalesRole(role: Role) {
  return role === "Sales Rep";
}

function getViewTitle(view: AppView) {
  const titles: Record<AppView, string> = {
    "my-work": "My Work",
    dashboard: "Event Dashboard",
    events: "Events",
    "event-detail": "Event Detail",
    "event-create": "Create Event",
    uploads: "Uploads",
    "data-review": "Data Review",
    scorecards: "Scorecards",
    admin: "Admin Settings",
  };
  return titles[view];
}

function getRoleFacingLabel(role: Role, label: string) {
  if (!isSalesRole(role)) return label;
  const salesLabels: Record<string, string> = {
    "Conversation Upload": "Upload Sales Conversations",
    "Upload Conversations": "Upload Sales Conversations",
    "HubSpot Sync": "Lead Handoff Status",
    "HubSpot Sync Issues": "Lead Handoff Issues",
    "HubSpot sync issues": "Lead handoff issues",
    "Run HubSpot Sync": "Review Lead Handoff Status",
    "Duplicate Review": "Records Needing Review",
    "Duplicate Review Needed": "Records Needing Review",
    "Duplicate review needed": "Records needing review",
    "Review Duplicates": "Review Records Needing Attention",
    SkyMap: "Data Check",
    "SkyMap Result": "Data Check Result",
  };
  return salesLabels[label] ?? label;
}

function getSalesConversationStatusLabel(status: ConversationUploadStatus) {
  const labels: Record<ConversationUploadStatus, string> = {
    "Ready for HubSpot Lead sync": "Ready for lead handoff",
    "Hold and complete missing fields": "Missing lead handoff fields",
    "Conversation intelligence only": "Saved as conversation notes only",
    "Duplicate contact review": "Records need review",
  };
  return labels[status];
}

function EventList({
  events,
  role,
  reminders,
  filter,
  setFilter,
  setView,
  setSelectedId,
  setSelectedDetailTab,
}: {
  events: EventRecord[];
  role: Role;
  reminders: Reminder[];
  filter: EventFilter;
  setFilter: (filter: EventFilter) => void;
  setView: (view: AppView) => void;
  setSelectedId: (id: string) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
}) {
  const [listFilters, setListFilters] = useState<EventListFilters>(defaultListFilters);
  const dashboardFilteredEvents = getFilteredEvents(events, filter.key);
  const filteredEvents = useMemo(() => applyEventListFilters(dashboardFilteredEvents, listFilters), [dashboardFilteredEvents, listFilters]);
  const uniqueOwners = getUniqueValues(events.map((event) => event.event_owner));
  const uniqueFunctionalOwners = getUniqueValues(events.map((event) => event.functional_owner));
  const uniqueEventTypes = getUniqueValues(events.map((event) => event.event_type));
  const uniqueEventTiers = getUniqueValues(events.map((event) => event.event_tier));
  const uniqueApprovalStatuses = getUniqueValues(events.map((event) => event.approval_status));
  const uniqueRegions = getUniqueValues(events.map((event) => event.region));
  const activeFilterCount = Object.entries(listFilters).filter(([key, value]) => value !== defaultListFilters[key as keyof EventListFilters]).length;
  const createPermission = getRolePermission(role, "createEvent");
  const canSeeCostColumns = canRoleSeeCostData(role);

  const updateListFilter = (key: keyof EventListFilters, value: string) => {
    setListFilters((current) => ({ ...current, [key]: value }));
  };

  const applySavedView = (viewName: string, nextFilters: Partial<EventListFilters>, dashboardFilter: EventFilter = defaultFilter) => {
    setFilter(dashboardFilter);
    setListFilters({ ...defaultListFilters, ...nextFilters });
  };

  return (
    <Panel
      title={`Events: ${getRoleFacingLabel(role, filter.label)}`}
      action={
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!createPermission.allowed} title={createPermission.reason} onClick={() => setView("event-create")}><Plus className="size-4" /> Create Event</button>
          <button
            className="btn-secondary"
            onClick={() => {
              setFilter(defaultFilter);
              setListFilters(defaultListFilters);
            }}
          >
            <Filter className="size-4" /> Clear filters
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm leading-6 text-slate-600">Create, manage, and review events.</p>
      <div className="mb-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <SavedViewButton label="My Events" onClick={() => applySavedView("My Events", { owner: "Maya Chen" })} />
          <SavedViewButton label="Awaiting Approval" onClick={() => applySavedView("Awaiting Approval", {}, { key: "awaiting-approval", label: "Awaiting approval" })} />
          <SavedViewButton label="Missing Uploads" onClick={() => applySavedView("Missing Uploads", {}, { key: "missing-uploads", label: "Missing uploads" })} />
          <SavedViewButton label={getRoleFacingLabel(role, "Duplicate Review Needed")} onClick={() => applySavedView("Duplicate Review Needed", {}, { key: "duplicate-review", label: "Duplicate review needed" })} />
          <SavedViewButton label={getRoleFacingLabel(role, "HubSpot Sync Issues")} onClick={() => applySavedView("HubSpot Sync Issues", {}, { key: "failed-sync", label: "HubSpot sync issues" })} />
          <SavedViewButton label="Over Budget" onClick={() => applySavedView("Over Budget", {}, { key: "over-budget", label: "Over budget" })} />
          <SavedViewButton label="Behind Commitment" onClick={() => applySavedView("Behind Commitment", { commitmentStatus: "Behind Commitment" })} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <label className="lg:col-span-2">
            <span className="filter-label">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={listFilters.search}
                onChange={(event) => updateListFilter("search", event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                placeholder="Search event name, owner, or location"
              />
            </div>
          </label>
          <FilterSelect label="Event status" value={listFilters.eventStatus} options={["All", "On Track", "At Risk", "Blocked", "Complete"]} onChange={(value) => updateListFilter("eventStatus", value)} />
          <FilterSelect label="Region" value={listFilters.region} options={["All", ...uniqueRegions]} onChange={(value) => updateListFilter("region", value)} />
          <FilterSelect label="Event owner" value={listFilters.owner} options={["All", ...uniqueOwners]} onChange={(value) => updateListFilter("owner", value)} />
          <FilterSelect label="Event type" value={listFilters.eventType} options={["All", ...uniqueEventTypes]} onChange={(value) => updateListFilter("eventType", value)} />
          <FilterSelect label="Event tier" value={listFilters.eventTier} options={["All", ...uniqueEventTiers]} onChange={(value) => updateListFilter("eventTier", value)} />
          <FilterSelect label="Approval status" value={listFilters.approvalStatus} options={["All", ...uniqueApprovalStatuses]} onChange={(value) => updateListFilter("approvalStatus", value)} />
          <FilterSelect label="Overdue items" value={listFilters.overdueItems} options={["All", "Has overdue", "No overdue"]} onChange={(value) => updateListFilter("overdueItems", value)} />
          <FilterSelect label="Functional owner" value={listFilters.functionalOwner} options={["All", ...uniqueFunctionalOwners]} onChange={(value) => updateListFilter("functionalOwner", value)} />
          <FilterSelect label="Cost variance" value={listFilters.costVariance} options={["All", "Over budget", "Variance >10%", "Under budget", "No actuals"]} onChange={(value) => updateListFilter("costVariance", value)} />
          <FilterSelect label="Commitment status" value={listFilters.commitmentStatus} options={["All", "Behind Commitment", "Met", "Exceeded", "Not Measurable", "No Objective"]} onChange={(value) => updateListFilter("commitmentStatus", value)} />
          <label>
            <span className="filter-label">Start date from</span>
            <input type="date" value={listFilters.startDateFrom} onChange={(event) => updateListFilter("startDateFrom", event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400" />
          </label>
          <label>
            <span className="filter-label">Start date to</span>
            <input type="date" value={listFilters.startDateTo} onChange={(event) => updateListFilter("startDateTo", event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400" />
          </label>
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {filteredEvents.length} of {events.length} events shown. {activeFilterCount > 0 ? `${activeFilterCount} table filter${activeFilterCount === 1 ? "" : "s"} active.` : "No table filters active."}
      </p>
      <div className="table-shell overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Event name</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Event owner</th>
              <th className="px-4 py-3">Event type</th>
              <th className="px-4 py-3">Event tier</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Estimated cost</th>
              <th className="px-4 py-3">Actual cost</th>
              <th className="px-4 py-3">Primary status</th>
              <th className="px-4 py-3">Secondary risk badges</th>
              <th className="px-4 py-3">Approval status</th>
              <th className="px-4 py-3">Contact upload</th>
              <th className="px-4 py-3">Conversation upload</th>
              <th className="px-4 py-3">HubSpot sync summary</th>
              <th className="px-4 py-3">Scorecard status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEvents.map((event) => {
              const primaryStatus = getPrimaryEventStatus(event, reminders);
              const contactUploadStatus = getEventUploadStatus(event, "contact");
              const conversationUploadStatus = getEventUploadStatus(event, "conversation");
              const hubSpotSummary = getEventHubSpotSyncSummary(event, role);
              const scorecardStatus = calculateEventScorecard(event, getScorecardDataForRole(role, [event], reminders)).summary.overallStatus;
              const secondaryRiskBadges = getEventRiskBadges(event);
              return (
                <tr
                  key={event.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => {
                    setSelectedId(event.id);
                    setSelectedDetailTab("Overview");
                    setView("event-detail");
                  }}
                >
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">{event.event_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{event.event_id} · {event.location}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{event.region}</td>
                  <td className="px-4 py-4 text-slate-600">{event.event_owner}</td>
                  <td className="px-4 py-4 text-slate-600">{event.event_type}</td>
                  <td className="px-4 py-4"><StageBadge value={event.event_tier} /></td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>{formatDate(event.event_start_date)}</p>
                    {event.event_end_date !== event.event_start_date && <p className="mt-1 text-xs text-slate-500">to {formatDate(event.event_end_date)}</p>}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{canSeeCostColumns ? money.format(event.estimated_cost_total) : "Restricted"}</td>
                  <td className="px-4 py-4 text-slate-600">{canSeeCostColumns ? event.actual_cost_total > 0 ? money.format(event.actual_cost_total) : "Not entered" : "Restricted"}</td>
                  <td className="px-4 py-4"><PrimaryStatusBadge status={primaryStatus} /></td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-48 flex-wrap gap-1.5">
                      {secondaryRiskBadges.map((badge) => <RiskBadge key={badge} value={badge} />)}
                      {event.risk_flags.slice(0, 2).map((flag) => <StageBadge key={flag} value={flag} />)}
                      {event.risk_flags.length > 2 && <StageBadge value={`+${event.risk_flags.length - 2}`} />}
                    </div>
                  </td>
                  <td className="px-4 py-4"><StageBadge value={event.approval_status} /></td>
                  <td className="px-4 py-4"><EventListStatusBadge status={contactUploadStatus.status} label={contactUploadStatus.label} detail={contactUploadStatus.detail} /></td>
                  <td className="px-4 py-4"><EventListStatusBadge status={conversationUploadStatus.status} label={conversationUploadStatus.label} detail={conversationUploadStatus.detail} /></td>
                  <td className="px-4 py-4"><EventListStatusBadge status={hubSpotSummary.status} label={hubSpotSummary.label} detail={hubSpotSummary.detail} /></td>
                  <td className="px-4 py-4"><ScorecardStatusBadge status={scorecardStatus} /></td>
                </tr>
              );
            })}
            {filteredEvents.length === 0 && (
              <tr>
                <td className="px-4 py-8" colSpan={14}>
                  <EmptyState title={events.length === 0 ? "No events visible for this role" : "No events match these filters"} copy={events.length === 0 ? "This role does not currently have events in scope." : "Clear filters or switch roles to see a different slice of the event portfolio."} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EventDetail({
  event,
  role,
  selectedDetailTab,
  setSelectedDetailTab,
  objectives,
  approvalState,
  activityLogs,
  reminders,
  setApprovalState,
  setActivityLogs,
  setReminders,
  updateEvent,
  updateCostLineActual,
  updateObjective,
  onContactsUploaded,
  onConversationsUploaded,
  notify,
}: {
  event: EventRecord;
  role: Role;
  selectedDetailTab: DetailTab;
  setSelectedDetailTab: (tab: DetailTab) => void;
  objectives: EventObjective[];
  approvalState: ApprovalState;
  activityLogs: ActivityLog[];
  reminders: Reminder[];
  setApprovalState: Dispatch<SetStateAction<ApprovalState>>;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  setReminders: Dispatch<SetStateAction<Reminder[]>>;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  updateCostLineActual: (costLineId: string, value: number) => void;
  updateObjective: (objectiveId: string, patch: Partial<EventObjective>) => void;
  onContactsUploaded: (event: EventRecord, lines: UploadedContactLine[], fileName: string) => void;
  onConversationsUploaded: (event: EventRecord, lines: UploadedConversationLine[], fileName: string) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const detail = getEventDetailSummary(event);
  const statusSentence = getEventPlainEnglishStatus(event, reminders);
  const primaryStatus = getPrimaryEventStatus(event, reminders);
  const primaryTabs = getPrimaryDetailTabsForRole(role);
  const availableTabs = getAvailableDetailTabsForRole(role);
  const secondaryTabs = availableTabs.filter((tab) => !primaryTabs.includes(tab));
  const selectedSecondaryTab = secondaryTabs.includes(selectedDetailTab) ? selectedDetailTab : "";
  const canSeeCostSummary = canRoleSeeCostData(role);

  const quickActions = [
    { label: "Submit for Approval", tab: "Approval" as DetailTab, permission: "submitApproval", onClick: () => {
      updateEvent(event.id, { approval_status: "Submitted", stage: "Submitted", status: "At Risk" });
      notify("success", "Submitted for approval", `${event.event_name} moved into the approval workflow.`);
    } },
    { label: "Upload Contacts", tab: "Contact Upload" as DetailTab, permission: "uploadContacts" },
    { label: "Upload Conversations", tab: "Conversation Upload" as DetailTab, permission: "uploadConversations" },
    { label: "Review Duplicates", tab: "Duplicate Review" as DetailTab, permission: "reviewDuplicates" },
    { label: "Run HubSpot Sync", tab: "HubSpot Sync" as DetailTab, permission: "runHubSpotSync", onClick: () => {
      updateEvent(event.id, { approval_status: "HubSpot Sync In Progress", stage: "HubSpot Sync In Progress", hubspotStatus: "Synced" });
      notify("info", "Sync simulation staged", `Open the ${getRoleFacingLabel(role, "HubSpot Sync")} tab to run the full queue simulation.`);
    } },
    { label: "Update Actual Cost", tab: "Cost Estimate" as DetailTab, permission: "updateActualCost" },
    { label: "View Scorecard", tab: "Scorecard" as DetailTab, permission: "viewScorecard" },
  ];

  return (
    <div className="space-y-6">
      <Panel
        title={event.event_name}
        action={<StatusBadge value={event.status} />}
      >
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current status</p>
              <p className="mt-2 text-lg font-semibold leading-7 text-slate-950">{statusSentence}</p>
            </div>
            <PrimaryStatusBadge status={primaryStatus} large />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniStat label="Owner" value={event.event_owner} />
          <MiniStat label="Region" value={event.region} />
          <MiniStat label="Estimated Cost" value={canSeeCostSummary ? money.format(event.estimated_cost_total) : "Restricted"} />
          <MiniStat label="Actual Cost" value={canSeeCostSummary ? money.format(event.actual_cost_total) : "Restricted"} />
          <MiniStat label="Contacts Commitment" value={number.format(detail.contactsCommitment)} />
          <MiniStat label="Contacts Uploaded" value={number.format(detail.contactsUploaded)} />
          <MiniStat label="Lead Commitment" value={number.format(detail.leadCommitment)} />
          <MiniStat label="Leads Uploaded" value={number.format(detail.leadsUploaded)} />
          <MiniStat label={getRoleFacingLabel(role, "HubSpot Sync")} value={`${detail.hubspotSynced} synced / ${detail.hubspotHeld} held / ${detail.hubspotFailed} failed`} />
          <MiniStat label="Follow-up status" value={detail.followUpStatus} />
          <MiniStat label="Primary status" value={primaryStatus} />
          <MiniStat label="Approval status" value={event.approval_status} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {detail.riskIndicators.map((risk) => <RiskBadge key={risk} value={risk} />)}
          {event.event_tier === "Non-Measurable" && <RiskBadge value="Missing Data" label="Non-measurable event" />}
          {event.event_type === "Marketing List Build" && <RiskBadge value="Needs Review" label="Marketing-list-only event" />}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const permission = getRolePermission(role, action.permission as PermissionAction, event);
            return (
              <button
                key={action.label}
                className={action.label === "Submit for Approval" ? "btn-primary" : "btn-secondary"}
                disabled={!permission.allowed}
                title={permission.reason}
                onClick={() => {
                  action.onClick?.();
                  setSelectedDetailTab(action.tab);
                }}
              >
                {getRoleFacingLabel(role, action.label)}
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {primaryTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedDetailTab(tab)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${selectedDetailTab === tab ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
            >
              {getRoleFacingLabel(role, tab)}
            </button>
          ))}
          {secondaryTabs.length > 0 && (
            <select
              value={selectedSecondaryTab}
              onChange={(event) => {
                if (event.target.value) setSelectedDetailTab(event.target.value as DetailTab);
              }}
              className={`rounded-md border px-3 py-2 text-sm font-semibold outline-none transition ${
                selectedSecondaryTab ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
              title="More tabs"
            >
              <option value="">More</option>
              {secondaryTabs.map((tab) => (
                <option key={tab} value={tab}>{getRoleFacingLabel(role, tab)}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {selectedDetailTab === "Overview" && <EventOverviewTab event={event} role={role} />}
      {selectedDetailTab === "Cost Estimate" && (
        <EventCostEstimateTab
          event={event}
          role={role}
          setActivityLogs={setActivityLogs}
          updateEvent={updateEvent}
          updateCostLineActual={updateCostLineActual}
          notify={notify}
        />
      )}
      {selectedDetailTab === "Objectives & Commitments" && (
        <EventObjectivesTab
          event={event}
          role={role}
          objectives={objectives.filter((objective) => objective.event_id === event.event_id)}
          updateObjective={updateObjective}
          setActivityLogs={setActivityLogs}
          notify={notify}
        />
      )}
      {selectedDetailTab === "Approval" && (
        <ApprovalWorkflow
          event={event}
          role={role}
          approvalState={approvalState}
          activityLogs={activityLogs}
          setApprovalState={setApprovalState}
          setActivityLogs={setActivityLogs}
          updateEvent={updateEvent}
          notify={notify}
        />
      )}
      {selectedDetailTab === "Contact Upload" && <EventContactsTab event={event} role={role} setActivityLogs={setActivityLogs} onContactsUploaded={onContactsUploaded} notify={notify} />}
      {selectedDetailTab === "Conversation Upload" && <EventConversationsTab event={event} role={role} setActivityLogs={setActivityLogs} onConversationsUploaded={onConversationsUploaded} notify={notify} />}
      {selectedDetailTab === "Duplicate Review" && <EventDuplicateTab event={event} role={role} />}
      {selectedDetailTab === "HubSpot Sync" && <EventHubSpotTab event={event} role={role} />}
      {selectedDetailTab === "Scorecard" && <EventScorecardTab event={event} detail={detail} reminders={reminders} />}
      {selectedDetailTab === "Reminders" && <EventRemindersTab event={event} role={role} reminders={reminders} setReminders={setReminders} setActivityLogs={setActivityLogs} notify={notify} />}
      {selectedDetailTab === "Activity Log" && <EventActivityLogTab event={event} activityLogs={activityLogs} />}
    </div>
  );
}

function EventOverviewTab({ event, role }: { event: EventRecord; role: Role }) {
  return (
    <Panel title="Overview">
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="section-title">Execution checklist</h3>
          <div className="mt-3 space-y-2">
            {event.checklist.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <CheckCircle2 className="size-4 text-emerald-600" />
                {item}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="section-title">Routing and systems</h3>
          <div className="mt-3 space-y-3 text-sm">
            <InfoRow label="DTEN.me" value="Workflow approvals, readiness, event operations, upload review, scorecard review" />
            <InfoRow label={getRoleFacingLabel(role, "SkyMap")} value={event.skymapRoute} />
            <InfoRow label="HubSpot" value={`Campaign member state: ${event.hubspotStatus}`} />
            <InfoRow label="Twenty" value="Phase 2 CRM system of record preview only" />
          </div>
        </section>
      </div>
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="section-title">Leadership note</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{event.notes}</p>
      </div>
    </Panel>
  );
}

function EventCostEstimateTab({
  event,
  role,
  setActivityLogs,
  updateEvent,
  updateCostLineActual,
  notify,
}: {
  event: EventRecord;
  role: Role;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  updateCostLineActual: (costLineId: string, value: number) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const lines = getWorkflowData().costLines.filter((line) => line.event_id === event.event_id);
  const totals = getCostTotalsForEvent(event, getWorkflowData().costLines);
  const overBudget = totals.variancePercentage > 10;
  const needsExplanation = overBudget && !event.variance_explanation.trim();
  const permission = getRolePermission(role, "updateActualCost", event);
  const canEditActuals = permission.allowed && isPastOrPostEvent(event);
  const disabledReason = !permission.allowed ? permission.reason : "Actual costs can be edited after the event has ended.";

  const handleActualChange = (line: EventCostLine, value: string) => {
    const parsed = Number(value || 0);
    updateCostLineActual(line.cost_line_id, Number.isNaN(parsed) || parsed < 0 ? 0 : parsed);
  };

  const handleExplanationChange = (value: string) => {
    updateEvent(event.id, { variance_explanation: value });
  };

  const saveReconciliationLog = () => {
    setActivityLogs((current) => [
      ...current,
      createActivityLog(event.event_id, role, "Cost reconciliation", `Actual cost ${money.format(totals.actual)} reconciled against estimate ${money.format(totals.estimated)}. Variance: ${money.format(totals.variance)} (${totals.variancePercentage.toFixed(1)}%).`, "Cost Estimate"),
    ]);
    notify(needsExplanation ? "error" : "success", needsExplanation ? "Variance explanation required" : "Cost reconciliation saved", needsExplanation ? "Actual cost is more than 10% above estimate. Add a variance explanation before scorecard review." : "Cost totals and variance now flow through dashboard and scorecard.");
  };

  return (
    <Panel
      title="Cost Estimate"
      action={
        <div className="flex flex-wrap gap-2">
          {overBudget && <RiskBadge value="Over Budget" />}
          {needsExplanation && <RiskBadge value="Needs Review" label="Needs Explanation" />}
          <button className="btn-secondary" onClick={saveReconciliationLog}>Save reconciliation note</button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Estimated" value={money.format(totals.estimated)} />
        <MiniStat label="Actual" value={money.format(totals.actual)} />
        <MiniStat label="Variance" value={money.format(totals.variance)} />
        <MiniStat label="Variance %" value={`${totals.variancePercentage.toFixed(1)}%`} />
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Estimated and actual totals are derived from cost lines. Event-level totals are not manually trusted.
      </p>
      {!canEditActuals && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          {disabledReason}
        </div>
      )}
      <div className="mt-5 table-shell overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Estimated</th>
              <th className="px-4 py-3">Actual</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <tr key={line.cost_line_id}>
                <td className="px-4 py-4"><StageBadge value={line.cost_category} /></td>
                <td className="px-4 py-4 text-slate-600">{money.format(line.estimated_amount)}</td>
                <td className="px-4 py-4">
                  <input
                    type="number"
                    min="0"
                    value={line.actual_amount}
                    disabled={!canEditActuals}
                    onChange={(inputEvent) => handleActualChange(line, inputEvent.target.value)}
                    className="h-9 w-32 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </td>
                <td className="px-4 py-4 text-slate-600">{line.vendor}</td>
                <td className="px-4 py-4 text-slate-600">{line.notes}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td className="px-4 py-8" colSpan={5}>
                  <EmptyState title="No cost lines" copy="Upload a cost estimate CSV during intake so estimated and actual event costs can be derived." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(overBudget || event.variance_explanation) && (
        <div className={`mt-5 rounded-lg border p-4 ${needsExplanation ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <TextAreaInput
            label="Variance explanation"
            value={event.variance_explanation}
            onChange={handleExplanationChange}
            required={overBudget}
            disabled={!canEditActuals}
            placeholder="Explain why actual cost is more than 10% above the approved estimate."
            error={needsExplanation ? "Variance explanation is required when actual cost is more than 10% above estimate." : ""}
          />
        </div>
      )}
    </Panel>
  );
}

function EventObjectivesTab({
  event,
  role,
  objectives,
  updateObjective,
  setActivityLogs,
  notify,
}: {
  event: EventRecord;
  role: Role;
  objectives: EventObjective[];
  updateObjective: (objectiveId: string, patch: Partial<EventObjective>) => void;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const isLocked = isObjectiveLocked(event.event_start_date);
  const canEditPreLockCommitments = !isLocked && ["Event Owner", "Marketing Ops", "Leadership", "Admin"].includes(role);
  const canEditActuals = role !== "Technical Team";
  const canRequestOverride = isLocked && role !== "Technical Team";
  const canApproveOverride = ["Department Head", "Leadership", "Admin"].includes(role);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { requestedValue: string; reason: string }>>({});

  const updateOverrideDraft = (objectiveId: string, patch: Partial<{ requestedValue: string; reason: string }>) => {
    setOverrideDrafts((current) => ({
      ...current,
      [objectiveId]: {
        requestedValue: current[objectiveId]?.requestedValue ?? "",
        reason: current[objectiveId]?.reason ?? "",
        ...patch,
      },
    }));
  };

  const requestOverride = (objective: EventObjective) => {
    const draft = overrideDrafts[objective.objective_id] ?? { requestedValue: "", reason: "" };
    const requestedValue = Number(draft.requestedValue);
    if (!draft.requestedValue || Number.isNaN(requestedValue) || !draft.reason.trim()) {
      notify("error", "Override request incomplete", "Add the requested commitment value and a reason before submitting.");
      return;
    }
    const timestamp = new Date().toISOString();
    updateObjective(objective.objective_id, {
      override_request_status: "Requested",
      override_requested_value: requestedValue,
      override_request_reason: draft.reason.trim(),
      override_requested_by: role,
      override_requested_at: timestamp,
    });
    appendActivityLogs(setActivityLogs, [
      createActivityLog(
        event.event_id,
        role,
        "Commitment override request",
        `${role} requested ${objective.objective_type} commitment change from ${formatObjectiveValue(objective.commitment_value)} to ${formatObjectiveValue(requestedValue)}.`,
        objective.objective_type,
        {
          changed_by: role,
          change_timestamp: timestamp,
          previous_value: formatObjectiveValue(objective.commitment_value),
          new_value: formatObjectiveValue(requestedValue),
          reason: draft.reason.trim(),
          approver: "Pending approval",
        },
      ),
    ]);
    notify("success", "Override requested", `${objective.objective_type} is queued for approval.`);
  };

  const approveOverride = (objective: EventObjective) => {
    if (objective.override_requested_value === undefined || objective.override_requested_value === null) {
      notify("error", "No override value", "This objective does not have a requested value to approve.");
      return;
    }
    const timestamp = new Date().toISOString();
    const previousValue = objective.commitment_value;
    updateObjective(objective.objective_id, {
      commitment_value: objective.override_requested_value,
      override_request_status: "Approved",
      override_approved_by: role,
      override_approved_at: timestamp,
    });
    appendActivityLogs(setActivityLogs, [
      createActivityLog(
        event.event_id,
        role,
        "Commitment override approval",
        `${role} approved ${objective.objective_type} commitment change from ${formatObjectiveValue(previousValue)} to ${formatObjectiveValue(objective.override_requested_value)}.`,
        objective.objective_type,
        {
          changed_by: objective.override_requested_by ?? role,
          change_timestamp: timestamp,
          previous_value: formatObjectiveValue(previousValue),
          new_value: formatObjectiveValue(objective.override_requested_value),
          reason: objective.override_request_reason || "No reason supplied.",
          approver: role,
        },
      ),
    ]);
    notify("success", "Override approved", `${objective.objective_type} commitment baseline was updated.`);
  };

  return (
    <Panel title="Objectives & Commitments" action={<RiskBadge value={isLocked ? "Needs Review" : "Healthy"} label={isLocked ? "Locked at event start" : "Editable before start"} />}>
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Objective lock" value={isLocked ? "Locked" : "Unlocked"} />
        <MiniStat label="Objective rows" value={String(objectives.length)} />
        <MiniStat label="Actual result updates" value={canEditActuals ? "Allowed" : "Read only"} />
        <MiniStat label="Override requests" value={String(objectives.filter((objective) => objective.override_request_status === "Requested").length)} />
      </div>

      {objectives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          No objectives are attached to this event yet. Add objectives during intake before submitting for approval.
        </div>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        {objectives.map((objective) => (
          <div key={objective.objective_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{objective.objective_type}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Expected: {objective.expected_yes_no ? "Yes" : "No"} · {isLocked ? "Original commitment is locked" : "Commitment can be edited before event start"}
                </p>
              </div>
              <CommitmentBadge value={objective.status} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <TextInput
                label="Original commitment"
                type="number"
                value={objective.commitment_value === null ? "" : String(objective.commitment_value)}
                onChange={(value) => updateObjective(objective.objective_id, { commitment_value: value ? Number(value) : null })}
                disabled={!objective.expected_yes_no || !canEditPreLockCommitments}
                placeholder={objective.expected_yes_no ? "Enter commitment" : "Not measurable"}
              />
              <TextInput
                label="Actual result"
                type="number"
                value={objective.actual_value === null ? "" : String(objective.actual_value)}
                onChange={(value) => updateObjective(objective.objective_id, { actual_value: value ? Number(value) : null })}
                disabled={!canEditActuals || !objective.expected_yes_no}
                placeholder="Enter post-event result"
              />
              <MiniStat label="Status" value={objective.status} />
              <MiniStat label="Lock rule" value={isLocked ? "Commitment changes require override" : "Locks on event start date"} />
            </div>

            <div className="mt-4">
              <TextAreaInput
                label="Notes"
                value={objective.notes}
                onChange={(value) => updateObjective(objective.objective_id, { notes: value })}
                disabled={role === "Technical Team"}
                placeholder="Add scorecard context, execution notes, or result explanation."
              />
            </div>

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-amber-950">Override request</p>
                  <p className="mt-1 text-sm text-amber-800">
                    {isLocked ? "Locked commitments need an override request and approval before the baseline changes." : "Override is not required before the event start date."}
                  </p>
                </div>
                {objective.override_request_status && objective.override_request_status !== "None" && (
                  <RiskBadge value={objective.override_request_status === "Approved" ? "Healthy" : "Needs Review"} label={objective.override_request_status} />
                )}
              </div>

              {isLocked && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <TextInput
                    label="Requested commitment"
                    type="number"
                    value={overrideDrafts[objective.objective_id]?.requestedValue ?? (objective.override_request_status === "Requested" && objective.override_requested_value !== undefined && objective.override_requested_value !== null ? String(objective.override_requested_value) : "")}
                    onChange={(value) => updateOverrideDraft(objective.objective_id, { requestedValue: value })}
                    disabled={!canRequestOverride}
                    placeholder="New commitment value"
                  />
                  <div className="rounded-md border border-amber-200 bg-white px-3 py-2">
                    <p className="text-xs font-medium text-amber-700">Current baseline</p>
                    <p className="mt-1 text-sm font-semibold text-amber-950">{formatObjectiveValue(objective.commitment_value)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <TextAreaInput
                      label="Reason"
                      value={overrideDrafts[objective.objective_id]?.reason ?? objective.override_request_reason ?? ""}
                      onChange={(value) => updateOverrideDraft(objective.objective_id, { reason: value })}
                      disabled={!canRequestOverride}
                      placeholder="Explain why the locked commitment baseline should change."
                    />
                  </div>
                </div>
              )}

              {objective.override_request_status === "Requested" && (
                <div className="mt-4 rounded-md border border-amber-200 bg-white p-3 text-sm text-amber-900">
                  Requested by {objective.override_requested_by ?? "Unknown"} on {objective.override_requested_at ? formatDateTime(objective.override_requested_at) : "pending timestamp"}.
                  Requested value: <span className="font-semibold">{formatObjectiveValue(objective.override_requested_value ?? null)}</span>.
                </div>
              )}
              {objective.override_request_status === "Approved" && (
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Approved by {objective.override_approved_by ?? "Unknown"} on {objective.override_approved_at ? formatDateTime(objective.override_approved_at) : "pending timestamp"}.
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={!canRequestOverride || !isLocked} title={canRequestOverride ? "" : "Technical Team cannot request commitment overrides."} onClick={() => requestOverride(objective)}>
                  Request Override
                </button>
                <button className="btn-primary" disabled={!canApproveOverride || objective.override_request_status !== "Requested"} title={canApproveOverride ? "" : "Only Department Head, Leadership, or Admin can approve commitment overrides."} onClick={() => approveOverride(objective)}>
                  Approve Override
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </Panel>
  );
}

function EventContactsTab({
  event,
  role,
  setActivityLogs,
  onContactsUploaded,
  notify,
}: {
  event: EventRecord;
  role: Role;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  onContactsUploaded: (event: EventRecord, lines: UploadedContactLine[], fileName: string) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const { contacts: allContacts, uploads: allUploads } = getWorkflowData();
  const contacts = allContacts.filter((contact) => contact.event_id === event.event_id);
  const batches = allUploads.filter((upload) => upload.event_id === event.event_id);
  const [uploadedContacts, setUploadedContacts] = useState<UploadedContactLine[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const summary = getContactUploadSummary(uploadedContacts);
  const uploadPermission = getRolePermission(role, "uploadContacts", event);

  const handleContactCsvUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseContactCsv(String(reader.result ?? ""), event.event_id);
      setCsvErrors(result.errors);
      setUploadedContacts(result.lines);
      notify(result.errors.length ? "error" : "success", result.errors.length ? "Contact upload needs review" : "Contact upload parsed", `${result.lines.length} contact rows loaded. ${result.errors.length} validation issue(s).`);
      if (result.lines.length > 0) onContactsUploaded(event, result.lines, file.name);
      appendActivityLogs(setActivityLogs, [
        createActivityLog(event.event_id, "Marketing Ops", "Contact CSV upload", `${result.lines.length} contact rows parsed. ${result.errors.length} validation issue(s).`, file.name),
        ...result.lines.slice(0, 8).map((line) =>
          createActivityLog(event.event_id, "SkyMap", "SkyMap processing result", `${line.firstName} ${line.lastName}: ${line.skyMapResult.confidence} confidence, ${line.skyMapResult.eligibility}.`, line.email || line.company),
        ),
      ]);
    };
    reader.readAsText(file);
  };

  const downloadSampleCsv = () => {
    const sample = [
      requiredContactCsvColumns.join(","),
      "Alex,Rivera,alex.rivera@northstate.edu,North State University,Director of Learning Spaces,+1 408 555 0111,United States,Badge Scan,Consented,Visited booth for classroom refresh",
      "Morgan,Lee,info@campusdemo.edu,Campus Demo Group,Facilities Lead,+1 415 555 0120,United States,Partner List,Consent Unknown,Generic email should be reviewed",
      "Jamie,Owens,,Bay College,Dean of Technology,+1 510 555 0151,United States,Manual Entry,Consented,Missing email but company present",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "event-contact-upload-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Contact Upload"
      action={
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={downloadSampleCsv}>Sample CSV</button>
          {uploadPermission.allowed ? (
            <label className="btn-primary">
              Upload Contacts
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleContactCsvUpload(event.target.files?.[0])} />
            </label>
          ) : (
            <button className="btn-primary" disabled title={uploadPermission.reason}>Upload Contacts</button>
          )}
        </div>
      }
    >
      <div className="upload-zone mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-semibold">CSV upload only</h3>
        <p className="mt-1 text-sm text-slate-600">Event contacts are badge scans, event app exports, partner lists, booth visitors, attendee lists, or manual event lists.</p>
        <p className="mt-1 text-sm text-slate-600">Required columns: {requiredContactCsvColumns.join(", ")}. HubSpot sync minimum fields: Email and Company.</p>
        <p className="mt-1 text-sm text-slate-600">Contacts sync to HubSpot as Marketing Contact / Prospect. They become sales leads only when a qualified conversation record exists.</p>
      </div>

      {csvErrors.length > 0 && (
        <div className="mb-5 space-y-2">
          {csvErrors.map((error) => (
            <div key={error} className="form-error rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3">
        <MiniStat label="Total records uploaded" value={number.format(summary.total)} />
        <MiniStat label="Ready to sync" value={number.format(summary.ready)} />
        <MiniStat label="Duplicate contacts held" value={number.format(summary.duplicatesHeld)} />
        <MiniStat label="Possible duplicates held" value={number.format(summary.possibleDuplicatesHeld)} />
        <MiniStat label="Missing required fields" value={number.format(summary.missingRequired)} />
        <MiniStat label="Failed validation" value={number.format(summary.failed)} />
      </div>

      {uploadedContacts.length > 0 && (
        <div className="mt-5 table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Capture Method</th>
                <th className="px-4 py-3">Consent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">{getRoleFacingLabel(role, "SkyMap Result")}</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uploadedContacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold">{contact.firstName} {contact.lastName}</p>
                    <p className="mt-1 text-xs text-slate-500">{contact.title}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{contact.email || "Missing"}</td>
                  <td className="px-4 py-4 text-slate-600">{contact.company || "Missing"}</td>
                  <td className="px-4 py-4 text-slate-600">{contact.captureMethod}</td>
                  <td className="px-4 py-4 text-slate-600">{contact.consentStatus}</td>
                  <td className="px-4 py-4"><ContactStatusBadge status={contact.status} /></td>
                  <td className="px-4 py-4">
                    <SkyMapResultBadge result={contact.skyMapResult} />
                    <p className="mt-1 max-w-64 text-xs text-slate-500">{contact.skyMapResult.reason}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{contact.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Contacts uploaded" value={number.format(contacts.length || event.leads)} />
        <MiniStat label="Upload batches" value={String(batches.length)} />
        <MiniStat label="Held" value={String(contacts.filter((contact) => contact.hubspot_sync_status === "Held for review").length)} />
        <MiniStat label="Failed" value={String(contacts.filter((contact) => contact.hubspot_sync_status === "Failed").length)} />
      </div>
      <RecordTable rows={contacts.map((contact) => [contact.email, contact.company, contact.capture_method, contact.skymap_match_status, contact.hubspot_sync_status])} headers={["Email", "Company", "Capture", getRoleFacingLabel(role, "SkyMap"), "HubSpot"]} />
    </Panel>
  );
}

function EventConversationsTab({
  event,
  role,
  setActivityLogs,
  onConversationsUploaded,
  notify,
}: {
  event: EventRecord;
  role: Role;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  onConversationsUploaded: (event: EventRecord, lines: UploadedConversationLine[], fileName: string) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const conversations = getRoleScopedConversations(role, getWorkflowData().conversations.filter((conversation) => conversation.event_id === event.event_id));
  const [uploadedConversations, setUploadedConversations] = useState<UploadedConversationLine[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const summary = getConversationUploadSummary(uploadedConversations);
  const uploadPermission = getRolePermission(role, "uploadConversations", event);
  const salesCopy = isSalesRole(role);

  const handleConversationCsvUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseConversationCsv(String(reader.result ?? ""), event.event_id);
      setCsvErrors(result.errors);
      setUploadedConversations(result.lines);
      notify(result.errors.length ? "error" : "success", result.errors.length ? "Conversation upload needs review" : "Conversation upload parsed", `${result.lines.length} conversation rows loaded. ${result.errors.length} validation issue(s).`);
      if (result.lines.length > 0) onConversationsUploaded(event, result.lines, file.name);
      appendActivityLogs(setActivityLogs, [
        createActivityLog(event.event_id, "Marketing Ops", "Conversation CSV upload", `${result.lines.length} conversation rows parsed. ${result.errors.length} validation issue(s).`, file.name),
        ...result.lines.slice(0, 8).map((line) =>
          createActivityLog(event.event_id, line.conversationOwner || "Conversation Upload", "Conversation classification", `${line.contactName}: ${line.status}. ${line.reason}`, line.contactEmail || line.company),
        ),
      ]);
    };
    reader.readAsText(file);
  };

  const updateUploadedConversation = (lineId: string, key: keyof UploadedConversationLine, value: string) => {
    setUploadedConversations((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, [key]: value };
        return classifyUploadedConversation(next);
      }),
    );
  };

  const downloadSampleCsv = () => {
    const sample = [
      requiredConversationCsvColumns.join(","),
      "alex.rivera@northstate.edu,North State University,Alex Rivera,Director of Learning Spaces,Maya Chen,Discussed classroom refresh across three campuses,D7X Dual,Yes,High,0-3 months,180000,Schedule technical workshop,Sam Patel,,Qualified booth conversation",
      "info@campusdemo.edu,Campus Demo Group,Morgan Lee,Facilities Lead,Jordan Ellis,General interest in meeting room options,DTEN Bar / BYOD,Yes,,3-6 months,75000,,Jordan Ellis,,Generic email should be held",
      "mei.lin@apacpartner.sg,APAC Partner SG,Mei Lin,Marketing Manager,Kenji Tan,List hygiene discussion only,Other,No,Low,No active project,0,Add to partner nurture,Marketing Ops APAC,,Conversation intelligence only",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "event-conversation-upload-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title={getRoleFacingLabel(role, "Conversation Upload")}
      action={
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={downloadSampleCsv}>Sample CSV</button>
          {uploadPermission.allowed ? (
            <label className="btn-primary">
              {getRoleFacingLabel(role, "Upload Conversations")}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleConversationCsvUpload(event.target.files?.[0])} />
            </label>
          ) : (
            <button className="btn-primary" disabled title={uploadPermission.reason}>{getRoleFacingLabel(role, "Upload Conversations")}</button>
          )}
        </div>
      }
    >
      <div className="upload-zone mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-semibold">CSV upload only</h3>
        <p className="mt-1 text-sm text-slate-600">
          {salesCopy
            ? "Upload the real sales conversations you had at the event, including who you talked to, what they cared about, the next step, and who owns follow-up."
            : "Event conversations are meaningful interactions captured by Sales, Channel, Marketing, or event attendees."}
        </p>
        <p className="mt-1 text-sm text-slate-600">Required columns: {requiredConversationCsvColumns.join(", ")}.</p>
        <p className="mt-1 text-sm text-slate-600">
          {salesCopy
            ? "To hand a conversation off as a sales lead, mark Is Sales Lead = Yes and include email, company, conversation summary, product interest, follow-up owner, and next step. Missing items will be held until completed."
            : "Qualified lead sync requires contact email, company, conversation summary, product interest, follow-up owner, and next step."}
        </p>
      </div>

      {csvErrors.length > 0 && (
        <div className="mb-5 space-y-2">
          {csvErrors.map((error) => (
            <div key={error} className="form-error rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Total rows uploaded" value={number.format(summary.total)} />
        <MiniStat label={salesCopy ? "Ready for handoff" : "Ready lead sync"} value={number.format(summary.readyLeadSync)} />
        <MiniStat label="Need completion" value={number.format(summary.holdMissing)} />
        <MiniStat label={salesCopy ? "Notes only" : "Conversation intel only"} value={number.format(summary.intelligenceOnly)} />
        <MiniStat label={getRoleFacingLabel(role, "Duplicate Review")} value={number.format(summary.duplicateReview)} />
      </div>

      {uploadedConversations.length > 0 && (
        <div className="mt-5 table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Product Interest</th>
                <th className="px-4 py-3">Lead Quality</th>
                <th className="px-4 py-3">Next Step</th>
                <th className="px-4 py-3">Follow-Up Owner</th>
                <th className="px-4 py-3">Follow-Up Date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uploadedConversations.map((line) => {
                const editable = line.status === "Hold and complete missing fields";
                return (
                  <tr key={line.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold">{line.contactName || "Missing name"}</p>
                      <InlineEdit value={line.contactEmail} disabled={!editable} placeholder="Email" onChange={(value) => updateUploadedConversation(line.id, "contactEmail", value)} />
                    </td>
                    <td className="px-4 py-4"><InlineEdit value={line.company} disabled={!editable} placeholder="Company" onChange={(value) => updateUploadedConversation(line.id, "company", value)} /></td>
                    <td className="px-4 py-4">
                      <InlineSelect value={line.productInterest} disabled={!editable} options={PRODUCT_INTEREST} onChange={(value) => updateUploadedConversation(line.id, "productInterest", value)} />
                    </td>
                    <td className="px-4 py-4">
                      <InlineSelect value={line.leadQuality} disabled={!editable} options={LEAD_QUALITY} onChange={(value) => updateUploadedConversation(line.id, "leadQuality", value)} />
                    </td>
                    <td className="px-4 py-4"><InlineEdit value={line.nextStep} disabled={!editable} placeholder="Next step" onChange={(value) => updateUploadedConversation(line.id, "nextStep", value)} /></td>
                    <td className="px-4 py-4"><InlineEdit value={line.followUpOwner} disabled={!editable} placeholder="Owner" onChange={(value) => updateUploadedConversation(line.id, "followUpOwner", value)} /></td>
                    <td className="px-4 py-4"><InlineEdit type="date" value={line.followUpDate} disabled={!editable} onChange={(value) => updateUploadedConversation(line.id, "followUpDate", value)} /></td>
                    <td className="px-4 py-4">
                      <ConversationStatusBadge status={line.status} label={salesCopy ? getSalesConversationStatusLabel(line.status) : undefined} />
                      <p className="mt-1 max-w-56 text-xs text-slate-500">{line.reason}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Conversations" value={String(conversations.length)} />
        <MiniStat label="Sales leads" value={String(conversations.filter((conversation) => conversation.is_sales_lead).length)} />
        <MiniStat label="Synced" value={String(conversations.filter((conversation) => conversation.hubspot_sync_status === "Synced").length)} />
        <MiniStat label="Failed" value={String(conversations.filter((conversation) => conversation.hubspot_sync_status === "Failed").length)} />
      </div>
      <div className="mt-5 space-y-3">
        {conversations.map((conversation) => (
          <div key={conversation.conversation_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{conversation.contact_name}</h3>
              <CommitmentBadge value={conversation.lead_quality} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{conversation.company} · {conversation.product_interest} · {conversation.follow_up_owner}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{conversation.conversation_summary}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EventDuplicateTab({ event, role }: { event: EventRecord; role: Role }) {
  const canSeeDuplicateQueue = role === "Marketing Ops" || role === "Admin";
  const groups = canSeeDuplicateQueue ? getWorkflowData().duplicates.filter((duplicate) => duplicate.eventId === event.event_id) : [];
  if (!canSeeDuplicateQueue) {
    return (
      <Panel title={getRoleFacingLabel(role, "Duplicate Review")}>
        <EmptyState title="Duplicate review is owned by Marketing Ops" copy="This role only sees records assigned back for missing business information in Data Review. The global duplicate queue is hidden." />
      </Panel>
    );
  }
  return (
    <Panel title={getRoleFacingLabel(role, "Duplicate Review")} action={<button className="btn-secondary">{getRoleFacingLabel(role, "Review Duplicates")}</button>}>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{group.primary}</h3>
                <p className="mt-1 text-sm text-slate-500">Matched to {group.matched}</p>
              </div>
              <RiskBadge value={group.action === "Review" ? "Needs Review" : "Healthy"} label={group.action} />
            </div>
            <p className="mt-3 text-sm text-slate-600">{group.confidence}% confidence · {group.reason}</p>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-slate-500">No duplicate groups for this event.</p>}
      </div>
    </Panel>
  );
}

function EventHubSpotTab({ event, role }: { event: EventRecord; role: Role }) {
  const records = getWorkflowData().syncRecords.filter((record) => record.eventId === event.event_id && isSyncRecordAssignedToRole(role, record, [event], getWorkflowData().conversations));
  return (
    <Panel title={getRoleFacingLabel(role, "HubSpot Sync")} action={<button className="btn-secondary">{getRoleFacingLabel(role, "Run HubSpot Sync")}</button>}>
      <RecordTable rows={records.map((record) => [record.recordType, record.name, record.syncStatus, record.errorReason || ""])} headers={["Type", "Record", "Status", "Error"]} />
    </Panel>
  );
}

function EventScorecardTab({ event, detail, reminders }: { event: EventRecord; detail: ReturnType<typeof getEventDetailSummary>; reminders: Reminder[] }) {
  const [checkpoint, setCheckpoint] = useState("T+7");
  const scorecard = calculateEventScorecard(event, getScorecardData(reminders));
  const rows = scorecard.rows;
  const summary = scorecard.summary;
  const checkpoints = [
    { id: "T+7", label: "T+7 Contact/conversation upload compliance", focus: "Validate contact upload, conversation upload, duplicate review queue, and missing data." },
    { id: "T+14", label: "T+14 Lead reporting and follow-up checkpoint", focus: "Confirm qualified lead reporting and sales follow-up compliance." },
    { id: "T+30", label: "T+30 Pipeline creation checkpoint", focus: "Review pipeline creation, cost reconciliation, and HubSpot sync quality." },
    { id: "T+60", label: "T+60 Pipeline progression / closed-won checkpoint", focus: "Assess opportunity progression, stale follow-ups, and budget variance impact." },
    { id: "T+90", label: "T+90 Final cohort review", focus: "Finalize cohort learning, leadership action, and repeat/retire recommendation." },
  ];
  const activeCheckpoint = checkpoints.find((item) => item.id === checkpoint) ?? checkpoints[0];

  return (
    <div className="space-y-6">
      <Panel title="Event-level score summary" action={<ScorecardStatusBadge status={summary.overallStatus} />}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniStat label="Overall status" value={summary.overallStatus} />
          <MiniStat label="Main risk" value={summary.mainRisk} />
          <MiniStat label="Missing data" value={String(summary.missingData)} />
          <MiniStat label="Owner" value={summary.owner} />
          <MiniStat label="Recommended action" value={summary.recommendedLeadershipAction} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.riskIndicators.map((risk) => <RiskBadge key={risk} value={risk} />)}
        </div>
      </Panel>

      <Panel title="Scorecard rows">
        <ScorecardTable rows={rows} />
      </Panel>

      <Panel title="Checkpoint tabs">
        <div className="flex flex-wrap gap-2">
          {checkpoints.map((item) => (
            <button key={item.id} onClick={() => setCheckpoint(item.id)} className={`rounded-md px-3 py-2 text-sm font-semibold ${checkpoint === item.id ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
              {item.id}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">{activeCheckpoint.label}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{activeCheckpoint.focus}</p>
        </div>
      </Panel>
    </div>
  );
}

function EventRemindersTab({
  event,
  role,
  reminders,
  setReminders,
  setActivityLogs,
  notify,
}: {
  event: EventRecord;
  role: Role;
  reminders: Reminder[];
  setReminders: Dispatch<SetStateAction<Reminder[]>>;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const eventReminders = reminders.filter((reminder) => reminder.event_id === event.event_id);
  const actOnReminder = (reminder: Reminder, action: "done" | "snooze") => {
    setReminders((current) =>
      current.map((item) => {
        if (item.reminder_id !== reminder.reminder_id) return item;
        if (action === "done") return { ...item, status: "Completed" };
        return { ...item, status: "Open", due_date: addDays(item.due_date, 7) };
      }),
    );
    setActivityLogs((current) => [
      ...current,
      {
        log_id: `LOG-${Date.now()}-${reminder.reminder_id}`,
        event_id: event.event_id,
        timestamp: new Date().toISOString(),
        actor: "Reminder Workflow",
        action: action === "done" ? "Reminder marked done" : "Reminder snoozed",
        details: `${reminder.reminder_type} for ${reminder.owner} was ${action === "done" ? "completed" : "snoozed for 7 days"}.`,
      },
    ]);
    notify("success", action === "done" ? "Reminder completed" : "Reminder snoozed", `${reminder.reminder_type} was ${action === "done" ? "marked done" : "snoozed for 7 days"}.`);
  };

  return (
    <Panel title="Reminders" action={<RiskBadge value={eventReminders.some((reminder) => getReminderDueState(reminder) === "Overdue") ? "Behind Commitment" : "Healthy"} label={`${eventReminders.length} reminders`} />}>
      <div className="space-y-3">
        {eventReminders.map((reminder) => (
          <div key={reminder.reminder_id} className="rounded-lg border border-slate-200 bg-white p-4">
            {(() => {
              const permission = getReminderPermission(role, event, reminder);
              return (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{reminder.reminder_type}</h3>
                  <ReminderStatusBadge reminder={reminder} />
                </div>
                <p className="mt-1 text-sm text-slate-600">Owner: {reminder.owner}</p>
                <p className="mt-1 text-sm text-slate-500">Due {formatDate(reminder.due_date)} · escalation owner: {reminder.escalation_owner}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={!permission.allowed} title={permission.reason} onClick={() => actOnReminder(reminder, "done")}>Mark as done</button>
                <button className="btn-secondary" disabled={!permission.allowed} title={permission.reason} onClick={() => actOnReminder(reminder, "snooze")}>Snooze</button>
              </div>
            </div>
              );
            })()}
          </div>
        ))}
        {eventReminders.length === 0 && <p className="text-sm text-slate-500">No reminders for this event.</p>}
      </div>
    </Panel>
  );
}

function EventActivityLogTab({ event, activityLogs }: { event: EventRecord; activityLogs: ActivityLog[] }) {
  const logs = getActivityLogEntries(event, activityLogs);
  return (
    <Panel title="Activity Log">
      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Log entries" value={String(logs.length)} />
        <MiniStat label="Approvals" value={String(logs.filter((log) => /approval|approved|rejected|revision/i.test(log.action)).length)} />
        <MiniStat label="Uploads / sync" value={String(logs.filter((log) => /upload|sync|SkyMap/i.test(log.action)).length)} />
        <MiniStat label="Override audits" value={String(logs.filter((log) => log.override_audit).length)} />
      </div>
      <div className="space-y-3">
        {logs.map((log) => (
          <div key={log.log_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.timestamp)} · {log.actor}</p>
              </div>
              {log.related_object && <StageBadge value={log.related_object} />}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{log.details}</p>
            {log.override_audit && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Commitment override audit</p>
                <div className="mt-2 grid gap-2 text-sm text-amber-800 md:grid-cols-2">
                  <p>Changed by: {log.override_audit.changed_by}</p>
                  <p>Timestamp: {formatDateTime(log.override_audit.change_timestamp)}</p>
                  <p>Previous: {log.override_audit.previous_value}</p>
                  <p>New: {log.override_audit.new_value}</p>
                  <p>Approver: {log.override_audit.approver}</p>
                  <p>Reason: {log.override_audit.reason}</p>
                </div>
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && <p className="text-sm text-slate-500">No activity yet.</p>}
      </div>
    </Panel>
  );
}

function RecordTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-5 table-shell overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-4 py-4 text-slate-600">{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-slate-500" colSpan={headers.length}>No records yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  return (
    <div className="table-shell overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Objective</th>
            <th className="px-4 py-3">Commitment</th>
            <th className="px-4 py-3">Actual</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Notes / explanation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.objective}>
              <td className="px-4 py-4 font-semibold">{row.objective}</td>
              <td className="px-4 py-4 text-slate-600">{row.commitment}</td>
              <td className="px-4 py-4 text-slate-600">{row.actual}</td>
              <td className="px-4 py-4"><ScorecardStatusBadge status={row.status} /></td>
              <td className="px-4 py-4 text-slate-600">{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalWorkflow({
  event,
  role,
  approvalState,
  activityLogs,
  setApprovalState,
  setActivityLogs,
  updateEvent,
  notify,
}: {
  event: EventRecord;
  role: Role;
  approvalState: ApprovalState;
  activityLogs: ActivityLog[];
  setApprovalState: Dispatch<SetStateAction<ApprovalState>>;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const requiredApprovers = getRequiredApprovers(event);
  const visibilityNotices = getApprovalVisibilityNotices(event);
  const decisions = approvalState[event.event_id] ?? {};
  const completedApprovers = requiredApprovers.filter((approver) => decisions[approver] === "Approved");
  const rejectedApprovers = requiredApprovers.filter((approver) => decisions[approver] === "Rejected");
  const revisionApprovers = requiredApprovers.filter((approver) => decisions[approver] === "Needs Revision");
  const pendingApprovers = requiredApprovers.filter((approver) => !decisions[approver]);
  const allApproved = requiredApprovers.length > 0 && completedApprovers.length === requiredApprovers.length;
  const eventLogs = activityLogs.filter((log) => log.event_id === event.event_id).slice(-6).reverse();
  const workflowSteps = [
    "Draft",
    "Submitted",
    "Functional Leader Review",
    "Finance Review",
    "Approved",
    "Locked at Event Start Date",
    "Post-Event Reporting",
    "T+30 Cost Reconciliation",
    "Completed",
  ];

  const recordAction = (approver: string, decision: ApprovalDecision) => {
    const nextApprovals = { ...(approvalState[event.event_id] ?? {}), [approver]: decision };
    const required = getRequiredApprovers(event);
    const nextAllApproved = required.every((requiredApprover) => nextApprovals[requiredApprover] === "Approved");

    setApprovalState((current) => ({
      ...current,
      [event.event_id]: nextApprovals,
    }));
    setActivityLogs((current) => [
      ...current,
      {
        log_id: `LOG-${Date.now()}`,
        event_id: event.event_id,
        timestamp: new Date().toISOString(),
        actor: role,
        action: `Approval action: ${decision}`,
        details: `${role} simulated ${decision.toLowerCase()} for ${approver}. ${nextAllApproved && decision === "Approved" ? "All required approvals are complete." : `${required.filter((requiredApprover) => nextApprovals[requiredApprover] !== "Approved").length} required approver(s) remain.`}`,
        related_object: approver,
      },
    ]);

    if (decision === "Rejected") {
      updateEvent(event.id, { approval_status: "Rejected", stage: "Rejected", status: "Blocked" });
      notify("error", "Approval rejected", `${approver} rejected ${event.event_name}.`);
      return;
    }
    if (decision === "Needs Revision") {
      updateEvent(event.id, { approval_status: "Needs Revision", stage: "Needs Revision", status: "At Risk" });
      notify("info", "Revision requested", `${approver} requested changes before approval.`);
      return;
    }
    if (nextAllApproved) {
      updateEvent(event.id, {
        approval_status: "Approved",
        stage: "Approved",
        status: "On Track",
        approved_date: new Date().toISOString().slice(0, 10),
      });
      notify("success", "Event approved", `${event.event_name} has all required approvals.`);
    } else {
      notify("success", "Approval recorded", `${approver} marked approved. ${required.filter((requiredApprover) => nextApprovals[requiredApprover] !== "Approved").length} approver(s) remain.`);
    }
  };

  return (
    <Panel title="Approval Workflow" action={<StageBadge value={allApproved ? "Approved" : event.approval_status} />}>
      <div className="space-y-5">
        <section>
          <h3 className="section-title">Approval timeline</h3>
          <div className="mt-3 space-y-2">
            {workflowSteps.map((step) => {
              const complete = isWorkflowStepComplete(event, step, allApproved);
              const active = isWorkflowStepActive(event, step, allApproved);
              return (
                <div key={step} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${active ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-white"}`}>
                  <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${complete ? "bg-emerald-100 text-emerald-700" : active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {complete ? "✓" : ""}
                  </span>
                  <span className="font-medium text-slate-800">{step}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="section-title">Required approvers</h3>
          <div className="mt-3 space-y-3">
            {requiredApprovers.map((approver) => {
              const decision = decisions[approver];
              const approvalPermission = getApprovalPermission(role, event, approver);
              return (
                <div key={approver} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{approver}</p>
                      <p className="mt-1 text-xs text-slate-500">{getApproverReason(event, approver)}</p>
                    </div>
                    <ApprovalDecisionBadge decision={decision} />
                  </div>
                  {!decision && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn-secondary" disabled={!approvalPermission.allowed} title={approvalPermission.reason} onClick={() => recordAction(approver, "Approved")}>Approve</button>
                      <button className="btn-secondary" disabled={!approvalPermission.allowed} title={approvalPermission.reason} onClick={() => recordAction(approver, "Needs Revision")}>Request Revision</button>
                      <button className="btn-danger" disabled={!approvalPermission.allowed} title={approvalPermission.reason} onClick={() => recordAction(approver, "Rejected")}>Reject</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {visibilityNotices.length > 0 && (
          <section>
            <h3 className="section-title">Visibility-only notices</h3>
            <div className="mt-3 space-y-3">
              {visibilityNotices.map((notice) => (
                <div key={notice} className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-sky-950">{notice}</p>
                      <p className="mt-1 text-xs text-sky-700">Informational routing only. This does not block approval completion.</p>
                    </div>
                    <RiskBadge value="Sync Issue" label="Visibility only" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MiniStat label="Completed approvers" value={String(completedApprovers.length)} />
          <MiniStat label="Pending approvers" value={String(pendingApprovers.length)} />
          <MiniStat label="Revision or rejected" value={String(revisionApprovers.length + rejectedApprovers.length)} />
          <MiniStat label="Visibility notices" value={String(visibilityNotices.length)} />
        </section>

        <section>
          <h3 className="section-title">Activity log</h3>
          <div className="mt-3 space-y-2">
            {eventLogs.map((log) => (
              <div key={log.log_id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.timestamp)} · {log.actor}</p>
                <p className="mt-1 text-sm text-slate-600">{log.details}</p>
              </div>
            ))}
            {eventLogs.length === 0 && <p className="text-sm text-slate-500">No approval activity yet.</p>}
          </div>
        </section>
      </div>
    </Panel>
  );
}

function CreateEvent({
  role,
  notify,
  onSaveDraft,
  onSubmitForApproval,
}: {
  role: Role;
  notify: (tone: ToastTone, title: string, message: string) => void;
  onSaveDraft: (form: CreateEventForm, existingEventId?: string | null) => EventRecord;
  onSubmitForApproval: (form: CreateEventForm, existingEventId?: string | null) => EventRecord;
}) {
  const [form, setForm] = useState<CreateEventForm>(defaultCreateEventForm);
  const [submitted, setSubmitted] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const estimatedCost = Number(form.estimatedCost || 0);
  const validation = getCreateEventValidation(form);
  const routingPreview = getApprovalRoutingPreview(form);
  const objectiveSummary = getMeasurableObjectiveSummary(form);
  const hasMeasurableObjectives = objectiveSummary.measurableYesCount > 0;
  const isMarketingListOnly = objectiveSummary.isMarketingListOnly;
  const canSubmit = validation.length === 0;

  const updateForm = (key: keyof CreateEventForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateNestedForm = <Section extends keyof CreateEventForm>(
    section: Section,
    key: string,
    value: string | boolean,
  ) => {
    setForm((current) => ({
      ...current,
      [section]: { ...(current[section] as Record<string, string | boolean>), [key]: value },
    }));
  };

  const saveDraft = () => {
    if (!getRolePermission(role, "createEvent").allowed) return;
    const event = onSaveDraft(form, createdEventId);
    setCreatedEventId(event.id);
    setSaveMessage(`${event.event_name} saved as Draft and added to Event List.`);
    setSubmitted(false);
    notify("success", "Draft saved", `${event.event_name} is now available in Event List.`);
  };

  const submitForApproval = () => {
    if (!getRolePermission(role, "submitApproval").allowed) return;
    setSubmitted(true);
    if (!canSubmit) {
      notify("error", "Cannot submit yet", `${validation.length} required item(s) still need attention.`);
      return;
    }
    const event = onSubmitForApproval(form, createdEventId);
    setCreatedEventId(event.id);
    setSaveMessage(`${event.event_name} submitted for approval. Routing, reminders, cost lines, objectives, and activity logs were generated.`);
    notify("success", "Submitted for approval", `${event.event_name} is now in the approval workflow.`);
  };
  const createPermission = getRolePermission(role, "createEvent");
  const canSeeCostColumns = canRoleSeeCostData(role);
  const submitPermission = getRolePermission(role, "submitApproval");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
      <div className="space-y-6">
        <Panel title="Basic Event Information">
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Event name" value={form.eventName} onChange={(value) => updateForm("eventName", value)} required placeholder="Regional pipeline acceleration event" error={submitted ? getFieldError("eventName", form) : ""} />
            <TextInput label="Location" value={form.location} onChange={(value) => updateForm("location", value)} required placeholder="Austin, TX or Virtual" error={submitted ? getFieldError("location", form) : ""} />
            <TextInput label="Event start date" type="date" value={form.startDate} onChange={(value) => updateForm("startDate", value)} required error={submitted ? getFieldError("startDate", form) : ""} />
            <TextInput label="Event end date" type="date" value={form.endDate} onChange={(value) => updateForm("endDate", value)} required error={submitted ? getFieldError("endDate", form) : ""} />
            <FormSelect label="Region" value={form.region} options={["", "West", "East", "EMEA", "APAC"]} onChange={(value) => updateForm("region", value)} required error={submitted ? getFieldError("region", form) : ""} />
          </div>
        </Panel>

        <Panel title="Ownership and Funding">
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Event Owner" value={form.eventOwner} onChange={(value) => updateForm("eventOwner", value)} required placeholder="Person accountable for execution" error={submitted ? getFieldError("eventOwner", form) : ""} />
            <FormSelect label="Functional owner" value={form.functionalOwner} options={["", ...functionalOwnerOptions]} onChange={(value) => updateForm("functionalOwner", value)} required error={submitted ? getFieldError("functionalOwner", form) : ""} />
            <TextInput label="Funding source" value={form.fundingSource} onChange={(value) => updateForm("fundingSource", value)} required placeholder="Marketing Programs, Channel, Sales, Alliance" error={submitted ? getFieldError("fundingSource", form) : ""} />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estimated all-in cost</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{estimatedCost ? money.format(estimatedCost) : "Upload cost CSV to calculate"}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Event Type and Tier">
          <div className="grid gap-4 md:grid-cols-2">
            <FormSelect label="Event type" value={form.eventType} options={["", ...EVENT_TYPES]} onChange={(value) => updateForm("eventType", value)} required error={submitted ? getFieldError("eventType", form) : ""} />
            <FormSelect label="Event tier" value={form.eventTier} options={["", "Tier 1 Strategic", ...EVENT_TIERS, "Other"]} onChange={(value) => updateForm("eventTier", value)} required error={submitted ? getFieldError("eventTier", form) : ""} />
          </div>
          {form.eventTier === "Other" && (
            <div className="mt-4">
              <TextAreaInput label="Event tier explanation" value={form.eventTierExplanation} onChange={(value) => updateForm("eventTierExplanation", value)} required placeholder="Explain why this event does not fit the standard tier model." error={submitted ? getFieldError("eventTierExplanation", form) : ""} />
            </div>
          )}
        </Panel>

        <Panel title="Lead Capture Plan">
          <div className="grid gap-4 md:grid-cols-2">
            <FormSelect label="Lead capture method" value={form.leadCaptureMethod} options={["", ...leadCaptureMethods]} onChange={(value) => updateForm("leadCaptureMethod", value)} required error={submitted ? getFieldError("leadCaptureMethod", form) : ""} />
            <TextInput label="Outreach owner" value={form.outreachOwner} onChange={(value) => updateForm("outreachOwner", value)} required placeholder="AE, SDR manager, or Marketing Ops owner" error={submitted ? getFieldError("outreachOwner", form) : ""} />
          </div>
        </Panel>

        <Panel title="Post-Event Plan">
          <div className="grid gap-4 md:grid-cols-2">
            <FormSelect label="Follow-up timeline" value={form.followUpTimeline} options={["", ...followUpTimelineOptions]} onChange={(value) => updateForm("followUpTimeline", value)} required error={submitted ? getFieldError("followUpTimeline", form) : ""} />
            <TextAreaInput label="Post-event plan" value={form.postEventPlan} onChange={(value) => updateForm("postEventPlan", value)} required placeholder="Upload responsibilities, duplicate review, HubSpot campaign sync, sales follow-up, and scorecard timing." error={submitted ? getFieldError("postEventPlan", form) : ""} />
          </div>
        </Panel>

        <CostEstimateComponent
          form={form}
          role={role}
          submitted={submitted}
          updateCostLines={(lines) => {
            const nextEstimatedCost = lines.reduce((sum, line) => sum + line.estimatedAmount, 0);
            setForm((current) => ({ ...current, costLines: lines, estimatedCost: String(nextEstimatedCost) }));
          }}
          updateActualAmount={(lineId, value) => {
            setForm((current) => ({
              ...current,
              costLines: current.costLines.map((line) => (line.id === lineId ? { ...line, actualAmount: value } : line)),
            }));
          }}
          updateVarianceExplanation={(value) => updateForm("varianceExplanation", value)}
        />

        <ObjectivesCommitments
          form={form}
          role={role}
          submitted={submitted}
          updateNestedForm={updateNestedForm}
          updateReasonToBelieve={(value) => updateForm("reasonToBelieve", value)}
        />
      </div>

      <aside className="space-y-6">
        <Panel title="Approval Routing Preview" action={<RiskBadge value={canSubmit ? "Healthy" : "Needs Review"} label={canSubmit ? "Ready" : "Incomplete"} />}>
          <div className="space-y-3">
            <WorkflowStep title="Functional owner" copy={`${form.functionalOwner || "Functional owner"} reviews event objective, owner, and follow-up plan.`} complete={Boolean(form.functionalOwner)} />
            <WorkflowStep title="Department Head" copy={estimatedCost > 5000 ? "Required because estimated cost is above $5,000." : "Not required below $5,001 unless manually escalated."} complete={estimatedCost > 5000} />
            <WorkflowStep title="CFO + CEO visibility" copy={estimatedCost > 15000 ? "Required because estimated cost is above $15,000." : "Not triggered by current estimated cost."} complete={estimatedCost > 15000} />
            <WorkflowStep title="Leadership approval" copy={form.eventTier === "Tier 1 Strategic" ? "Required for Tier 1 Strategic events." : "Required only for Tier 1 Strategic events."} complete={form.eventTier === "Tier 1 Strategic"} />
          </div>
          <div className="mt-4 space-y-2">
            {routingPreview.map((route) => (
              <div key={route} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{route}</div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!hasMeasurableObjectives && <RiskBadge value="Missing Data" label="Non-Measurable Event" />}
            {isMarketingListOnly && <RiskBadge value="Needs Review" label="Marketing-List-Only Event" />}
            {form.eventType === "Marketing List Build" && <RiskBadge value="Needs Review" label="No direct HubSpot lead handoff" />}
          </div>
        </Panel>

        <Panel title="Validation">
          {submitted && validation.length > 0 ? (
            <div className="space-y-2">
              {validation.map((message) => (
                <div key={message} className="form-error rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{message}</div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-600">Complete the intake fields to enable approval submission. Save Draft is always available.</p>
          )}
          {saveMessage && <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{saveMessage}</div>}
        </Panel>

        <Panel title="Actions">
          <div className="space-y-3">
            <button className="btn-secondary w-full justify-center" disabled={!createPermission.allowed} title={createPermission.reason} onClick={saveDraft}>Save Draft</button>
            <button className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-40" disabled={!submitPermission.allowed || (submitted && !canSubmit)} title={submitPermission.reason} onClick={submitForApproval}>Submit for Approval</button>
            <button
              className="btn-secondary w-full justify-center"
              onClick={() => {
                setForm(defaultCreateEventForm);
                setCreatedEventId(null);
                setSubmitted(false);
                setSaveMessage("");
              }}
            >
              Cancel
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Prototype only. Draft and submit actions are simulated locally for review by {role}.</p>
        </Panel>
      </aside>
    </div>
  );
}

function CostEstimateComponent({
  form,
  role,
  submitted,
  updateCostLines,
  updateActualAmount,
  updateVarianceExplanation,
}: {
  form: CreateEventForm;
  role: Role;
  submitted: boolean;
  updateCostLines: (lines: CostEstimateLine[]) => void;
  updateActualAmount: (lineId: string, value: string) => void;
  updateVarianceExplanation: (value: string) => void;
}) {
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const estimatedTotal = form.costLines.reduce((sum, line) => sum + line.estimatedAmount, 0);
  const actualTotal = form.costLines.reduce((sum, line) => sum + Number(line.actualAmount || 0), 0);
  const varianceAmount = actualTotal - estimatedTotal;
  const variancePercentage = estimatedTotal > 0 ? (varianceAmount / estimatedTotal) * 100 : 0;
  const overBudget = actualTotal > estimatedTotal && variancePercentage > 10;
  const needsExplanation = overBudget && !form.varianceExplanation.trim();
  const canEnterActuals = role === "Finance / CFO" || role === "Event Owner" || role === "Admin";

  const handleCsvUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseCostCsv(String(reader.result ?? ""));
      setCsvErrors(result.errors);
      if (result.errors.length === 0) updateCostLines(result.lines);
    };
    reader.readAsText(file);
  };

  const downloadSampleCsv = () => {
    const sample = [
      requiredCostCsvColumns.join(","),
      "Participation Fee,7500,EduTech Summit,Booth package",
      "Travel,3200,Corporate Travel Desk,Flights and hotel",
      "Marketing Materials,1800,PrintWorks,One-page handouts and signage",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "event-cost-estimate-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Cost Estimate Summary"
      action={
        <div className="flex flex-wrap gap-2">
          {overBudget && <RiskBadge value="Over Budget" />}
          {needsExplanation && <RiskBadge value="Needs Review" label="Needs Explanation" />}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="upload-zone rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">CSV upload only</h3>
              <p className="mt-1 text-sm text-slate-500">Required columns: {requiredCostCsvColumns.join(", ")}.</p>
            </div>
            <button className="btn-secondary" onClick={downloadSampleCsv}>Sample CSV</button>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => handleCsvUpload(event.target.files?.[0])}
            className="form-file-input mt-4 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          {csvErrors.length > 0 && (
            <div className="mt-3 space-y-2">
              {csvErrors.map((error) => (
                <div key={error} className="form-error rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
              ))}
            </div>
          )}
          {submitted && form.costLines.length === 0 && <p className="mt-2 text-xs font-medium text-rose-600">Error: Cost estimate CSV is required before approval.</p>}
        </div>

        <div className="grid gap-3">
          <MiniStat label="Estimated all-in cost" value={money.format(estimatedTotal)} />
          <MiniStat label="Actual cost total" value={money.format(actualTotal)} />
          <MiniStat label="Variance" value={`${money.format(varianceAmount)} (${variancePercentage.toFixed(1)}%)`} />
        </div>
      </div>

      <div className="mt-5 table-shell overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Cost Category</th>
              <th className="px-4 py-3">Estimated Amount</th>
              <th className="px-4 py-3">Actual Amount</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {form.costLines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-4"><StageBadge value={line.costCategory} /></td>
                <td className="px-4 py-4 text-slate-600">{money.format(line.estimatedAmount)}</td>
                <td className="px-4 py-4">
                  <input
                    type="number"
                    value={line.actualAmount}
                    disabled={!canEnterActuals}
                    onChange={(event) => updateActualAmount(line.id, event.target.value)}
                    className="h-9 w-32 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="0"
                  />
                </td>
                <td className="px-4 py-4 text-slate-600">{line.vendor}</td>
                <td className="px-4 py-4 text-slate-600">{line.notes}</td>
              </tr>
            ))}
            {form.costLines.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>Upload a CSV to display cost lines.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {overBudget && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <TextAreaInput
            label="Variance explanation"
            value={form.varianceExplanation}
            onChange={updateVarianceExplanation}
            required
            placeholder="Explain why actual cost is more than 10% above estimate."
            error={needsExplanation && submitted ? "Variance explanation is required when actual cost is more than 10% above estimate." : ""}
          />
        </div>
      )}
    </Panel>
  );
}

function ObjectivesCommitments({
  form,
  role,
  submitted,
  updateNestedForm,
  updateReasonToBelieve,
}: {
  form: CreateEventForm;
  role: Role;
  submitted: boolean;
  updateNestedForm: (section: keyof CreateEventForm, key: string, value: string | boolean) => void;
  updateReasonToBelieve: (value: string) => void;
}) {
  const isLocked = isObjectiveLocked(form.startDate);
  const canEditLockedCommitments = role === "Leadership" || role === "Admin";
  const commitmentDisabled = isLocked && !canEditLockedCommitments;
  const summary = getMeasurableObjectiveSummary(form);
  const rows = [
    {
      id: "marketingListGrowth",
      question: "Marketing list growth expected?",
      yesLabel: "Target Contact Count",
      commitmentKey: "targetContactCount",
      actualLabel: "Actual Contact Count",
    },
    {
      id: "salesLeadGeneration",
      question: "Sales lead generation expected?",
      yesLabel: "Target Qualified Lead Count",
      commitmentKey: "targetQualifiedLeadCount",
      actualLabel: "Actual Qualified Lead Count",
    },
    {
      id: "channelExpansion",
      question: "Channel expansion expected?",
      yesLabel: "Target Qualified Partner Conversations",
      commitmentKey: "targetQualifiedPartnerConversations",
      actualLabel: "Actual Qualified Partner Conversations",
      secondaryLabel: "Partner Agreements Initiated",
      secondaryKey: "partnerAgreementsInitiated",
      secondaryActualLabel: "Actual Partner Agreements Initiated",
    },
  ];

  return (
    <Panel title="Objectives and Commitments" action={<RiskBadge value={isLocked ? "Needs Review" : "Healthy"} label={isLocked ? "Locked" : "Editable"} />}>
      <div className="mb-4 flex flex-wrap gap-2">
        {!summary.allQuestionsAnswered && <RiskBadge value="Missing Data" label="Objectives must be declared before approval" />}
        {summary.measurableYesCount === 0 && <RiskBadge value="Missing Data" label="Non-Measurable Event" />}
        {summary.isMarketingListOnly && <RiskBadge value="Needs Review" label="Marketing-List-Only Event" />}
        {commitmentDisabled && <RiskBadge value="Needs Review" label="Override required to change commitments" />}
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const objectiveId = row.id as keyof CreateEventForm["measurableObjectives"];
          const commitmentKey = row.commitmentKey as keyof CreateEventForm["objectiveCommitments"];
          const secondaryKey = row.secondaryKey as keyof CreateEventForm["objectiveCommitments"] | undefined;
          const isYes = form.measurableObjectives[objectiveId] === "Yes";
          const baseError = submitted && !form.measurableObjectives[objectiveId] ? "Yes or No is required." : "";
          const commitmentError = submitted && isYes && !form.objectiveCommitments[commitmentKey] ? "Original commitment is required when marked Yes." : "";
          const secondaryError = submitted && isYes && secondaryKey && !form.objectiveCommitments[secondaryKey] ? "Partner agreements commitment is required." : "";

          return (
            <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="font-semibold">{row.question}</h3>
                  <p className="mt-1 text-sm text-slate-500">Declared before approval. Commitments lock automatically at event start date.</p>
                </div>
                <SegmentedYesNo
                  value={form.measurableObjectives[objectiveId]}
                  disabled={commitmentDisabled}
                  onChange={(value) => updateNestedForm("measurableObjectives", objectiveId, value)}
                />
              </div>
              {baseError && <p className="mt-2 text-xs font-medium text-rose-600">{baseError}</p>}

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Original commitment</h4>
                  <div className="mt-3 space-y-3">
                    <TextInput label={row.yesLabel} type="number" value={form.objectiveCommitments[commitmentKey]} onChange={(value) => updateNestedForm("objectiveCommitments", commitmentKey, value)} required={isYes} disabled={!isYes || commitmentDisabled} error={commitmentError} />
                    {secondaryKey && (
                      <TextInput label={row.secondaryLabel ?? ""} type="number" value={form.objectiveCommitments[secondaryKey]} onChange={(value) => updateNestedForm("objectiveCommitments", secondaryKey, value)} required={isYes} disabled={!isYes || commitmentDisabled} error={secondaryError} />
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Actual result</h4>
                  <div className="mt-3 space-y-3">
                    <TextInput label={row.actualLabel} type="number" value={form.objectiveActuals[commitmentKey]} onChange={(value) => updateNestedForm("objectiveActuals", commitmentKey, value)} disabled={!isYes} />
                    {secondaryKey && (
                      <TextInput label={row.secondaryActualLabel ?? ""} type="number" value={form.objectiveActuals[secondaryKey]} onChange={(value) => updateNestedForm("objectiveActuals", secondaryKey, value)} disabled={!isYes} />
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Status and notes</h4>
                  <div className="mt-3 space-y-3">
                    <FormSelect label="Status" value={form.objectiveStatuses[objectiveId]} options={["Not Started", "On Track", "Behind Commitment", "Met", "Exceeded", "Missed", "Not Measurable"]} onChange={(value) => updateNestedForm("objectiveStatuses", objectiveId, value)} />
                    <TextAreaInput label="Notes" value={form.objectiveNotes[objectiveId]} onChange={(value) => updateNestedForm("objectiveNotes", objectiveId, value)} placeholder="Add context on progress, quality, routing, or measurement caveats." />
                  </div>
                </div>
              </div>

              {isLocked && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <h4 className="text-sm font-semibold text-amber-800">Override request</h4>
                  <p className="mt-1 text-sm text-amber-700">Original commitments are locked. Submit an override request to change the commitment baseline.</p>
                  <TextAreaInput label="Override request" value={form.overrideRequests[objectiveId]} onChange={(value) => updateNestedForm("overrideRequests", objectiveId, value)} placeholder="Explain why the locked commitment should be changed." />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="section-title">Optional objective categories</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {objectiveCategoryOptions.map((category) => (
            <label key={category} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(form.objectiveCategories[category])}
                onChange={(event) => updateNestedForm("objectiveCategories", category, event.target.checked)}
                className="size-4 accent-slate-950"
              />
              {category}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <TextAreaInput label="Reason to believe" value={form.reasonToBelieve} onChange={updateReasonToBelieve} required placeholder="Why this event should meet its commitments: target accounts, partner pull, audience quality, prior performance, sales motion." error={submitted ? getFieldError("reasonToBelieve", form) : ""} />
      </div>
    </Panel>
  );
}

function SegmentedYesNo({ value, onChange, disabled }: { value: "" | "Yes" | "No"; onChange: (value: "Yes" | "No") => void; disabled?: boolean }) {
  return (
    <div className="grid w-full grid-cols-2 rounded-md border border-slate-200 bg-slate-100 p-1 sm:w-44">
      {(["Yes", "No"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`rounded px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            value === option ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}


type UploadsSectionTab = "contacts" | "conversations" | "costs" | "history" | "validation";

type UploadValidationItem = {
  id: string;
  eventId: string;
  eventName: string;
  type: string;
  owner: string;
  issue: string;
  action: string;
  tab: DetailTab;
};

function UploadsSection({
  events,
  role,
  uploads: uploadRows,
  reminders: reminderRows,
  setActivityLogs,
  onContactsUploaded,
  onConversationsUploaded,
  updateEvent,
  updateCostLineActual,
  setView,
  setSelectedId,
  setSelectedDetailTab,
  notify,
}: {
  events: EventRecord[];
  role: Role;
  uploads: UploadBatch[];
  reminders: Reminder[];
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  onContactsUploaded: (event: EventRecord, lines: UploadedContactLine[], fileName: string) => void;
  onConversationsUploaded: (event: EventRecord, lines: UploadedConversationLine[], fileName: string) => void;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  updateCostLineActual: (costLineId: string, value: number) => void;
  setView: (view: AppView) => void;
  setSelectedId: (id: string) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const uploadReadyEvents = events.filter(isPastOrPostEvent);
  const selectableEvents = uploadReadyEvents.length > 0 ? uploadReadyEvents : events;
  const [selectedUploadEventId, setSelectedUploadEventId] = useState(selectableEvents[0]?.event_id ?? "");
  const [activeTab, setActiveTab] = useState<UploadsSectionTab>(isSalesRole(role) ? "conversations" : "contacts");

  useEffect(() => {
    if (selectableEvents.length === 0) return;
    if (!selectableEvents.some((event) => event.event_id === selectedUploadEventId)) {
      setSelectedUploadEventId(selectableEvents[0].event_id);
    }
  }, [selectableEvents, selectedUploadEventId]);

  useEffect(() => {
    setActiveTab(isSalesRole(role) ? "conversations" : "contacts");
  }, [role]);

  const selectedEvent = selectableEvents.find((event) => event.event_id === selectedUploadEventId) ?? selectableEvents[0] ?? events[0];
  const visibleEventIds = new Set(events.map((event) => event.event_id));
  const visibleUploads = uploadRows.filter((upload) => visibleEventIds.has(upload.event_id));
  const selectedUploads = selectedEvent ? visibleUploads.filter((upload) => upload.event_id === selectedEvent.event_id) : [];
  const selectedContacts = selectedEvent ? getWorkflowData().contacts.filter((contact) => contact.event_id === selectedEvent.event_id) : [];
  const selectedConversations = selectedEvent ? getWorkflowData().conversations.filter((conversation) => conversation.event_id === selectedEvent.event_id) : [];
  const validationItems = buildUploaderCorrectionItems(events, role, reminderRows);
  const selectedValidationItems = selectedEvent ? validationItems.filter((item) => item.eventId === selectedEvent.event_id) : validationItems;
  const missingFieldItems = validationItems.filter((item) => item.type === "Missing required fields" || item.type === "Missing lead fields");
  const contactUploadPermission = selectedEvent ? getRolePermission(role, "uploadContacts", selectedEvent) : { allowed: false, reason: "Select an event first." };
  const conversationUploadPermission = selectedEvent ? getRolePermission(role, "uploadConversations", selectedEvent) : { allowed: false, reason: "Select an event first." };
  const actualCostPermission = selectedEvent ? getRolePermission(role, "updateActualCost", selectedEvent) : { allowed: false, reason: "Select an event first." };
  const tabs: Array<{ id: UploadsSectionTab; label: string; count?: number }> = [
    { id: "contacts", label: "Contact list upload", count: selectedContacts.length },
    { id: "conversations", label: getRoleFacingLabel(role, "Conversation Upload"), count: selectedConversations.length },
    { id: "costs", label: "Actual cost submission" },
    { id: "history", label: "Upload history", count: selectedUploads.length },
    { id: "validation", label: "Validation results", count: selectedValidationItems.length },
  ];

  const openEventDetailTab = (eventId: string, tab: DetailTab) => {
    const event = events.find((item) => item.event_id === eventId);
    if (!event) return;
    setSelectedId(event.id);
    setSelectedDetailTab(tab);
    setView("event-detail");
  };

  if (!selectedEvent) {
    return (
      <Panel title="Uploads">
        <EmptyState
          title="No upload events in scope"
          copy="This role does not currently have events available for post-event upload. Switch roles or create an event before uploading contact, conversation, or cost data."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel title="Uploads" action={<StageBadge value="Post-event submission" />}>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">I just finished the event</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Submit post-event contacts, conversations, and cost information.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Uploads are for Event Owners, Sales Reps, and Channel teams to submit contacts, sales conversations, actual costs, and corrections they own. Duplicate review and HubSpot troubleshooting live in Data Review.
            </p>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="upload-event-select">Event</label>
            <select
              id="upload-event-select"
              value={selectedEvent.event_id}
              onChange={(event) => setSelectedUploadEventId(event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-slate-400"
            >
              {selectableEvents.map((event) => (
                <option key={event.event_id} value={event.event_id}>{event.event_name}</option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniStat label="Contact rows" value={number.format(selectedContacts.length)} />
              <MiniStat label="Conversation rows" value={number.format(selectedConversations.length)} />
              <MiniStat label="Upload batches" value={number.format(selectedUploads.length)} />
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-3">
          <MiniStat label="Visible upload batches" value={number.format(visibleUploads.length)} />
          <MiniStat label="Held by validation" value={number.format(visibleUploads.reduce((sum, upload) => sum + upload.held_for_review_records, 0))} />
          <MiniStat label="Missing fields to correct" value={number.format(missingFieldItems.length)} />
          <MiniStat label="Contact upload" value={contactUploadPermission.allowed ? "Available" : "Restricted"} />
          <MiniStat label={getRoleFacingLabel(role, "Conversation Upload")} value={conversationUploadPermission.allowed ? "Available" : "Restricted"} />
          <MiniStat label="Actual costs" value={actualCostPermission.allowed ? "Available" : "Restricted"} />
        </div>
      </Panel>

      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${activeTab === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
            >
              {tab.label}{tab.count !== undefined ? ` (${number.format(tab.count)})` : ""}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "contacts" && (
        <EventContactsTab
          event={selectedEvent}
          role={role}
          setActivityLogs={setActivityLogs}
          onContactsUploaded={onContactsUploaded}
          notify={notify}
        />
      )}
      {activeTab === "conversations" && (
        <EventConversationsTab
          event={selectedEvent}
          role={role}
          setActivityLogs={setActivityLogs}
          onConversationsUploaded={onConversationsUploaded}
          notify={notify}
        />
      )}
      {activeTab === "costs" && (
        <EventCostEstimateTab
          event={selectedEvent}
          role={role}
          setActivityLogs={setActivityLogs}
          updateEvent={updateEvent}
          updateCostLineActual={updateCostLineActual}
          notify={notify}
        />
      )}
      {activeTab === "history" && (
        <UploadHistoryPanel
          events={events}
          uploads={visibleUploads}
          selectedEventId={selectedEvent.event_id}
          openEventDetailTab={openEventDetailTab}
        />
      )}
      {activeTab === "validation" && (
        <UploadValidationPanel
          items={selectedValidationItems}
          openEventDetailTab={openEventDetailTab}
          role={role}
        />
      )}
    </div>
  );
}

function UploadHistoryPanel({
  events,
  uploads: uploadRows,
  selectedEventId,
  openEventDetailTab,
}: {
  events: EventRecord[];
  uploads: UploadBatch[];
  selectedEventId: string;
  openEventDetailTab: (eventId: string, tab: DetailTab) => void;
}) {
  const selectedUploads = uploadRows.filter((upload) => upload.event_id === selectedEventId);
  const historyUploads = selectedUploads.length > 0 ? selectedUploads : uploadRows;

  return (
    <Panel title="Upload History" action={<StageBadge value={selectedUploads.length > 0 ? "Selected event" : "All visible events"} />}>
      <div className="grid gap-4 lg:grid-cols-3">
        {historyUploads.map((upload) => {
          const event = events.find((item) => item.event_id === upload.event_id);
          const detailTab: DetailTab = upload.upload_type === "Conversation Notes" ? "Conversation Upload" : "Contact Upload";
          return (
            <div key={upload.upload_batch_id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{upload.upload_type}</h3>
                  <p className="mt-1 text-sm text-slate-500">{event?.event_name ?? upload.event_id}</p>
                </div>
                <StageBadge value={upload.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Rows" value={number.format(upload.total_records)} />
                <MiniStat label="Valid" value={number.format(upload.valid_records)} />
                <MiniStat label="Held" value={number.format(upload.held_for_review_records)} />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Uploaded by {upload.uploaded_by} on {formatDateTime(upload.upload_date)}. {number.format(upload.failed_records)} failed validation and {number.format(upload.duplicate_records + upload.possible_duplicate_records)} duplicate or possible duplicate records were held for Data Review.
              </p>
              <button className="btn-secondary mt-4" onClick={() => openEventDetailTab(upload.event_id, detailTab)}>Open related upload tab</button>
            </div>
          );
        })}
        {historyUploads.length === 0 && (
          <div className="lg:col-span-3">
            <EmptyState
              title="No uploads pending"
              copy="Upload batches and validation counts will appear here after post-event submission."
            />
          </div>
        )}
      </div>
    </Panel>
  );
}

function UploadValidationPanel({
  items,
  openEventDetailTab,
  role,
}: {
  items: UploadValidationItem[];
  openEventDetailTab: (eventId: string, tab: DetailTab) => void;
  role: Role;
}) {
  return (
    <Panel title="Upload Validation Results" action={<StageBadge value="Uploader-owned corrections" />}>
      {items.length > 0 ? (
        <div className="table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Validation result</th>
                <th className="px-4 py-3">Correction action</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-semibold">{item.eventName}</td>
                  <td className="px-4 py-4"><RiskBadge value={item.type.includes("Missing") ? "Missing Data" : "Needs Review"} label={getRoleFacingLabel(role, item.type)} /></td>
                  <td className="px-4 py-4 text-slate-600">{item.owner}</td>
                  <td className="px-4 py-4 text-slate-600">{item.issue}</td>
                  <td className="px-4 py-4 text-slate-600">{item.action}</td>
                  <td className="px-4 py-4"><button className="btn-secondary" onClick={() => openEventDetailTab(item.eventId, item.tab)}>Correct</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No uploader-owned corrections"
          copy="Missing business fields assigned back to the uploader will appear here. Duplicate review and HubSpot troubleshooting remain in Data Review."
        />
      )}
    </Panel>
  );
}

function buildUploaderCorrectionItems(events: EventRecord[], role: Role, reminderRows: Reminder[]): UploadValidationItem[] {
  const data = getWorkflowData();
  const eventMap = new Map(events.map((event) => [event.event_id, event]));
  const items: UploadValidationItem[] = [];

  data.contacts.forEach((contact) => {
    const event = eventMap.get(contact.event_id);
    if (!event) return;
    const missing = [];
    if (!contact.email) missing.push("Email");
    if (!contact.company) missing.push("Company");
    if (missing.length === 0 && contact.error_message && /missing|required|complete/i.test(contact.error_message)) missing.push("Required HubSpot fields");
    if (missing.length === 0) return;
    items.push({
      id: `${contact.contact_record_id}-missing-fields`,
      eventId: event.event_id,
      eventName: event.event_name,
      type: "Missing required fields",
      owner: event.event_owner,
      issue: `${missing.join(", ")} must be completed before the contact can sync as a marketing prospect.`,
      action: "Open Contact Upload and correct the missing business fields.",
      tab: "Contact Upload",
    });
  });

  data.conversations.forEach((conversation) => {
    const event = eventMap.get(conversation.event_id);
    if (!event || !conversation.is_sales_lead) return;
    const missing = [];
    if (!conversation.contact_email) missing.push("Contact email");
    if (!conversation.company) missing.push("Company");
    if (!conversation.conversation_summary) missing.push("Conversation summary");
    if (!conversation.product_interest) missing.push("Product interest");
    if (!conversation.follow_up_owner) missing.push("Follow-up owner");
    if (!conversation.next_step) missing.push("Next step");
    if (missing.length === 0 && conversation.error_message && /missing|required|complete/i.test(conversation.error_message)) missing.push("Required lead fields");
    if (missing.length === 0) return;
    items.push({
      id: `${conversation.conversation_id}-missing-lead-fields`,
      eventId: event.event_id,
      eventName: event.event_name,
      type: "Missing lead fields",
      owner: conversation.follow_up_owner || conversation.conversation_owner || event.event_owner,
      issue: `${missing.join(", ")} must be completed before qualified lead handoff.`,
      action: "Open Conversation Upload and complete the qualified lead fields.",
      tab: "Conversation Upload",
    });
  });

  data.uploads.forEach((upload) => {
    const event = eventMap.get(upload.event_id);
    if (!event || upload.failed_records === 0) return;
    const tab: DetailTab = upload.upload_type === "Conversation Notes" ? "Conversation Upload" : "Contact Upload";
    items.push({
      id: `${upload.upload_batch_id}-failed-validation`,
      eventId: event.event_id,
      eventName: event.event_name,
      type: "Failed validation",
      owner: upload.uploaded_by,
      issue: `${number.format(upload.failed_records)} row(s) failed upload validation in ${upload.upload_type}.`,
      action: "Review the upload results and resubmit corrected rows if needed.",
      tab,
    });
  });

  reminderRows.forEach((reminder) => {
    const event = eventMap.get(reminder.event_id);
    if (!event || reminder.status === "Completed") return;
    const dueState = getReminderDueState(reminder);
    const isUploaderReminder = /upload|missing required|complete missing|cost/i.test(`${reminder.reminder_type} ${reminder.owner}`);
    if (!isUploaderReminder || dueState !== "Overdue") return;
    items.push({
      id: `${reminder.reminder_id}-upload-reminder`,
      eventId: event.event_id,
      eventName: event.event_name,
      type: "Overdue upload reminder",
      owner: reminder.owner,
      issue: reminder.reminder_type,
      action: "Open the related upload area and complete the overdue submission.",
      tab: /cost/i.test(reminder.reminder_type) ? "Cost Estimate" : /conversation/i.test(reminder.reminder_type) ? "Conversation Upload" : "Contact Upload",
    });
  });

  if (role === "Event Owner") return items.filter((item) => item.owner.includes(simulatedUserProfile.eventOwner) || item.owner === "Event Owner" || item.owner.includes("Event Owner"));
  if (role === "Sales Rep") return items.filter((item) => item.owner.includes(simulatedUserProfile.salesRep) || item.tab === "Conversation Upload");
  if (role === "Regional Sales Leader") return items.filter((item) => events.some((event) => event.event_id === item.eventId && event.region === simulatedUserProfile.region));
  return items;
}

type DataReviewSection = "records" | "held" | "failed" | "sync" | "company" | "logs" | "assigned";

function DataReview({
  duplicates,
  events,
  role,
  records,
  activityLogs,
  setRecords,
  setContacts,
  setConversations,
  setActivityLogs,
  resolveDuplicate,
  applyDuplicateDecision,
  updateEvent,
  setView,
  setSelectedId,
  setSelectedDetailTab,
  notify,
}: {
  duplicates: DuplicateGroup[];
  events: EventRecord[];
  role: Role;
  records: HubSpotSyncRecord[];
  activityLogs: ActivityLog[];
  setRecords: Dispatch<SetStateAction<HubSpotSyncRecord[]>>;
  setContacts: Dispatch<SetStateAction<EventContact[]>>;
  setConversations: Dispatch<SetStateAction<EventConversation[]>>;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  resolveDuplicate: (id: string) => void;
  applyDuplicateDecision: (record: DuplicateReviewRecord, action: DuplicateReviewAction, status: DuplicateReviewRecord["status"]) => void;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  setView: (view: AppView) => void;
  setSelectedId: (id: string) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const fullQueueRole = role === "Marketing Ops" || role === "Admin";
  const technicalRole = role === "Technical Team";
  const assignedBackOnly = role === "Event Owner" || role === "Sales Rep";
  const [activeSection, setActiveSection] = useState<DataReviewSection>(technicalRole ? "failed" : assignedBackOnly ? "assigned" : "records");
  const allReviewRecords = buildDuplicateReviewRecords(events, duplicates).filter((record) => record.status === "Open" || record.status === "Sales Ops Review");
  const reviewRecords = fullQueueRole ? allReviewRecords : [];
  const heldRecords = records.filter((record) => record.syncStatus === "Held for review");
  const failedRecords = records.filter((record) => record.syncStatus === "Failed");
  const companyReviewRecords = getCompanyAccountReviewRecords(reviewRecords);
  const errorLogs = getDataReviewLogs(events, activityLogs, role);
  const assignedItems = buildAssignedBackDataReviewItems(events, records, role);
  const recordLabel = getRoleFacingLabel(role, "Records Needing Review");
  const syncLabel = getRoleFacingLabel(role, "HubSpot Sync");
  const availableSections: Array<{ id: DataReviewSection; label: string; count: number; badge: string; copy: string }> = fullQueueRole
    ? [
        { id: "records", label: recordLabel, count: reviewRecords.length, badge: reviewRecords.length > 0 ? "Needs Review" : "Healthy", copy: "Duplicate, uncertain, generic, personal-domain, and conflict records." },
        { id: "held", label: "Held Records", count: heldRecords.length, badge: heldRecords.length > 0 ? "Needs Review" : "Healthy", copy: "Records blocked from sync until data quality decisions are complete." },
        { id: "failed", label: "Failed HubSpot Sync", count: failedRecords.length, badge: failedRecords.length > 0 ? "Sync Issue" : "Healthy", copy: "Simulated API/system failures and retry candidates." },
        { id: "sync", label: syncLabel, count: records.length, badge: failedRecords.length > 0 ? "Sync Issue" : heldRecords.length > 0 ? "Needs Review" : "Healthy", copy: "Full sync queue, troubleshooting, and run simulation." },
        { id: "company", label: "Company / Account Match", count: companyReviewRecords.length, badge: companyReviewRecords.length > 0 ? "Needs Review" : "Healthy", copy: "Company conflicts, account matches, and strategic-account review." },
        { id: "logs", label: "Mock Integration Logs", count: errorLogs.length, badge: failedRecords.length > 0 ? "Sync Issue" : "Healthy", copy: "SkyMap, duplicate, HubSpot, and sync-related activity logs." },
      ]
    : technicalRole
      ? [
          { id: "failed", label: "Failed HubSpot Sync", count: failedRecords.length, badge: failedRecords.length > 0 ? "Sync Issue" : "Healthy", copy: "Failed simulated sync records owned by Marketing Ops / Technical Team." },
          { id: "sync", label: syncLabel, count: records.length, badge: failedRecords.length > 0 ? "Sync Issue" : heldRecords.length > 0 ? "Needs Review" : "Healthy", copy: "Sync status and troubleshooting view for visible failed or held records." },
          { id: "logs", label: "Mock Integration Logs", count: errorLogs.length, badge: failedRecords.length > 0 ? "Sync Issue" : "Healthy", copy: "Integration, failed sync, and technical troubleshooting activity." },
        ]
      : [
          { id: "assigned", label: "Assigned Back to You", count: assignedItems.length, badge: assignedItems.length > 0 ? "Missing Data" : "Healthy", copy: "Only missing or incorrect business information assigned back to this role." },
        ];

  useEffect(() => {
    if (!availableSections.some((section) => section.id === activeSection)) {
      setActiveSection(availableSections[0]?.id ?? "assigned");
    }
  }, [availableSections, activeSection]);

  const openEventDetailTab = (eventId: string, tab: DetailTab) => {
    const event = events.find((item) => item.event_id === eventId);
    if (!event) return;
    setSelectedId(event.id);
    setSelectedDetailTab(tab);
    setView("event-detail");
  };

  const retryFailedRecords = () => {
    const retryIds = new Set(failedRecords.map((record) => record.id));
    if (retryIds.size === 0) {
      notify("info", "No failed records", "There are no failed sync records in this Data Review scope.");
      return;
    }
    setRecords((current) =>
      current.map((record) =>
        retryIds.has(record.id)
          ? {
              ...record,
              syncStatus: "Ready to sync",
              errorReason: "",
              correctionAction: "Retry queued after mock technical review",
            }
          : record,
      ),
    );
    setContacts((current) =>
      current.map((contact) =>
        retryIds.has(`HS-CONTACT-${contact.contact_record_id}`)
          ? { ...contact, hubspot_sync_status: "Ready to sync", error_message: null }
          : contact,
      ),
    );
    setConversations((current) =>
      current.map((conversation) =>
        retryIds.has(`HS-LEAD-${conversation.conversation_id}`)
          ? { ...conversation, hubspot_sync_status: "Ready to sync", error_message: null }
          : conversation,
      ),
    );
    appendActivityLogs(setActivityLogs, failedRecords.map((record) => createActivityLog(record.eventId, role, "Failed sync correction", `${record.name} was queued for retry after Data Review troubleshooting.`, record.id)));
    notify("success", "Retry queued", `${number.format(retryIds.size)} failed record(s) were moved back to Ready to sync.`);
  };

  return (
    <div className="space-y-6">
      <Panel title="Data Review" action={<StageBadge value={fullQueueRole ? "Full ops queue" : technicalRole ? "Technical queue" : "Assigned items only"} />}>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Operational data-quality workspace</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Uploaded records need cleanup before they can sync correctly.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Resolve duplicate, held, or failed records before sync. Data Review contains duplicate decisions, company/account match review, retry troubleshooting, and mock integration logs. Upload submission remains in Uploads.
            </p>
            {assignedBackOnly && (
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {role} sees only records assigned back for missing or incorrect business information. Marketing Ops owns duplicate review and sync cleanup.
              </p>
            )}
            {technicalRole && (
              <p className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Technical Team scope is focused on failed sync records, integration errors, and retry troubleshooting.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <MiniStat label="Records needing review" value={number.format(reviewRecords.length)} />
            <MiniStat label="Held records" value={number.format(heldRecords.length)} />
            <MiniStat label="Failed sync" value={number.format(failedRecords.length)} />
            <MiniStat label="Assigned back" value={number.format(assignedItems.length)} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {availableSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`rounded-lg border p-4 text-left transition ${activeSection === section.id ? "border-slate-950 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{section.label}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{section.copy}</p>
              </div>
              <RiskBadge value={section.badge} label={number.format(section.count)} />
            </div>
          </button>
        ))}
      </div>

      {activeSection === "assigned" && <AssignedBackDataReviewPanel items={assignedItems} role={role} openEventDetailTab={openEventDetailTab} />}
      {activeSection === "records" && fullQueueRole && (
        <DuplicateReview
          duplicates={duplicates}
          events={events}
          role={role}
          setActivityLogs={setActivityLogs}
          resolveDuplicate={resolveDuplicate}
          applyDuplicateDecision={applyDuplicateDecision}
          notify={notify}
        />
      )}
      {activeSection === "held" && fullQueueRole && <DataReviewSyncRecordPanel title="Held Records" records={heldRecords} role={role} emptyTitle="No held records" emptyCopy="No duplicate, missing-field, consent, or data-quality records are currently held in this scope." />}
      {activeSection === "failed" && (fullQueueRole || technicalRole) && (
        <DataReviewSyncRecordPanel
          title="Failed HubSpot Sync"
          records={failedRecords}
          role={role}
          emptyTitle="No failed sync records"
          emptyCopy="No simulated HubSpot API or system failures are currently visible for this role."
          action={<button className="btn-primary" disabled={!getRolePermission(role, "runHubSpotSync").allowed || failedRecords.length === 0} title={getRolePermission(role, "runHubSpotSync").reason} onClick={retryFailedRecords}>Retry failed records</button>}
        />
      )}
      {activeSection === "sync" && (fullQueueRole || technicalRole) && (
        <HubSpotSync
          events={events}
          role={role}
          records={records}
          setRecords={setRecords}
          setContacts={setContacts}
          setConversations={setConversations}
          setActivityLogs={setActivityLogs}
          updateEvent={updateEvent}
          notify={notify}
        />
      )}
      {activeSection === "company" && fullQueueRole && <CompanyAccountReviewPanel records={companyReviewRecords} openRecords={() => setActiveSection("records")} />}
      {activeSection === "logs" && (fullQueueRole || technicalRole) && <DataReviewLogsPanel logs={errorLogs} role={role} />}
      {!availableSections.some((section) => section.id === activeSection) && <AssignedBackDataReviewPanel items={assignedItems} role={role} openEventDetailTab={openEventDetailTab} />}
    </div>
  );
}

function AssignedBackDataReviewPanel({
  items,
  role,
  openEventDetailTab,
}: {
  items: UploadValidationItem[];
  role: Role;
  openEventDetailTab: (eventId: string, tab: DetailTab) => void;
}) {
  return (
    <Panel title="Assigned Back to You" action={<StageBadge value="Missing business info" />}>
      {items.length > 0 ? (
        <div className="table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">What is blocked</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-semibold">{item.eventName}</td>
                  <td className="px-4 py-4"><RiskBadge value="Missing Data" label={getRoleFacingLabel(role, item.type)} /></td>
                  <td className="px-4 py-4 text-slate-600">{item.owner}</td>
                  <td className="px-4 py-4 text-slate-600">{item.issue}</td>
                  <td className="px-4 py-4 text-slate-600">{item.action}</td>
                  <td className="px-4 py-4"><button className="btn-secondary" onClick={() => openEventDetailTab(item.eventId, item.tab)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No data review items"
          copy="Duplicate review, held records, and sync troubleshooting stay with Marketing Ops and Technical Team unless a business field is assigned back to you."
        />
      )}
    </Panel>
  );
}

function DataReviewSyncRecordPanel({
  title,
  records,
  role,
  emptyTitle,
  emptyCopy,
  action,
}: {
  title: string;
  records: HubSpotSyncRecord[];
  role: Role;
  emptyTitle: string;
  emptyCopy: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel title={title} action={action}>
      {records.length > 0 ? (
        <div className="table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Record type</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Correction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-4"><StageBadge value={record.recordType} /></td>
                  <td className="px-4 py-4 font-semibold">{record.name}</td>
                  <td className="px-4 py-4 text-slate-600">{record.company || "Missing"}</td>
                  <td className="px-4 py-4 text-slate-600">{record.email || "Missing"}</td>
                  <td className="px-4 py-4 text-slate-600">{record.eventName}</td>
                  <td className="px-4 py-4 text-slate-600">{getRoleFacingLabel(role, record.syncDestination)}</td>
                  <td className="px-4 py-4"><HubSpotStatusBadge status={record.syncStatus} /></td>
                  <td className="px-4 py-4 text-slate-600">{record.errorReason || "None"}</td>
                  <td className="px-4 py-4 text-slate-600">{record.issueOwner}</td>
                  <td className="px-4 py-4 text-slate-600">{record.correctionAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={emptyTitle} copy={emptyCopy} />
      )}
    </Panel>
  );
}

function CompanyAccountReviewPanel({ records, openRecords }: { records: DuplicateReviewRecord[]; openRecords: () => void }) {
  return (
    <Panel title="Company / Account Match Review" action={<button className="btn-secondary" onClick={openRecords}>Open records needing review</button>}>
      {records.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {records.map((record) => (
            <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{record.eventName} · {record.uploadBatchId}</p>
                  <h3 className="mt-2 font-semibold">{record.companyMatch}</h3>
                </div>
                <RiskBadge value={record.confidence === "Conflict" ? "Sync Issue" : "Needs Review"} label={record.confidence} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoRow label="Uploaded contact" value={record.uploadedContact} />
                <InfoRow label="Existing record" value={record.existingHubSpotContact} />
                <InfoRow label="Recommended action" value={record.recommendedAction} />
                <InfoRow label="Owner" value={record.owner} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{record.matchReason}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No company or account match reviews" copy="Company conflicts, strategic account conflicts, personal-domain company creation holds, and uncertain account matches will appear here." />
      )}
    </Panel>
  );
}

function DataReviewLogsPanel({ logs, role }: { logs: ActivityLog[]; role: Role }) {
  return (
    <Panel title="Mock Integration / Error Logs" action={<StageBadge value={role === "Technical Team" ? "Technical scope" : "Ops scope"} />}>
      {logs.length > 0 ? (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.log_id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDateTime(log.timestamp)} · {log.actor}</p>
                  <h3 className="mt-1 font-semibold">{log.action}</h3>
                </div>
                <StageBadge value={log.related_object ?? "Activity"} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{log.details}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No integration logs in scope" copy="HubSpot sync results, failed sync corrections, SkyMap processing, duplicate decisions, and mock integration errors will appear here." />
      )}
    </Panel>
  );
}

function getCompanyAccountReviewRecords(records: DuplicateReviewRecord[]) {
  return records.filter((record) => /company|account|domain|personal|generic|strategic|sales ops|marketing review|conflict/i.test(`${record.companyMatch} ${record.matchReason} ${record.recommendedAction} ${record.duplicateType}`));
}

function getDataReviewLogs(events: EventRecord[], activityLogs: ActivityLog[], role: Role) {
  const eventIds = new Set(events.map((event) => event.event_id));
  const technicalOnly = role === "Technical Team";
  return activityLogs
    .filter((log) => eventIds.has(log.event_id))
    .filter((log) => {
      const text = `${log.actor} ${log.action} ${log.details} ${log.related_object ?? ""}`;
      if (technicalOnly) return /hubspot|sync|failed|error|api|technical|integration/i.test(text);
      return /hubspot|sync|skymap|duplicate|failed|error|review|match|integration|held/i.test(text);
    })
    .slice(-14)
    .reverse();
}

function buildAssignedBackDataReviewItems(events: EventRecord[], records: HubSpotSyncRecord[], role: Role): UploadValidationItem[] {
  const eventMap = new Map(events.map((event) => [event.event_id, event]));
  const items: UploadValidationItem[] = [];
  records.forEach((record) => {
    const event = eventMap.get(record.eventId);
    if (!event) return;
    const issueText = `${record.errorReason} ${record.correctionAction} ${record.issueOwner}`;
    const isBusinessInfoIssue = /missing|required|complete|incorrect|business|field|follow-up|next step|company|email|summary|product interest/i.test(issueText);
    if (!isBusinessInfoIssue || (record.syncStatus !== "Held for review" && record.syncStatus !== "Failed")) return;
    const eventOwnerMatch = role === "Event Owner" && event.event_owner === simulatedUserProfile.eventOwner;
    const salesMatch = role === "Sales Rep" && record.recordType === "Lead" && (record.issueOwner.includes(simulatedUserProfile.salesRep) || record.name.includes(simulatedUserProfile.salesRep));
    if (!eventOwnerMatch && !salesMatch) return;
    items.push({
      id: `${record.id}-assigned-back`,
      eventId: event.event_id,
      eventName: event.event_name,
      type: record.recordType === "Lead" ? "Missing lead fields" : "Missing required fields",
      owner: eventOwnerMatch ? event.event_owner : record.issueOwner,
      issue: record.errorReason || `${record.name} cannot sync until required business information is corrected.`,
      action: record.correctionAction || "Complete the required business fields.",
      tab: record.recordType === "Lead" ? "Conversation Upload" : "Contact Upload",
    });
  });
  return items;
}

function DuplicateReview({
  duplicates,
  events,
  role,
  setActivityLogs,
  resolveDuplicate,
  applyDuplicateDecision,
  notify,
}: {
  duplicates: DuplicateGroup[];
  events: EventRecord[];
  role: Role;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  resolveDuplicate: (id: string) => void;
  applyDuplicateDecision: (record: DuplicateReviewRecord, action: DuplicateReviewAction, status: DuplicateReviewRecord["status"]) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const [filters, setFilters] = useState<DuplicateReviewFilters>({
    eventId: "All",
    uploadBatchId: "All",
    duplicateType: "All",
    confidence: "All",
    owner: "All",
    status: "All",
  });
  const [reviewActions, setReviewActions] = useState<Record<string, { action: DuplicateReviewAction; status: DuplicateReviewRecord["status"] }>>({});
  const records = buildDuplicateReviewRecords(events, duplicates).map((record) => ({
    ...record,
    ...(reviewActions[record.id] ?? {}),
  }));
  const filteredRecords = records.filter((record) => {
    if (filters.eventId !== "All" && record.eventId !== filters.eventId) return false;
    if (filters.uploadBatchId !== "All" && record.uploadBatchId !== filters.uploadBatchId) return false;
    if (filters.duplicateType !== "All" && record.duplicateType !== filters.duplicateType) return false;
    if (filters.confidence !== "All" && record.confidence !== filters.confidence) return false;
    if (filters.owner !== "All" && record.owner !== filters.owner) return false;
    if (filters.status !== "All" && record.status !== filters.status) return false;
    return true;
  });

  const updateFilter = (key: keyof DuplicateReviewFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const recordReviewAction = (record: DuplicateReviewRecord, action: DuplicateReviewAction) => {
    const status: DuplicateReviewRecord["status"] =
      action === "Mark as resolved" || action === "Create new contact" || action === "Match to existing contact" || action === "Update existing contact"
        ? "Resolved"
        : action === "Do not sync"
          ? "Do Not Sync"
          : "Sales Ops Review";

    setReviewActions((current) => ({ ...current, [record.id]: { action, status } }));
    if (record.id.startsWith("DUP-")) resolveDuplicate(record.id);
    applyDuplicateDecision(record, action, status);
    notify("success", "Duplicate decision saved", `${record.uploadedContact} was set to ${status}.`);
    setActivityLogs((current) => [
      ...current,
      {
        log_id: `LOG-${Date.now()}`,
        event_id: record.eventId,
        timestamp: new Date().toISOString(),
        actor: role,
        action: `Duplicate review: ${action}`,
        details: `${record.uploadedContact} reviewed. Status set to ${status}. Reason: ${record.matchReason}`,
      },
    ]);
  };

  return (
    <Panel title={getRoleFacingLabel(role, "Duplicate Review")} action={<button className="btn-secondary"><RefreshCcw className="size-4" /> Re-run match</button>}>
      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-semibold">Marketing Ops review queue</h3>
        <p className="mt-1 text-sm text-slate-600">
          {isSalesRole(role)
            ? "Records with duplicate contacts, company conflicts, generic emails, or uncertain data checks are held before lead handoff."
            : "Duplicate contacts, possible duplicates, company conflicts, personal domains, generic emails, and uncertain SkyMap matches are held before HubSpot sync."}
        </p>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-3">
        <FilterSelect label="Event" value={filters.eventId} options={["All", ...getUniqueValues(records.map((record) => record.eventId))]} onChange={(value) => updateFilter("eventId", value)} />
        <FilterSelect label="Upload batch" value={filters.uploadBatchId} options={["All", ...getUniqueValues(records.map((record) => record.uploadBatchId))]} onChange={(value) => updateFilter("uploadBatchId", value)} />
        <FilterSelect label="Duplicate type" value={filters.duplicateType} options={["All", ...getUniqueValues(records.map((record) => record.duplicateType))]} onChange={(value) => updateFilter("duplicateType", value)} />
        <FilterSelect label="Match confidence" value={filters.confidence} options={["All", ...getUniqueValues(records.map((record) => record.confidence))]} onChange={(value) => updateFilter("confidence", value)} />
        <FilterSelect label="Owner" value={filters.owner} options={["All", ...getUniqueValues(records.map((record) => record.owner))]} onChange={(value) => updateFilter("owner", value)} />
        <FilterSelect label="Status" value={filters.status} options={["All", "Open", "Resolved", "Sales Ops Review", "Do Not Sync"]} onChange={(value) => updateFilter("status", value)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Queue records" value={number.format(filteredRecords.length)} />
        <MiniStat label="Open" value={number.format(filteredRecords.filter((record) => record.status === "Open").length)} />
        <MiniStat label="Conflicts" value={number.format(filteredRecords.filter((record) => record.confidence === "Conflict").length)} />
        <MiniStat label="Sales Ops review" value={number.format(filteredRecords.filter((record) => record.status === "Sales Ops Review").length)} />
      </div>

      <div className="mt-5 space-y-4">
        {filteredRecords.map((record) => (
          <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{record.eventName} · {record.uploadBatchId}</p>
                  <RiskBadge value={record.confidence === "High" ? "Healthy" : record.confidence === "Conflict" ? "Over Budget" : "Needs Review"} label={record.confidence} />
                  <StageBadge value={record.status} />
                </div>
                <h3 className="mt-2 font-semibold">{record.uploadedContact}</h3>
                <p className="mt-1 text-sm text-slate-500">{record.uploadedEmail || "No email supplied"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["Create new contact", "Match to existing contact", "Update existing contact", "Do not sync", "Send to Sales Ops review", "Mark as resolved"] as DuplicateReviewAction[]).map((action) => {
                  const permission = getRolePermission(role, "duplicateReviewAction");
                  return (
                    <button key={action} className="btn-secondary" disabled={!permission.allowed} title={permission.reason} onClick={() => recordReviewAction(record, action)}>
                      {action}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              <InfoRow label="Possible existing HubSpot contact" value={record.existingHubSpotContact} />
              <InfoRow label="Company match" value={record.companyMatch} />
              <InfoRow label="Duplicate type" value={record.duplicateType} />
              <InfoRow label="Recommended action" value={record.recommendedAction} />
              <InfoRow label="Owner" value={record.owner} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{record.matchReason}</p>
          </div>
        ))}
        {filteredRecords.length === 0 && <EmptyState title="Duplicate queue is clear" copy="No records match the current duplicate review filters. Try clearing filters or opening the APAC marketing-list-only demo event." />}
      </div>
    </Panel>
  );
}

function HubSpotSync({
  events,
  role,
  records,
  setRecords,
  setContacts,
  setConversations,
  setActivityLogs,
  updateEvent,
  notify,
}: {
  events: EventRecord[];
  role: Role;
  records: HubSpotSyncRecord[];
  setRecords: Dispatch<SetStateAction<HubSpotSyncRecord[]>>;
  setContacts: Dispatch<SetStateAction<EventContact[]>>;
  setConversations: Dispatch<SetStateAction<EventConversation[]>>;
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const syncPermission = getRolePermission(role, "runHubSpotSync");
  const summary = {
    queue: records.length,
    ready: records.filter((record) => record.syncStatus === "Ready to sync").length,
    held: records.filter((record) => record.syncStatus === "Held for review").length,
    failed: records.filter((record) => record.syncStatus === "Failed").length,
    synced: records.filter((record) => record.syncStatus === "Synced").length,
    suppressed: records.filter((record) => record.syncStatus === "Suppressed / do not market").length,
  };

  const runSyncSimulation = () => {
    setIsSyncing(true);
    const nextRecords = records.map((record, index) => {
      if (record.syncStatus !== "Ready to sync") return record;
      const shouldFail = (index + record.id.length) % 9 === 0 || Math.random() < 0.08;
      if (shouldFail) {
        return {
          ...record,
          syncStatus: "Failed" as const,
          errorReason: "Simulated HubSpot API/system error.",
          issueOwner: "Marketing Ops / Technical Team",
          correctionAction: "Retry sync after system check",
        };
      }
      return {
        ...record,
        syncStatus: "Synced" as const,
        errorReason: "",
        correctionAction: "No action needed",
        hubspotId: record.recordType === "Contact" ? `HS-C-${Math.floor(100000 + Math.random() * 900000)}` : `HS-L-${Math.floor(100000 + Math.random() * 900000)}`,
      };
    });

    setRecords((current) => upsertSyncRecords(current, nextRecords));
    setContacts((current) =>
      current.map((contact) => {
        const syncRecord = nextRecords.find((record) => record.id === `HS-CONTACT-${contact.contact_record_id}`);
        if (!syncRecord) return contact;
        return {
          ...contact,
          hubspot_sync_status: mapHubSpotSyncStatusToSyncStatus(syncRecord.syncStatus),
          hubspot_contact_id: syncRecord.recordType === "Contact" ? syncRecord.hubspotId : contact.hubspot_contact_id,
          error_message: syncRecord.errorReason || null,
        };
      }),
    );
    setConversations((current) =>
      current.map((conversation) => {
        const syncRecord = nextRecords.find((record) => record.id === `HS-LEAD-${conversation.conversation_id}`);
        if (!syncRecord) return conversation;
        return {
          ...conversation,
          hubspot_sync_status: mapHubSpotSyncStatusToSyncStatus(syncRecord.syncStatus),
          hubspot_lead_id: syncRecord.recordType === "Lead" ? syncRecord.hubspotId : conversation.hubspot_lead_id,
          error_message: syncRecord.errorReason || null,
        };
      }),
    );
    setIsSyncing(false);
    const touchedEvents = new Set(nextRecords.filter((record) => record.syncStatus === "Synced").map((record) => record.eventId));
    touchedEvents.forEach((eventId) => {
      const event = events.find((item) => item.event_id === eventId);
      if (event) updateEvent(event.id, { hubspotStatus: "Synced", approval_status: "HubSpot Sync In Progress", stage: "HubSpot Sync In Progress" });
    });
    setActivityLogs((current) => [
      ...current,
      ...nextRecords
        .filter((record) => record.syncStatus === "Synced" || record.syncStatus === "Failed")
        .map((record) => ({
          log_id: `LOG-${Date.now()}-${record.id}`,
          event_id: record.eventId,
          timestamp: new Date().toISOString(),
          actor: "HubSpot Sync Simulation",
          action: `${record.recordType} ${record.syncStatus}`,
          details: `${record.name} routed to ${record.syncDestination}. ${record.hubspotId ? `Assigned ${record.hubspotId}.` : record.errorReason}`,
        })),
    ]);
    const syncedCount = nextRecords.filter((record) => record.syncStatus === "Synced").length - records.filter((record) => record.syncStatus === "Synced").length;
    const failedCount = nextRecords.filter((record) => record.syncStatus === "Failed").length;
    notify(failedCount ? "info" : "success", "HubSpot simulation complete", `${Math.max(0, syncedCount)} record(s) synced. ${failedCount} record(s) are failed or still need correction.`);
  };

  return (
    <div className="space-y-6">
      <Panel
        title={getRoleFacingLabel(role, "HubSpot Sync")}
        action={
          <div className="flex flex-wrap gap-2">
            <SyncBadge value="Simulation only" />
            <button className="btn-primary" disabled={!syncPermission.allowed || isSyncing} title={syncPermission.reason} onClick={runSyncSimulation}>{isSyncing ? "Syncing..." : isSalesRole(role) ? "Review Lead Handoff" : "Run Sync Simulation"}</button>
          </div>
        }
      >
        {isSyncing && <InlineLoading label={isSalesRole(role) ? "Checking lead handoff records..." : "Running deterministic sync checks and simulated HubSpot responses..."} />}
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3">
          <MiniStat label={isSalesRole(role) ? "Handoff queue" : "Sync queue"} value={number.format(summary.queue)} />
          <MiniStat label={isSalesRole(role) ? "Ready for handoff" : "Ready to sync"} value={number.format(summary.ready)} />
          <MiniStat label="Held for review" value={number.format(summary.held)} />
          <MiniStat label="Failed" value={number.format(summary.failed)} />
          <MiniStat label="Synced" value={number.format(summary.synced)} />
          <MiniStat label="Suppressed / do not market" value={number.format(summary.suppressed)} />
        </div>

        <div className="mt-6 table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Record type</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Error reason</th>
                <th className="px-4 py-3">Issue owner</th>
                <th className="px-4 py-3">Correction action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
            {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-4"><StageBadge value={record.recordType} /></td>
                  <td className="px-4 py-4">
                    <p className="font-semibold">{record.name}</p>
                    {record.hubspotId && <p className="mt-1 text-xs text-slate-500">{record.hubspotId}</p>}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{record.company}</td>
                  <td className="px-4 py-4 text-slate-600">{record.email}</td>
                  <td className="px-4 py-4 text-slate-600">{record.eventName}</td>
                  <td className="px-4 py-4 text-slate-600">{record.syncDestination}</td>
                  <td className="px-4 py-4"><HubSpotStatusBadge status={record.syncStatus} /></td>
                  <td className="px-4 py-4 text-slate-600">{record.errorReason || "None"}</td>
                  <td className="px-4 py-4 text-slate-600">{record.issueOwner}</td>
                  <td className="px-4 py-4 text-slate-600">{record.correctionAction}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td className="px-4 py-8" colSpan={10}>
                    <EmptyState title={isSalesRole(role) ? "No lead handoff records in scope" : "No sync records in scope"} copy={isSalesRole(role) ? "This role does not have lead handoff records visible. Switch role or select a broader event set." : "This role does not have HubSpot-ready or held records visible. Switch role or select a broader event set."} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={isSalesRole(role) ? "Lead handoff setup recommendations" : "HubSpot setup recommendations"}>
        <div className="grid gap-4 lg:grid-cols-3">
          {events.map((event) => {
            const year = new Date(`${event.event_start_date}T12:00:00`).getFullYear();
            const productInterest = getWorkflowData().conversations.find((conversation) => conversation.event_id === event.event_id)?.product_interest ?? "Product Interest";
            return (
              <div key={event.event_id} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-semibold">{event.event_name}</h3>
                <div className="mt-3 space-y-2">
                  <InfoRow label="Campaign" value={`Event - ${event.event_name} - ${year}`} />
                  <InfoRow label="Static List" value={`Event Contacts - ${event.event_name} - ${year}`} />
                  <InfoRow label="Active List" value={`Event Contacts - ${event.region}/${productInterest}/Lifecycle Stage`} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`app-panel rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="section-heading">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function ToastStack({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  const toneStyles: Record<ToastTone, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  };
  return (
    <div className="fixed right-4 top-24 z-50 w-[min(24rem,calc(100vw-2rem))] space-y-3">
      {toasts.map((toast) => (
        <button key={toast.id} onClick={() => dismiss(toast.id)} className={`w-full rounded-lg border p-4 text-left shadow-lg ${toneStyles[toast.tone]}`}>
          <p className="text-sm font-semibold">{toast.title}</p>
          <p className="mt-1 text-sm opacity-80">{toast.message}</p>
        </button>
      ))}
    </div>
  );
}

function DemoLoadingState() {
  return (
    <div className="space-y-6">
      <Panel title="Loading demo workspace" action={<StageBadge value="Preparing mock data" />}>
        <InlineLoading label="Loading leadership dashboard, role visibility, approval queues, and sync records..." />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      </Panel>
    </div>
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
      <span className="size-3 animate-pulse rounded-full bg-sky-500" />
      {label}
    </div>
  );
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return (
    <div className="spatial-empty-state rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto grid size-10 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
        <FileCheck2 className="size-5" />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{copy}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function DemoModeGuide({
  events,
  setView,
  setSelectedId,
  setSelectedDetailTab,
  openFilteredEvents,
  notify,
}: {
  events: EventRecord[];
  setView: (view: AppView) => void;
  setSelectedId: (id: string) => void;
  setSelectedDetailTab: (tab: DetailTab) => void;
  openFilteredEvents: (filter: EventFilter) => void;
  notify: (tone: ToastTone, title: string, message: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const findEvent = (eventId: string) => events.find((event) => event.event_id === eventId) ?? events[0];
  const demoEvents = [
    { label: "Healthy event", eventId: "EVT-2003", badge: "Healthy", copy: "Completed webinar with strong MQL performance and mostly clean sync." },
    { label: "Over-budget event", eventId: "EVT-2006", badge: "Over Budget", copy: "Variance above 10% plus follow-up risk." },
    { label: "Behind-commitment event", eventId: "EVT-2001", badge: "Behind Commitment", copy: "Approved event with pipeline below commitment." },
    { label: "Missing upload event", eventId: "EVT-2004", badge: "Missing Data", copy: "Submitted event without upload or locked commitment data." },
    { label: "Duplicate-heavy event", eventId: "EVT-2007", badge: "Needs Review", copy: "Marketing list refresh with heavy duplicate and consent review." },
    { label: "Marketing-list-only event", eventId: "EVT-2007", badge: "Needs Review", copy: "Audience hygiene event without pipeline goal." },
    { label: "Non-measurable event", eventId: "EVT-2008", badge: "Missing Data", copy: "Internal enablement, intentionally excluded from pipeline attribution." },
    { label: "HubSpot sync issue event", eventId: "EVT-2006", badge: "Sync Issue", copy: "Failed contact and lead sync records for technical review." },
  ];
  const steps = [
    { id: "create", label: "Create event request", view: "event-create" as AppView },
    { id: "cost", label: "Add cost estimate", eventId: "EVT-2002", tab: "Cost Estimate" as DetailTab },
    { id: "objectives", label: "Declare objectives and commitments", eventId: "EVT-2004", tab: "Objectives & Commitments" as DetailTab },
    { id: "submit", label: "Submit for approval", eventId: "EVT-2004", tab: "Approval" as DetailTab },
    { id: "routing", label: "See approval routing", eventId: "EVT-2002", tab: "Approval" as DetailTab },
    { id: "functional", label: "Approve as functional leader", eventId: "EVT-2002", tab: "Approval" as DetailTab },
    { id: "finance", label: "Approve as Finance", eventId: "EVT-2002", tab: "Approval" as DetailTab },
    { id: "lock", label: "Lock commitments at event start", eventId: "EVT-2001", tab: "Objectives & Commitments" as DetailTab },
    { id: "contacts", label: "Upload contacts", eventId: "EVT-2001", tab: "Contact Upload" as DetailTab },
    { id: "conversations", label: "Upload conversations", eventId: "EVT-2006", tab: "Conversation Upload" as DetailTab },
    { id: "skymap", label: "See SkyMap validation", eventId: "EVT-2001", tab: "Contact Upload" as DetailTab },
    { id: "duplicates", label: "Review duplicates", eventId: "EVT-2007", tab: "Duplicate Review" as DetailTab },
    { id: "sync", label: "Run HubSpot sync simulation", eventId: "EVT-2006", tab: "HubSpot Sync" as DetailTab },
    { id: "scorecard", label: "View scorecard", eventId: "EVT-2006", tab: "Scorecard" as DetailTab },
    { id: "reminders", label: "Review overdue reminders", eventId: "EVT-2006", tab: "Reminders" as DetailTab },
    { id: "activity-log", label: "Review activity log", eventId: "EVT-2006", tab: "Activity Log" as DetailTab },
    { id: "dashboard", label: "Review leadership dashboard", view: "dashboard" as View },
  ];
  const completedCount = Object.values(completed).filter(Boolean).length;

  const openStep = (step: (typeof steps)[number]) => {
    setCompleted((current) => ({ ...current, [step.id]: true }));
    if (step.eventId) {
      const event = findEvent(step.eventId);
      setSelectedId(event.id);
      setSelectedDetailTab(step.tab ?? "Overview");
      setView("event-detail");
    } else if (step.view) {
      setView(step.view);
    }
    notify("info", "Demo step opened", step.label);
  };

  return (
    <Panel
      title="Demo Mode Guide"
      action={
        <div className="flex flex-wrap gap-2">
          <RiskBadge value={completedCount === steps.length ? "Healthy" : "Needs Review"} label={`${completedCount}/${steps.length} steps`} />
          <button className="btn-secondary" onClick={() => setExpanded((current) => !current)}>{expanded ? "Collapse guide" : "Open guide"}</button>
        </div>
      }
    >
      {expanded && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${(completedCount / steps.length) * 100}%` }} />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {steps.map((step, index) => (
                <button key={step.id} onClick={() => openStep(step)} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${completed[step.id] ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{completed[step.id] ? "✓" : index + 1}</span>
                  <span className="text-sm font-semibold">{step.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="section-title">Prebuilt demo events</h3>
            <div className="mt-3 space-y-2">
              {demoEvents.map((item) => {
                const event = findEvent(item.eventId);
                return (
                  <button
                    key={`${item.label}-${item.eventId}`}
                    onClick={() => {
                      setSelectedId(event.id);
                      setSelectedDetailTab("Overview");
                      setView("event-detail");
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{event.event_name}. {item.copy}</p>
                    </div>
                    <RiskBadge value={item.badge} />
                  </button>
                );
              })}
            </div>
            <button className="btn-secondary mt-4 w-full justify-center" onClick={() => openFilteredEvents({ key: "all", label: "All demo events" })}>Open all demo events</button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Metric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Home }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon className="size-5 text-slate-400" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function MetricButton({
  title,
  value,
  detail,
  badge,
  icon: Icon,
  onClick,
}: {
  title: string;
  value: string;
  detail: string;
  badge?: string;
  icon: typeof Home;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon className="size-5 shrink-0 text-slate-400" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">{detail}</p>
        {badge && <RiskBadge value={badge} />}
      </div>
    </button>
  );
}

function WorkflowStep({ title, copy, complete }: { title: string; copy: string; complete?: boolean }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
        <CheckCircle2 className="size-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{copy}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400" placeholder={placeholder} />
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  required,
  placeholder,
  error,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label} {required && <span className="text-rose-600">*</span>}
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${error ? "border-rose-300" : "border-slate-200"}`}
        placeholder={placeholder}
      />
      {error && <p className="mt-2 text-xs font-medium text-rose-600">Error: {error}</p>}
    </label>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  required,
  placeholder,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label} {required && <span className="text-rose-600">*</span>}
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 min-h-28 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${error ? "border-rose-300" : "border-slate-200"}`}
        placeholder={placeholder}
      />
      {error && <p className="mt-2 text-xs font-medium text-rose-600">Error: {error}</p>}
    </label>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
  required,
  error,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label} {required && <span className="text-rose-600">*</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${error ? "border-rose-300" : "border-slate-200"}`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || "Select..."}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-xs font-medium text-rose-600">Error: {error}</p>}
    </label>
  );
}

function SavedViewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white">
      {label}
    </button>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="filter-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function ApprovalRow({ label, approved }: { label: string; approved: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <span className="text-sm font-medium">{label}</span>
      <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
        {approved ? "Approved" : "Pending"}
      </span>
    </div>
  );
}

function ApprovalDecisionBadge({ decision }: { decision?: ApprovalDecision }) {
  if (decision === "Approved") return <RiskBadge value="Healthy" label="Approved" />;
  if (decision === "Rejected") return <RiskBadge value="Over Budget" label="Rejected" />;
  if (decision === "Needs Revision") return <RiskBadge value="Needs Review" label="Needs Revision" />;
  return <RiskBadge value="Missing Data" label="Pending" />;
}

function ReminderStatusBadge({ reminder }: { reminder: Reminder }) {
  const dueState = getReminderDueState(reminder);
  if (reminder.status === "Completed") return <RiskBadge value="Healthy" label="Done" />;
  if (reminder.status === "Escalated") return <RiskBadge value="Behind Commitment" label="Escalated" />;
  if (dueState === "Overdue") return <RiskBadge value="Behind Commitment" label="Overdue" />;
  return <RiskBadge value="Needs Review" label={reminder.status} />;
}

function OverdueReminderBadge({ event, reminders }: { event: EventRecord; reminders: Reminder[] }) {
  const count = reminders.filter((reminder) => reminder.event_id === event.event_id && reminder.status !== "Completed" && getReminderDueState(reminder) === "Overdue").length;
  if (count === 0 && event.overdue_items.length === 0) return <span className="text-slate-400">None</span>;
  if (count === 0) return null;
  return <RiskBadge value="Behind Commitment" label={`${count} overdue reminder${count === 1 ? "" : "s"}`} />;
}

function SettingRow({ title, copy, enabled }: { title: string; copy: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{copy}</p>
      </div>
      <div className={`h-6 w-11 rounded-full p-1 ${enabled ? "bg-slate-950" : "bg-slate-200"}`}>
        <div className={`size-4 rounded-full bg-white transition ${enabled ? "translate-x-5" : ""}`} />
      </div>
    </div>
  );
}

function SystemRow({ name, role, copy }: { name: string; role: string; copy: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{name}</h3>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{role}</span>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{copy}</p>
    </div>
  );
}

function ConfigRow({ title, meta, detail }: { title: string; meta: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <StageBadge value={meta} />
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function TagGrid({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => <StageBadge key={item} value={item} />)}
    </div>
  );
}

type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

function SemanticBadge({ tone, label, large = false, secondary = false }: { tone: StatusTone; label: string; large?: boolean; secondary?: boolean }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? CircleAlert : tone === "error" ? CircleX : tone === "info" ? Info : FileCheck2;
  return (
    <span className={`status-badge status-${tone} ${large ? "status-badge-large" : ""} ${secondary ? "status-badge-secondary" : ""}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function getRiskTone(value: string): StatusTone {
  if (/healthy|ready|synced|uploaded|met|exceeded|complete|approved|done|on track/i.test(value)) return "success";
  if (/over budget|blocked|failed|rejected|conflict|suppressed/i.test(value)) return "error";
  if (/sync|ops|waiting|not due|simulation|technical|info/i.test(value)) return "info";
  if (/missing|behind|overdue|needs|risk|held|pending|review|close|editable|locked/i.test(value)) return "warning";
  return "neutral";
}

function StatusBadge({ value }: { value: EventStatus }) {
  const tone: Record<EventStatus, StatusTone> = {
    "On Track": "success",
    "At Risk": "warning",
    Blocked: "error",
    Complete: "success",
  };
  return <SemanticBadge tone={tone[value]} label={value} />;
}

function RiskBadge({ value, label }: { value: string; label?: string }) {
  return <SemanticBadge tone={getRiskTone(value)} label={label ?? value} secondary />;
}

function PrimaryStatusBadge({ status, large = false }: { status: PrimaryEventStatus; large?: boolean }) {
  const tone: Record<PrimaryEventStatus, StatusTone> = {
    Ready: "success",
    "Needs your action": "warning",
    "Waiting on approval": "info",
    "Waiting on Ops": "info",
    Overdue: "error",
    "Over budget": "error",
    "Behind commitment": "warning",
    "Missing data": "warning",
  };

  return <SemanticBadge tone={tone[status]} label={status} large={large} />;
}

function CommitmentBadge({ value }: { value: string }) {
  if (value === "Behind Commitment") return <RiskBadge value="Behind Commitment" />;
  if (value === "Not Measurable" || value === "No Objective") return <RiskBadge value="Missing Data" label={value} />;
  if (value === "Missed") return <RiskBadge value="Over Budget" label="Missed" />;
  return <RiskBadge value="Healthy" label={value} />;
}

function ScorecardStatusBadge({ status }: { status: ScorecardStatus | string }) {
  const tone: Record<string, string> = {
    Exceeded: "Healthy",
    Met: "Healthy",
    Close: "Needs Review",
    Behind: "Behind Commitment",
    "Missing Data": "Missing Data",
    "Over Budget": "Over Budget",
    "Needs Explanation": "Needs Review",
  };
  return <RiskBadge value={tone[status] ?? "Needs Review"} label={status} />;
}

function ContactStatusBadge({ status }: { status: ContactUploadStatus }) {
  const tone: Record<ContactUploadStatus, string> = {
    "New contact": "Healthy",
    "Existing contact found": "Needs Review",
    "Possible duplicate": "Needs Review",
    "Existing company found": "Healthy",
    "New company will be created": "Healthy",
    "Missing required fields": "Missing Data",
    Conflict: "Over Budget",
    Synced: "Healthy",
    Failed: "Sync Issue",
  };
  return <RiskBadge value={tone[status]} label={status} />;
}

function HubSpotStatusBadge({ status }: { status: HubSpotSyncStatus }) {
  const tone: Record<HubSpotSyncStatus, string> = {
    "Not Ready": "Missing Data",
    "Ready to sync": "Healthy",
    "Held for review": "Needs Review",
    Failed: "Sync Issue",
    Synced: "Healthy",
    "Suppressed / do not market": "Over Budget",
    "DTEN.me / SkyMap only": "Missing Data",
  };
  return <RiskBadge value={tone[status]} label={status} />;
}

function SkyMapResultBadge({ result }: { result: SkyMapProcessingResult }) {
  const tone = result.confidence === "High" ? "Healthy" : result.confidence === "Conflict" ? "Over Budget" : "Needs Review";
  return <RiskBadge value={tone} label={`${result.confidence}: ${result.eligibility}`} />;
}

function ConversationStatusBadge({ status, label }: { status: ConversationUploadStatus; label?: string }) {
  const tone: Record<ConversationUploadStatus, string> = {
    "Ready for HubSpot Lead sync": "Healthy",
    "Hold and complete missing fields": "Missing Data",
    "Conversation intelligence only": "Needs Review",
    "Duplicate contact review": "Needs Review",
  };
  return <RiskBadge value={tone[status]} label={label ?? status} />;
}

function InlineEdit({ value, onChange, disabled, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 w-full min-w-36 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-slate-600"
    />
  );
}

function InlineSelect({ value, onChange, disabled, options }: { value: string; onChange: (value: string) => void; disabled?: boolean; options: readonly string[] }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full min-w-40 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-slate-600"
    >
      <option value="">Select...</option>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}

function StageBadge({ value }: { value: EventStage | string }) {
  return <SemanticBadge tone="neutral" label={value} secondary />;
}

function SyncBadge({ value }: { value: string }) {
  return <SemanticBadge tone={getRiskTone(value)} label={value} secondary />;
}

function EventListStatusBadge({ status, label, detail }: { status: string; label: string; detail?: string }) {
  const tone: Record<string, string> = {
    Ready: "Healthy",
    Uploaded: "Healthy",
    Synced: "Healthy",
    Missing: "Missing Data",
    Held: "Needs Review",
    Failed: "Sync Issue",
    "Not due": "Needs Review",
    "No records": "Missing Data",
  };
  return (
    <div className="min-w-36 space-y-1">
      <RiskBadge value={tone[status] ?? "Needs Review"} label={label} />
      {detail && <p className="text-xs leading-5 text-slate-500">{detail}</p>}
    </div>
  );
}

function uploadedContactLineToEventContact(line: UploadedContactLine, event: EventRecord, batchId: string, index: number): EventContact {
  return {
    contact_record_id: `CON-UP-${batchId}-${index + 1}`,
    event_id: event.event_id,
    first_name: line.firstName,
    last_name: line.lastName,
    email: line.email,
    company: line.company,
    title: line.title,
    phone: line.phone,
    country: line.country,
    region: event.region,
    capture_method: normalizeCaptureMethod(line.captureMethod),
    consent_status: normalizeConsentStatus(line.consentStatus),
    upload_batch_id: batchId,
    skymap_match_status: mapContactUploadStatusToMatchStatus(line.status),
    hubspot_sync_status: mapContactUploadStatusToSyncStatus(line.status, line.consentStatus),
    hubspot_contact_id: null,
    error_message: shouldHoldContactUpload(line.status, line.consentStatus) ? line.reason : null,
  };
}

function createDuplicateGroupFromContactLine(line: UploadedContactLine, event: EventRecord, batchId: string, index: number): DuplicateGroup | null {
  if (!["Existing contact found", "Possible duplicate", "Conflict", "Missing required fields"].includes(line.status)) return null;
  return {
    id: `DUP-${batchId}-${index + 1}`,
    eventId: event.event_id,
    primary: line.email || `${line.firstName} ${line.lastName}`.trim() || line.company,
    matched: line.skyMapResult.companyMatch || "Manual review",
    confidence: line.skyMapResult.confidence === "High" ? 94 : line.skyMapResult.confidence === "Medium" ? 78 : line.skyMapResult.confidence === "Conflict" ? 99 : 58,
    reason: line.reason,
    action: "Review",
  };
}

function uploadedConversationLineToEventConversation(line: UploadedConversationLine, event: EventRecord, index: number): EventConversation {
  return {
    conversation_id: `CONV-UP-${event.event_id}-${Date.now()}-${index + 1}`,
    event_id: event.event_id,
    contact_email: line.contactEmail,
    contact_name: line.contactName,
    company: line.company,
    title: line.title,
    conversation_owner: line.conversationOwner,
    conversation_summary: line.conversationSummary,
    product_interest: normalizeProductInterest(line.productInterest),
    is_sales_lead: line.isSalesLead === "Yes",
    lead_quality: normalizeConversationLeadQuality(line.leadQuality),
    buying_timeline: normalizeBuyingTimeline(line.buyingTimeline),
    estimated_opportunity_size: Number(line.estimatedOpportunitySize || 0) || null,
    next_step: line.nextStep,
    follow_up_owner: line.followUpOwner,
    follow_up_date: line.followUpDate || null,
    hubspot_sync_status: mapConversationUploadStatusToSyncStatus(line.status),
    hubspot_lead_id: null,
    error_message: line.status === "Ready for HubSpot Lead sync" || line.status === "Conversation intelligence only" ? null : line.reason,
  };
}

function normalizeCaptureMethod(value: string): EventContact["capture_method"] {
  const allowed: EventContact["capture_method"][] = ["Badge Scan", "Manual Entry", "CSV Upload", "Webinar Registration", "Sales Nomination", "Partner List"];
  return allowed.find((item) => item.toLowerCase() === value.trim().toLowerCase()) ?? "CSV Upload";
}

function normalizeConsentStatus(value: string): ConsentStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("declin") || normalized.includes("opt") || normalized.includes("unsubscribe")) return "Opted Out / Unsubscribed";
  if (normalized.includes("pending") || normalized.includes("unknown")) return "Consent Unknown";
  if (normalized.includes("legitimate")) return "Legitimate Interest";
  if (normalized.includes("not required")) return "Not Required";
  return "Consented";
}

function normalizeProductInterest(value: string): ProductInterest {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("dual")) return "D7X Dual";
  if (normalized.includes("d7x") || normalized === "d7") return "D7X";
  if (normalized.includes("vue")) return "DTEN Vue Pro";
  if (normalized.includes("mate")) return "DTEN Mate";
  if (normalized.includes("orbit")) return "Orbit";
  if (normalized.includes("byod") || normalized.includes("bar")) return "DTEN Bar / BYOD";
  if (normalized.includes("classroom") || normalized.includes("ai board")) return "AI Board";
  if (normalized.includes("service") || normalized.includes("warranty")) return "Services / Warranty";
  return "Other";
}

function normalizeConversationLeadQuality(value: string): LeadQuality {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "hot") return "High";
  if (normalized === "medium" || normalized === "warm") return "Medium";
  if (normalized === "low" || normalized === "nurture" || normalized.includes("marketing") || normalized.includes("disqual")) return "Low";
  return "Medium";
}

function normalizeBuyingTimeline(value: string): EventConversation["buying_timeline"] {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("0-3")) return "0-3 months";
  if (normalized.includes("3-6")) return "3-6 months";
  if (normalized.includes("6-12")) return "6-12 months";
  if (normalized.includes("12+")) return "12+ months";
  return "No active project";
}

function mapContactUploadStatusToMatchStatus(status: ContactUploadStatus): MatchStatus {
  if (status === "Existing contact found") return "Duplicate";
  if (status === "Possible duplicate") return "Possible Duplicate";
  if (status === "Conflict") return "Conflict";
  if (status === "Failed") return "Manual Review";
  if (status === "Existing company found") return "Matched";
  if (status === "New company will be created" || status === "New contact") return "No Match";
  return "Not Checked";
}

function mapContactUploadStatusToSyncStatus(status: ContactUploadStatus, consentStatus: string): SyncStatus {
  if (status === "Failed") return "Failed";
  if (normalizeConsentStatus(consentStatus) === "Opted Out / Unsubscribed") return "Suppressed / do not market";
  if (["Existing contact found", "Possible duplicate", "Conflict", "Missing required fields"].includes(status)) return "Held for review";
  if (status === "Synced") return "Synced";
  return "Ready to sync";
}

function mapConversationUploadStatusToSyncStatus(status: ConversationUploadStatus): SyncStatus {
  if (status === "Ready for HubSpot Lead sync") return "Ready to sync";
  if (status === "Conversation intelligence only") return "DTEN.me / SkyMap only";
  return "Held for review";
}

function shouldHoldContactUpload(status: ContactUploadStatus, consentStatus: string) {
  return mapContactUploadStatusToSyncStatus(status, consentStatus) === "Held for review" || status === "Failed";
}

function getDashboardSummary(events: EventRecord[]) {
  const data = getWorkflowData();
  const visibleEventIds = new Set(events.map((event) => event.event_id));
  const contactUploadTypes = ["Registration", "Attendance", "Marketing List", "Sales Nomination"];
  const contactUploads = data.uploads.filter((upload) => visibleEventIds.has(upload.event_id) && contactUploadTypes.includes(upload.upload_type));
  const visibleContacts = data.contacts.filter((contact) => visibleEventIds.has(contact.event_id));
  const visibleConversations = data.conversations.filter((conversation) => visibleEventIds.has(conversation.event_id));
  const visibleSyncRecords = data.syncRecords.filter((record) => visibleEventIds.has(record.eventId));

  return {
    totalApprovedEvents: events.filter((event) => approvedStatuses.includes(event.approval_status)).length,
    estimatedSpend: events.reduce((sum, event) => sum + event.estimated_cost_total, 0),
    actualSpend: events.reduce((sum, event) => sum + event.actual_cost_total, 0),
    eventsOverBudget: events.filter((event) => event.actual_cost_total > event.estimated_cost_total).length,
    contactsUploaded: contactUploads.reduce((sum, upload) => sum + upload.total_records, 0),
    prospectsSynced: visibleSyncRecords.filter((record) => record.recordType === "Contact" && record.syncStatus === "Synced").length,
    conversationsUploaded: visibleConversations.length,
    leadsSynced: visibleSyncRecords.filter((record) => record.recordType === "Lead" && record.syncStatus === "Synced").length,
    duplicateContactsHeld: visibleContacts.filter(
      (contact) =>
        (contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate") &&
        contact.hubspot_sync_status === "Held for review",
    ).length,
    missingAttendeeList: getFilteredEvents(events, "missing-attendee-list").length,
    missingCostReconciliation: getFilteredEvents(events, "missing-cost-reconciliation").length,
    nonMeasurableEvents: getFilteredEvents(events, "non-measurable").length,
    marketingListOnlyEvents: getFilteredEvents(events, "marketing-list-only").length,
    failedSyncEvents: getFilteredEvents(events, "failed-sync").length,
  };
}

function createActivityLog(eventId: string, actor: string, action: string, details: string, relatedObject?: string, overrideAudit?: ActivityLog["override_audit"]): ActivityLog {
  return {
    log_id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event_id: eventId,
    timestamp: new Date().toISOString(),
    actor,
    action,
    details,
    related_object: relatedObject,
    override_audit: overrideAudit,
  };
}

function appendActivityLogs(setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>, entries: ActivityLog[]) {
  setActivityLogs((current) => [...current, ...entries]);
}

function upsertEventRecord(events: EventRecord[], event: EventRecord) {
  return events.some((item) => item.event_id === event.event_id)
    ? events.map((item) => (item.event_id === event.event_id ? event : item))
    : [...events, event];
}

function replaceEventRows<T extends { event_id: string }>(rows: T[], eventId: string, nextRows: T[]) {
  return [...rows.filter((row) => row.event_id !== eventId), ...nextRows];
}

function mergeEventReminders(reminders: Reminder[], eventId: string, nextReminders: Reminder[]) {
  return [
    ...reminders.filter((reminder) => !(reminder.event_id === eventId && reminder.reminder_id.startsWith(`AUTO-${eventId}-`))),
    ...nextReminders,
  ].sort((a, b) => a.due_date.localeCompare(b.due_date));
}

function buildCreateEventPersistResult(form: CreateEventForm, approvalStatus: "Draft" | "Submitted", role: Role, existingEventId?: string): CreateEventPersistResult {
  const eventId = existingEventId ?? `EVT-${Date.now()}`;
  const startDate = form.startDate || addDays(currentDate.toISOString().slice(0, 10), 30);
  const endDate = form.endDate || startDate;
  const eventName = form.eventName.trim() || "Untitled event request";
  const region = (form.region || simulatedUserProfile.region) as Region;
  const eventType = (form.eventType || "Field Event") as EventRecord["event_type"];
  const objectiveSummary = getMeasurableObjectiveSummary(form);
  const eventTier = (form.eventTier || (objectiveSummary.allQuestionsAnswered && objectiveSummary.measurableYesCount === 0 ? "Non-Measurable" : "Tier 3")) as EventRecord["event_tier"];
  const eventOwner = role === "Event Owner" ? simulatedUserProfile.eventOwner : form.eventOwner.trim() || `${role} Intake`;
  const functionalOwner = form.functionalOwner || "Unassigned functional owner";
  const costLines = buildCreateEventCostLines(form, eventId);
  const objectives = buildCreateEventObjectives(form, eventId);
  const estimatedCost = costLines.reduce((sum, line) => sum + line.estimated_amount, 0);
  const actualCost = costLines.reduce((sum, line) => sum + line.actual_amount, 0);
  const varianceAmount = actualCost - estimatedCost;
  const variancePercentage = estimatedCost > 0 ? (varianceAmount / estimatedCost) * 100 : 0;
  const riskFlags = buildCreateEventRiskFlags(form, approvalStatus, estimatedCost, variancePercentage);
  const overdueItems = approvalStatus === "Draft" ? ["Draft not submitted for approval"] : ["Approval routing pending"];
  const status: EventStatus = approvalStatus === "Draft" || riskFlags.length > 0 ? "At Risk" : "On Track";

  const event: EventRecord = {
    event_id: eventId,
    event_name: eventName,
    event_start_date: startDate,
    event_end_date: endDate,
    location: form.location.trim() || "TBD",
    region,
    event_type: eventType,
    event_tier: eventTier,
    event_owner: eventOwner,
    functional_owner: functionalOwner,
    funding_source: form.fundingSource.trim() || "Unassigned funding source",
    approval_status: approvalStatus,
    objective_lock_status: isObjectiveLocked(startDate) ? "Locked" : "Unlocked",
    estimated_cost_total: estimatedCost,
    actual_cost_total: actualCost,
    variance_amount: varianceAmount,
    variance_percentage: variancePercentage,
    variance_explanation: form.varianceExplanation.trim(),
    created_by: role,
    created_date: currentDate.toISOString().slice(0, 10),
    approved_by_functional_leader: null,
    approved_by_department_head: null,
    approved_by_finance: null,
    approved_date: null,
    risk_flags: riskFlags,
    overdue_items: overdueItems,
    id: eventId,
    name: eventName,
    type: eventType,
    city: form.location.trim() || "TBD",
    owner: eventOwner,
    stage: approvalStatus,
    status,
    date: startDate,
    budget: estimatedCost,
    forecastPipeline: 0,
    actualPipeline: 0,
    registrations: Number(form.objectiveCommitments.targetContactCount || 0) || 0,
    attendees: 0,
    leads: 0,
    mqls: 0,
    duplicates: 0,
    hubspotStatus: "Not Ready",
    skymapRoute: `${region} ${functionalOwner} > Intake`,
    approval: { marketing: false, finance: false, sales: false },
    checklist: buildCreateEventChecklist(form, approvalStatus),
    notes: [form.reasonToBelieve, form.postEventPlan, form.eventTier === "Other" ? form.eventTierExplanation : ""].filter(Boolean).join(" "),
  };

  return { event, costLines, objectives };
}

function buildCreateEventCostLines(form: CreateEventForm, eventId: string): EventCostLine[] {
  return form.costLines.map((line, index) => ({
    cost_line_id: `COST-${eventId}-${index + 1}`,
    event_id: eventId,
    cost_category: line.costCategory as EventCostLine["cost_category"],
    estimated_amount: line.estimatedAmount,
    actual_amount: Number(line.actualAmount || 0) || 0,
    vendor: line.vendor,
    notes: line.notes,
  }));
}

function buildCreateEventObjectives(form: CreateEventForm, eventId: string): EventObjective[] {
  const objectives: EventObjective[] = [];
  const pushObjective = (objectiveId: string, objectiveType: EventObjective["objective_type"], expected: "" | "Yes" | "No", commitmentValue: string, actualValue: string, notes: string) => {
    if (!expected) return;
    const objective: EventObjective = {
      objective_id: objectiveId,
      event_id: eventId,
      objective_type: objectiveType,
      expected_yes_no: expected === "Yes",
      commitment_value: expected === "Yes" ? Number(commitmentValue || 0) : null,
      actual_value: actualValue.trim() ? Number(actualValue || 0) : null,
      status: "Not Started",
      notes,
      override_request_status: "None",
    };
    objectives.push({ ...objective, status: getDerivedObjectiveStatus(objective) });
  };

  pushObjective(
    `OBJ-${eventId}-MARKETING`,
    "Marketing List Growth",
    form.measurableObjectives.marketingListGrowth,
    form.objectiveCommitments.targetContactCount,
    form.objectiveActuals.targetContactCount,
    form.objectiveNotes.marketingListGrowth || form.reasonToBelieve || "Original marketing contact commitment declared during intake.",
  );
  pushObjective(
    `OBJ-${eventId}-SALES`,
    "MQLs",
    form.measurableObjectives.salesLeadGeneration,
    form.objectiveCommitments.targetQualifiedLeadCount,
    form.objectiveActuals.targetQualifiedLeadCount,
    form.objectiveNotes.salesLeadGeneration || form.reasonToBelieve || "Original qualified lead commitment declared during intake.",
  );
  pushObjective(
    `OBJ-${eventId}-PARTNER-CONVERSATIONS`,
    "Partner Influence",
    form.measurableObjectives.channelExpansion,
    form.objectiveCommitments.targetQualifiedPartnerConversations,
    form.objectiveActuals.targetQualifiedPartnerConversations,
    form.objectiveNotes.channelExpansion || form.reasonToBelieve || "Original partner conversation commitment declared during intake.",
  );
  if (form.measurableObjectives.channelExpansion === "Yes") {
    pushObjective(
      `OBJ-${eventId}-PARTNER-AGREEMENTS`,
      "Partner Influence",
      "Yes",
      form.objectiveCommitments.partnerAgreementsInitiated,
      form.objectiveActuals.partnerAgreementsInitiated,
      "Partner agreements initiated commitment. " + (form.objectiveNotes.channelExpansion || form.reasonToBelieve || ""),
    );
  }

  return objectives;
}

function buildCreateEventRiskFlags(form: CreateEventForm, approvalStatus: "Draft" | "Submitted", estimatedCost: number, variancePercentage: number) {
  const summary = getMeasurableObjectiveSummary(form);
  const flags: string[] = [];
  if (approvalStatus === "Draft") flags.push("Draft intake");
  if (!summary.allQuestionsAnswered) flags.push("Objective commitments incomplete");
  if (summary.allQuestionsAnswered && summary.measurableYesCount === 0) flags.push("Non-Measurable Event");
  if (summary.isMarketingListOnly) flags.push("Marketing-List-Only Event");
  if (estimatedCost > 5000) flags.push("Department Head approval required");
  if (estimatedCost > 15000) flags.push("CFO approval and CEO visibility required");
  if (form.eventTier === "Tier 1 Strategic") flags.push("Leadership approval required");
  if (variancePercentage > 10 && !form.varianceExplanation.trim()) flags.push("Needs variance explanation");
  return flags;
}

function buildCreateEventChecklist(form: CreateEventForm, approvalStatus: "Draft" | "Submitted") {
  const checklist = [
    form.costLines.length > 0 ? "Cost estimate uploaded" : "Upload cost estimate CSV",
    getMeasurableObjectiveSummary(form).allQuestionsAnswered ? "Objectives declared" : "Declare objectives and commitments",
    form.leadCaptureMethod ? "Lead capture plan added" : "Add lead capture plan",
  ];
  checklist.push(approvalStatus === "Submitted" ? "Approval routing generated" : "Save or submit approval packet");
  return checklist;
}

function getCommitmentStatusFromObjectives(objectives: EventObjective[]) {
  if (objectives.length === 0) return "No Objective";
  if (objectives.every((objective) => objective.status === "Not Measurable")) return "Not Measurable";
  if (objectives.some((objective) => objective.status === "Behind Commitment")) return "Behind Commitment";
  if (objectives.some((objective) => objective.status === "Exceeded")) return "Exceeded";
  if (objectives.some((objective) => objective.status === "Met")) return "Met";
  if (objectives.some((objective) => objective.status === "On Track")) return "On Track";
  return objectives[0].status;
}

function getActivityLogEntries(event: EventRecord, activityLogs: ActivityLog[]) {
  const existing = activityLogs.filter((log) => log.event_id === event.event_id);
  return [...getSyntheticActivityLogs(event), ...existing].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function getSyntheticActivityLogs(event: EventRecord): ActivityLog[] {
  const logs: ActivityLog[] = [
    {
      log_id: `SYN-${event.event_id}-created`,
      event_id: event.event_id,
      timestamp: `${event.created_date}T15:00:00Z`,
      actor: event.created_by,
      action: "Event created",
      details: `${event.event_name} was created in DTEN.me.`,
      related_object: event.event_id,
    },
    {
      log_id: `SYN-${event.event_id}-draft`,
      event_id: event.event_id,
      timestamp: `${event.created_date}T15:08:00Z`,
      actor: event.created_by,
      action: "Draft saved",
      details: "Initial event intake draft saved.",
      related_object: "Create Event",
    },
  ];

  if (event.approval_status !== "Draft") {
    logs.push({
      log_id: `SYN-${event.event_id}-submitted`,
      event_id: event.event_id,
      timestamp: `${addDays(event.created_date, 1)}T16:00:00Z`,
      actor: event.created_by,
      action: "Event submitted for approval",
      details: "Event request submitted with objectives, estimated cost, and approval routing preview.",
      related_object: "Approval Workflow",
    });
  }
  if (event.approved_date) {
    logs.push({
      log_id: `SYN-${event.event_id}-approved`,
      event_id: event.event_id,
      timestamp: `${event.approved_date}T18:00:00Z`,
      actor: event.approved_by_finance ?? "Finance",
      action: "Approval action",
      details: "Required approval packet completed.",
      related_object: "Approval Workflow",
    });
  }
  if (new Date(`${event.event_start_date}T00:00:00`) <= currentDate) {
    logs.push({
      log_id: `SYN-${event.event_id}-lock`,
      event_id: event.event_id,
      timestamp: `${event.event_start_date}T08:00:00Z`,
      actor: "DTEN.me Workflow",
      action: "Commitment lock",
      details: "Original objective commitments locked automatically at event start date.",
      related_object: "Objectives & Commitments",
    });
  }
  if (event.variance_percentage > 10) {
    logs.push(
      {
        log_id: `SYN-${event.event_id}-override-request`,
        event_id: event.event_id,
        timestamp: `${addDays(event.event_end_date, 2)}T17:00:00Z`,
        actor: event.event_owner,
        action: "Commitment override request",
        details: "Owner requested commitment context update after variance and follow-up review.",
        related_object: "Objectives & Commitments",
        override_audit: {
          changed_by: event.event_owner,
          change_timestamp: `${addDays(event.event_end_date, 2)}T17:00:00Z`,
          previous_value: "Original scorecard commitment",
          new_value: "Requested adjusted commitment context",
          reason: event.variance_explanation || "Variance and event execution conditions changed.",
          approver: event.functional_owner,
        },
      },
      {
        log_id: `SYN-${event.event_id}-cost-reconciliation`,
        event_id: event.event_id,
        timestamp: `${addDays(event.event_end_date, 30)}T17:00:00Z`,
        actor: "Finance",
        action: "Cost reconciliation",
        details: `Actual cost ${money.format(event.actual_cost_total)} reconciled against estimate ${money.format(event.estimated_cost_total)}.`,
        related_object: "Cost Estimate",
      },
    );
  }
  logs.push({
    log_id: `SYN-${event.event_id}-scorecard`,
    event_id: event.event_id,
    timestamp: `${addDays(event.event_end_date, 30)}T19:00:00Z`,
    actor: "Scorecard Workflow",
    action: "Scorecard checkpoint update",
    details: "T+30 checkpoint generated for pipeline, cost, sync, duplicate, and follow-up review.",
    related_object: "Scorecard",
  });

  return logs;
}

function createReminderQueue(events: EventRecord[], seedReminders: Reminder[]) {
  const generated = events.flatMap((event) => getDefaultRemindersForEvent(event));
  const merged = new Map<string, Reminder>();
  [...seedReminders, ...generated].forEach((reminder) => {
    const status = reminder.status === "Completed" ? "Completed" : getReminderDueState(reminder) === "Overdue" ? "Overdue" : reminder.status;
    merged.set(reminder.reminder_id, { ...reminder, status });
  });
  return Array.from(merged.values()).sort((a, b) => a.due_date.localeCompare(b.due_date));
}

function getDefaultRemindersForEvent(event: EventRecord): Reminder[] {
  const data = getWorkflowData();
  const eventEnd = event.event_end_date;
  const afterEventFriday = nextWednesdayOrFriday(eventEnd);
  const base: Reminder[] = [
    makeReminder(event, "submitted", event.functional_owner || "Functional leader", "Approval", event.created_date, "Review objective commitments", event.approved_by_department_head ?? "Department Head"),
    makeReminder(event, "finance-review", "Finance", "Approval", event.approved_date ?? addDays(event.created_date, 3), "Review funding approval", event.approved_by_department_head ?? "Department Head"),
    makeReminder(event, "upload-day-1", event.event_owner, "Contact Upload", addDays(eventEnd, 1), "Upload contact list and conversation list", event.functional_owner),
    makeReminder(event, "upload-day-7", `${event.event_owner} + Regional Leader`, "Conversation Upload", addDays(eventEnd, 7), "Contact/conversation list overdue", event.functional_owner),
    makeReminder(event, "lead-status-wed-fri", "Event attendees", "Lead Status Update", afterEventFriday, "Update lead status", "Regional Leader"),
    makeReminder(event, "t30-cost", "Finance / Event Owner", "Cost Reconciliation", addDays(eventEnd, 30), "Reconcile actual cost", "Finance"),
  ];

  if (event.variance_percentage > 10) base.push(makeReminder(event, "variance-explanation", "Event Owner / Finance", "Budget Variance", currentDate.toISOString().slice(0, 10), "Add variance explanation", "Finance"));
  if (buildHubSpotSyncQueue([event], data.contacts, data.conversations).some((record) => record.syncStatus === "Held for review")) base.push(makeReminder(event, "missing-hubspot-fields", "Event Owner / Marketing Ops", "Missing HubSpot Fields", currentDate.toISOString().slice(0, 10), "Complete missing data", "Marketing Ops"));
  if (data.duplicates.some((duplicate) => duplicate.eventId === event.event_id && duplicate.action === "Review")) base.push(makeReminder(event, "duplicate-records", "Marketing Ops", "Duplicate Review", currentDate.toISOString().slice(0, 10), "Review duplicate queue", "Marketing Ops Lead"));
  if (buildHubSpotSyncQueue([event], data.contacts, data.conversations).some((record) => record.syncStatus === "Failed")) base.push(makeReminder(event, "failed-sync", "Marketing Ops / Technical Team", "HubSpot Sync", currentDate.toISOString().slice(0, 10), "Resolve sync failure", "Technical Team"));
  if (data.conversations.some((conversation) => conversation.event_id === event.event_id && conversation.follow_up_date && new Date(`${conversation.follow_up_date}T12:00:00`) < currentDate && conversation.hubspot_sync_status !== "Synced")) {
    base.push(makeReminder(event, "lead-follow-up", "Rep + Regional Leader", "Sales Follow-Up", currentDate.toISOString().slice(0, 10), "Follow up on event lead", "Regional Leader"));
  }

  return base;
}

function makeReminder(event: EventRecord, suffix: string, owner: string, type: Reminder["reminder_type"], dueDate: string, reminderText: string, escalationOwner: string): Reminder {
  return {
    reminder_id: `AUTO-${event.event_id}-${suffix}`,
    event_id: event.event_id,
    owner,
    reminder_type: type,
    due_date: dueDate,
    status: "Open",
    escalation_owner: `${escalationOwner} · ${reminderText}`,
  };
}

function getReminderSummary(reminders: Reminder[]) {
  return {
    open: reminders.filter((reminder) => reminder.status === "Open").length,
    overdue: reminders.filter((reminder) => reminder.status !== "Completed" && getReminderDueState(reminder) === "Overdue").length,
    escalated: reminders.filter((reminder) => reminder.status === "Escalated").length,
    completed: reminders.filter((reminder) => reminder.status === "Completed").length,
  };
}

function buildDuplicateReviewRecords(events: EventRecord[], duplicates: DuplicateGroup[]): DuplicateReviewRecord[] {
  const data = getWorkflowData();
  const skyMapContacts = data.contacts.map((contact) => ({
    firstName: contact.first_name,
    lastName: contact.last_name,
    email: contact.email,
    company: contact.company,
    companyDomain: extractDomainFromEmail(contact.email),
  }));
  const skyMapCompanies = Array.from(new Map(data.contacts.map((contact) => [normalizeKey(contact.company), contact])).values()).map((contact) => ({
    companyName: contact.company,
    companyDomain: extractDomainFromEmail(contact.email),
    strategic: /university|health|urbanbuild/i.test(contact.company),
  }));

  const duplicateRecords = duplicates.map<DuplicateReviewRecord>((duplicate) => {
    const event = events.find((item) => item.event_id === duplicate.eventId);
    const uploadedContact = data.contacts.find((contact) => normalizeEmail(contact.email) === normalizeEmail(duplicate.primary));
    const possibleExisting = data.contacts.find((contact) => normalizeEmail(contact.email) === normalizeEmail(duplicate.matched));
    return {
      id: duplicate.id,
      eventId: duplicate.eventId,
      eventName: event?.event_name ?? duplicate.eventId,
      uploadBatchId: uploadedContact?.upload_batch_id ?? "Manual review",
      owner: event?.event_owner ?? "Marketing Ops",
      uploadedContact: uploadedContact ? `${uploadedContact.first_name} ${uploadedContact.last_name}` : duplicate.primary,
      uploadedEmail: duplicate.primary,
      existingHubSpotContact: possibleExisting?.hubspot_contact_id ?? duplicate.matched,
      companyMatch: uploadedContact?.company ?? "Unknown company",
      duplicateType: duplicate.confidence >= 90 ? "Duplicate contact" : "Possible duplicate",
      matchReason: duplicate.reason,
      confidence: duplicate.confidence >= 90 ? "High" : "Medium",
      recommendedAction: duplicate.action === "Merge" ? "Match to existing contact" : "Update existing contact",
      status: duplicate.action === "Review" ? "Open" : "Resolved",
    };
  });

  const contactRecords = data.contacts
    .map<DuplicateReviewRecord | null>((contact) => {
      const event = events.find((item) => item.event_id === contact.event_id);
      const skyMapResult = processSkyMapRecord({
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        company: contact.company,
        companyDomain: extractDomainFromEmail(contact.email),
        existingContacts: skyMapContacts.filter((existing) => normalizeEmail(existing.email) !== normalizeEmail(contact.email)),
        existingCompanies: skyMapCompanies,
      });
      const domain = extractDomainFromEmail(contact.email);
      const generic = isGenericEmail(contact.email);
      const personal = isPersonalDomain(domain);
      const held =
        contact.skymap_match_status === "Duplicate" ||
        contact.skymap_match_status === "Possible Duplicate" ||
        contact.hubspot_sync_status === "Held for review" ||
        contact.hubspot_sync_status === "Failed" ||
        generic ||
        personal ||
        skyMapResult.eligibility.includes("Hold") ||
        skyMapResult.eligibility === "Do not sync";

      if (!held) return null;

      const duplicateType = generic
        ? "Generic email"
        : personal
          ? "Personal email domain"
          : skyMapResult.eligibility === "Hold for Sales Ops / Marketing review"
            ? "Strategic account conflict"
            : contact.skymap_match_status === "Duplicate"
              ? "Duplicate contact"
              : contact.skymap_match_status === "Possible Duplicate"
                ? "Possible duplicate"
                : contact.hubspot_sync_status === "Failed"
                  ? "Sync conflict"
                  : "Company conflict";
      const recommendedAction: DuplicateReviewAction =
        skyMapResult.eligibility === "Do not sync" || generic
          ? "Do not sync"
          : skyMapResult.eligibility === "Hold for Sales Ops / Marketing review" || personal
            ? "Send to Sales Ops review"
            : skyMapResult.confidence === "High"
              ? "Match to existing contact"
              : "Update existing contact";

      return {
        id: `CONTACT-${contact.contact_record_id}`,
        eventId: contact.event_id,
        eventName: event?.event_name ?? contact.event_id,
        uploadBatchId: contact.upload_batch_id,
        owner: event?.event_owner ?? "Marketing Ops",
        uploadedContact: `${contact.first_name} ${contact.last_name}`,
        uploadedEmail: contact.email,
        existingHubSpotContact: contact.hubspot_contact_id ?? "No HubSpot contact selected",
        companyMatch: `${skyMapResult.companyMatch} · ${contact.company}`,
        duplicateType,
        matchReason: `${skyMapResult.reason} ${contact.error_message ?? ""}`.trim(),
        confidence: skyMapResult.confidence,
        recommendedAction,
        status: "Open",
      };
    })
    .filter((record): record is DuplicateReviewRecord => Boolean(record));

  return [...duplicateRecords, ...contactRecords];
}

function getEventDetailSummary(event: EventRecord) {
  const data = getWorkflowData();
  const contacts = data.contacts.filter((contact) => contact.event_id === event.event_id);
  const conversations = data.conversations.filter((conversation) => conversation.event_id === event.event_id);
  const objectives = data.objectives.filter((objective) => objective.event_id === event.event_id);
  const contactsObjective = objectives.find((objective) => objective.objective_type === "Marketing List Growth");
  const leadObjective = objectives.find((objective) => objective.objective_type === "MQLs" || objective.objective_type === "Qualified Meetings" || objective.objective_type === "Executive Meetings");
  const synced = contacts.filter((contact) => contact.hubspot_sync_status === "Synced").length + conversations.filter((conversation) => conversation.hubspot_sync_status === "Synced").length;
  const held = contacts.filter((contact) => contact.hubspot_sync_status === "Held for review").length + conversations.filter((conversation) => conversation.hubspot_sync_status === "Held for review").length;
  const failed = contacts.filter((contact) => contact.hubspot_sync_status === "Failed").length + conversations.filter((conversation) => conversation.hubspot_sync_status === "Failed").length;
  const followUpOverdue = createReminderQueue([event], reminders).some((reminder) => reminder.event_id === event.event_id && (reminder.status === "Overdue" || reminder.status === "Escalated"));
  const riskIndicators = getOperatingRiskIndicators(event);

  return {
    contactsCommitment: contactsObjective?.commitment_value ?? 0,
    contactsUploaded: contacts.length || event.leads,
    leadCommitment: leadObjective?.commitment_value ?? 0,
    leadsUploaded: conversations.filter((conversation) => conversation.is_sales_lead).length || event.mqls,
    hubspotSynced: synced,
    hubspotHeld: held,
    hubspotFailed: failed,
    followUpStatus: followUpOverdue ? "Overdue" : "On track",
    riskIndicators,
    primaryRisk: riskIndicators[0] ?? "Healthy",
  };
}

function getEventPlainEnglishStatus(event: EventRecord, reminders: Reminder[]) {
  const data = getWorkflowData();
  const eventReminders = reminders.filter((reminder) => reminder.event_id === event.event_id);
  const overdueLeadReminders = eventReminders.filter(
    (reminder) =>
      (reminder.status === "Overdue" || reminder.status === "Escalated" || getReminderDueState(reminder) === "Overdue") &&
      /Sales Follow-Up|Lead Status/i.test(reminder.reminder_type),
  );
  const overdueReminders = eventReminders.filter((reminder) => reminder.status === "Overdue" || reminder.status === "Escalated" || getReminderDueState(reminder) === "Overdue");
  const contacts = data.contacts.filter((contact) => contact.event_id === event.event_id);
  const conversations = data.conversations.filter((conversation) => conversation.event_id === event.event_id);
  const syncRecords = data.syncRecords.filter((record) => record.eventId === event.event_id);
  const hasContactUpload = contacts.length > 0 || hasUpload(event, "Attendance") || hasUpload(event, "Marketing List");
  const hasConversationUpload = conversations.length > 0 || hasUpload(event, "Conversation Notes");
  const duplicateReviewOpen =
    data.duplicates.some((duplicate) => duplicate.eventId === event.event_id && duplicate.action === "Review") ||
    contacts.some((contact) => contact.event_id === event.event_id && contact.hubspot_sync_status === "Held for review" && (contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate")) ||
    buildDuplicateReviewRecords([event], data.duplicates).some((record) => record.eventId === event.event_id && record.status !== "Resolved");
  const failedSyncCount = syncRecords.filter((record) => record.syncStatus === "Failed").length + contacts.filter((contact) => contact.hubspot_sync_status === "Failed").length + conversations.filter((conversation) => conversation.hubspot_sync_status === "Failed").length;
  const scorecardStatus = calculateEventScorecard(event, getScorecardData(reminders)).summary.overallStatus;

  if (event.variance_percentage > 10 && !event.variance_explanation.trim()) {
    return "This event is over budget and needs a variance explanation.";
  }
  if (duplicateReviewOpen && (syncRecords.some((record) => record.syncStatus === "Held for review") || event.hubspotStatus === "Held for review")) {
    return "Duplicate review is blocking HubSpot sync.";
  }
  if (failedSyncCount > 0) {
    return `${failedSyncCount} HubSpot sync record${failedSyncCount === 1 ? "" : "s"} need Marketing Ops or Technical Team review.`;
  }
  if (event.approval_status === "Finance Review" || (getRequiredApprovers(event).some((approver) => /Finance|CFO/.test(approver)) && !event.approved_by_finance && ["Submitted", "Functional Review", "Finance Review"].includes(event.approval_status))) {
    return "This event is waiting on Finance approval.";
  }
  if (event.approval_status === "Functional Review" || (event.approval_status === "Submitted" && !event.approved_by_functional_leader)) {
    return `This event is waiting on ${getFunctionalApprover(event)} approval.`;
  }
  if (event.approval_status === "Draft" || event.approval_status === "Needs Revision") {
    return "This event request needs to be completed and submitted for approval.";
  }
  if (isPastOrPostEvent(event) && !isNonMeasurable(event) && !hasContactUpload && !hasConversationUpload) {
    return "This event needs contact and conversation uploads.";
  }
  if (isPastOrPostEvent(event) && !isNonMeasurable(event) && !hasContactUpload) {
    return "This event needs a contact upload.";
  }
  if (isPastOrPostEvent(event) && !isNonMeasurable(event) && !hasConversationUpload) {
    return "This event needs a conversation upload.";
  }
  if (overdueLeadReminders.length > 0) {
    return `${overdueLeadReminders.length} sales lead${overdueLeadReminders.length === 1 ? "" : "s"} need follow-up.`;
  }
  if (overdueReminders.length > 0) {
    return `${overdueReminders.length} reminder${overdueReminders.length === 1 ? "" : "s"} need owner action.`;
  }
  if (event.actual_cost_total > event.estimated_cost_total && event.variance_percentage > 10) {
    return "This event is over budget and variance has been explained.";
  }
  if (scorecardStatus === "Exceeded") {
    return "This event exceeded its commitments.";
  }
  if (scorecardStatus === "Met") {
    return "This event met its commitments.";
  }
  if (scorecardStatus === "Behind") {
    return "This event is behind commitment and needs leadership review.";
  }
  if (scorecardStatus === "Missing Data") {
    return "This event needs missing scorecard data before leadership review.";
  }
  if (event.approval_status === "Approved" || event.approval_status === "Locked") {
    return "This event is approved and ready for execution tracking.";
  }
  if (event.approval_status === "Completed" || event.status === "Complete") {
    return "This event is completed and ready for leadership review.";
  }

  return "This event is on track with no immediate action required.";
}

function getOperatingRiskIndicators(event: EventRecord) {
  const risks = new Set<string>();
  const commitment = getCommitmentStatus(event);

  if (commitment === "Behind Commitment" || commitment === "Missed") risks.add("Behind Commitment");
  if (event.actual_cost_total > event.estimated_cost_total || event.variance_percentage > 10) risks.add("Over Budget");
  if (getFilteredEvents([event], "missing-uploads").length > 0) risks.add("Missing Data");
  if (getFilteredEvents([event], "duplicate-review").length > 0) risks.add("Needs Review");
  if (getFilteredEvents([event], "failed-sync").length > 0) risks.add("Sync Issue");
  if (getFilteredEvents([event], "follow-up-overdue").length > 0) risks.add("Behind Commitment");
  if (event.event_tier === "Non-Measurable") risks.add("Missing Data");
  if (isMarketingListOnlyEvent(event)) risks.add("Needs Review");
  if (risks.size === 0) risks.add("Healthy");

  return Array.from(risks);
}

function createInitialApprovalState(events: EventRecord[]): ApprovalState {
  return events.reduce<ApprovalState>((state, event) => {
    const required = getRequiredApprovers(event);
    const approvals: Record<string, ApprovalDecision> = {};
    required.forEach((approver) => {
      if (event.approval_status === "Approved" || event.approval_status === "Post-Event Reporting" || event.approval_status === "Scorecard Active" || event.approval_status === "Completed") {
        approvals[approver] = "Approved";
        return;
      }
      if (approver.includes("Finance") && event.approved_by_finance) approvals[approver] = "Approved";
      if (approver.includes("Department Head") && event.approved_by_department_head) approvals[approver] = "Approved";
      if ((approver.includes("Functional") || approver.includes("Marketing") || approver.includes("Sales") || approver.includes("Channel")) && event.approved_by_functional_leader) approvals[approver] = "Approved";
    });
    state[event.event_id] = approvals;
    return state;
  }, {});
}

function getRequiredApprovers(event: EventRecord) {
  const approvers = new Set<string>();
  const hasSpend = event.estimated_cost_total > 0 || event.budget > 0;
  const commitmentStatus = getCommitmentStatus(event);
  const isMarketingListOnly = isMarketingListOnlyEvent(event);
  const isChannel = /channel|partner|reseller|dmr/i.test(`${event.event_type} ${event.funding_source} ${event.skymapRoute}`);
  const isAlliance = /alliance/i.test(`${event.event_type} ${event.funding_source} ${event.skymapRoute}`);
  const isSales = /sales|regional/i.test(`${event.funding_source} ${event.skymapRoute}`);
  const isCrossRegion = /cross-region|global|multi-region/i.test(`${event.location} ${event.notes} ${event.risk_flags.join(" ")}`);
  const isStrategic = event.event_tier === "Tier 1" || String(event.event_tier) === "Tier 1 Strategic";
  const partnerObligation = /partner obligation|enablement|partner/i.test(`${event.event_type} ${event.risk_flags.join(" ")} ${event.notes}`);

  if (hasSpend) {
    approvers.add(getFunctionalApprover(event));
    approvers.add("Finance Approval");
  }
  if (event.estimated_cost_total > 5000) approvers.add("Department Head Approval");
  if (event.estimated_cost_total > 15000) {
    approvers.add("CFO Approval");
  }
  if (isStrategic) approvers.add("Leadership Sign-off");
  if (commitmentStatus === "Not Measurable" || isNonMeasurable(event)) {
    approvers.add("Department Head Approval");
    approvers.add("Finance Approval");
  }
  if (isMarketingListOnly && event.estimated_cost_total > 3000) {
    approvers.add("Department Head Approval");
    approvers.add("Finance Approval");
  }
  if (isCrossRegion) {
    approvers.add("West Regional Leader");
    approvers.add("East Regional Leader");
    approvers.add("EMEA Regional Leader");
    approvers.add("APAC Regional Leader");
  }
  if (isChannel && isSales) {
    approvers.add("Channel Leader");
    approvers.add("Regional Sales Leader");
  }
  if (isAlliance) approvers.add("Alliance / Channel Leader");
  if (partnerObligation) {
    approvers.add("Channel Leader");
    approvers.add("Finance Approval");
  }
  if (isStrategic && /marketing/i.test(event.funding_source)) {
    approvers.add("Marketing Leader");
    approvers.add(event.region === "APAC" || event.region === "EMEA" ? `${event.region} Regional Leader` : "Regional Sales Leader");
  }

  return Array.from(approvers);
}

function getApprovalVisibilityNotices(event: EventRecord) {
  const notices: string[] = [];
  if (event.estimated_cost_total > 15000) notices.push("CEO Visibility");
  return notices;
}

function getFunctionalApprover(event: EventRecord) {
  const context = `${event.event_type} ${event.funding_source} ${event.skymapRoute} ${event.functional_owner}`;
  if (/alliance/i.test(context)) return "Alliance / Channel Leader";
  if (/channel|partner|reseller|dmr/i.test(context)) return "Channel Leader";
  if (/marketing|demand gen|trade show|webinar|marketing list/i.test(context)) return "Marketing Leader";
  if (/sales|regional|field event|executive briefing/i.test(context)) return "Regional Sales Leader";
  return "Department Head Approval";
}

function getApproverReason(event: EventRecord, approver: string) {
  if (approver === "Finance Approval") return "Every event with spend requires Finance approval.";
  if (approver === "Department Head Approval") return event.estimated_cost_total > 5000 ? "Cost is above $5,000 or event is non-measurable / marketing-list-only." : "Required by event measurement rule.";
  if (approver === "CFO Approval") return "Cost is above $15,000.";
  if (approver === "Leadership Sign-off") return "Tier 1 Strategic events require leadership sign-off.";
  if (approver === "Alliance / Channel Leader") return "Alliance-originated or alliance-funded event.";
  if (approver === "Channel Leader") return "Channel, reseller, DMR, partner, or partner-obligation event.";
  if (approver === "Regional Sales Leader") return "Regional sales ownership or Channel + Sales event.";
  if (approver.includes("Regional Leader")) return "Cross-region or regional leadership routing.";
  if (approver.includes("Marketing")) return "Marketing-originated strategic event.";
  return "Functional approver based on event type, tier, region, and funding source.";
}

function isWorkflowStepComplete(event: EventRecord, step: string, allApproved: boolean) {
  const status = event.approval_status;
  const order = ["Draft", "Submitted", "Functional Review", "Finance Review", "Approved", "Locked", "Post-Event Reporting", "Cost Reconciliation Pending", "Completed"];
  const stepStatusMap: Record<string, ApprovalStatus> = {
    Draft: "Draft",
    Submitted: "Submitted",
    "Functional Leader Review": "Functional Review",
    "Finance Review": "Finance Review",
    Approved: "Approved",
    "Locked at Event Start Date": "Locked",
    "Post-Event Reporting": "Post-Event Reporting",
    "T+30 Cost Reconciliation": "Cost Reconciliation Pending",
    Completed: "Completed",
  };
  if (step === "Approved" && allApproved) return true;
  return order.indexOf(status) > order.indexOf(stepStatusMap[step]);
}

function isWorkflowStepActive(event: EventRecord, step: string, allApproved: boolean) {
  if (step === "Approved" && allApproved) return true;
  const activeMap: Record<ApprovalStatus, string> = {
    Draft: "Draft",
    Submitted: "Submitted",
    "Needs Revision": "Submitted",
    "Functional Review": "Functional Leader Review",
    "Finance Review": "Finance Review",
    Approved: "Approved",
    Rejected: "Submitted",
    Locked: "Locked at Event Start Date",
    "Event Completed": "Post-Event Reporting",
    "Post-Event Reporting": "Post-Event Reporting",
    "HubSpot Sync In Progress": "Post-Event Reporting",
    "Scorecard Active": "T+30 Cost Reconciliation",
    "Cost Reconciliation Pending": "T+30 Cost Reconciliation",
    Completed: "Completed",
    Archived: "Completed",
  };
  return activeMap[event.approval_status] === step;
}

function parseCostCsv(csvText: string): { lines: CostEstimateLine[]; errors: string[] } {
  const errors: string[] = [];
  const rows = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map(parseCsvRow);

  if (rows.length === 0) return { lines: [], errors: ["CSV is empty."] };

  const headers = rows[0].map((header) => header.trim());
  const missingColumns = requiredCostCsvColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}.`);
    return { lines: [], errors };
  }

  const indexFor = (column: string) => headers.indexOf(column);
  const lines = rows.slice(1).map((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const costCategory = row[indexFor("Cost Category")]?.trim() ?? "";
    const estimatedRaw = row[indexFor("Estimated Amount")]?.trim() ?? "";
    const vendor = row[indexFor("Vendor")]?.trim() ?? "";
    const notes = row[indexFor("Notes")]?.trim() ?? "";
    const estimatedAmount = Number(estimatedRaw.replace(/[$,]/g, ""));

    if (!COST_CATEGORIES.includes(costCategory as (typeof COST_CATEGORIES)[number])) errors.push(`Row ${lineNumber}: invalid Cost Category "${costCategory}".`);
    if (!estimatedRaw || Number.isNaN(estimatedAmount) || estimatedAmount < 0) errors.push(`Row ${lineNumber}: Estimated Amount must be a non-negative number.`);
    if (!vendor) errors.push(`Row ${lineNumber}: Vendor is required.`);

    return {
      id: `COST-UPLOAD-${lineNumber}`,
      costCategory,
      estimatedAmount: Number.isNaN(estimatedAmount) ? 0 : estimatedAmount,
      actualAmount: "",
      vendor,
      notes,
    };
  });

  if (lines.length === 0) errors.push("CSV must include at least one cost line.");
  return { lines: errors.length > 0 ? [] : lines, errors };
}

function parseContactCsv(csvText: string, eventId: string): { lines: UploadedContactLine[]; errors: string[] } {
  const data = getWorkflowData();
  const errors: string[] = [];
  const rows = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map(parseCsvRow);

  if (rows.length === 0) return { lines: [], errors: ["CSV is empty."] };

  const headers = rows[0].map((header) => header.trim());
  const missingColumns = requiredContactCsvColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    return { lines: [], errors: [`Missing required columns: ${missingColumns.join(", ")}.`] };
  }

  const indexFor = (column: string) => headers.indexOf(column);
  const existingEmails = new Map(data.contacts.map((contact) => [normalizeEmail(contact.email), contact.email]));
  const existingCompanies = new Set(data.contacts.map((contact) => normalizeKey(contact.company)).filter(Boolean));
  const skyMapContacts = data.contacts.map((contact) => ({
    firstName: contact.first_name,
    lastName: contact.last_name,
    email: contact.email,
    company: contact.company,
    companyDomain: extractDomainFromEmail(contact.email),
  }));
  const skyMapCompanies = Array.from(new Map(data.contacts.map((contact) => [normalizeKey(contact.company), contact])).values()).map((contact) => ({
    companyName: contact.company,
    companyDomain: extractDomainFromEmail(contact.email),
    strategic: /university|health|urbanbuild/i.test(contact.company),
  }));
  const seenEmails = new Map<string, string>();
  const missingEmailNameCompany = new Set<string>();

  const lines = rows.slice(1).map((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const firstName = row[indexFor("First Name")]?.trim() ?? "";
    const lastName = row[indexFor("Last Name")]?.trim() ?? "";
    const email = row[indexFor("Email")]?.trim() ?? "";
    const company = row[indexFor("Company")]?.trim() ?? "";
    const title = row[indexFor("Title")]?.trim() ?? "";
    const phone = row[indexFor("Phone")]?.trim() ?? "";
    const country = row[indexFor("Country")]?.trim() ?? "";
    const captureMethod = row[indexFor("Capture Method")]?.trim() ?? "";
    const consentStatus = row[indexFor("Consent Status")]?.trim() ?? "";
    const notes = row[indexFor("Notes")]?.trim() ?? "";
    const normalizedEmail = normalizeEmail(email);
    const nameCompanyKey = normalizeKey(`${firstName} ${lastName} ${company}`);
    const hasMinimum = Boolean(email && company);
    let status: ContactUploadStatus = "New contact";
    let reason = "Valid new contact is ready for SkyMap and HubSpot sync.";
    const invalidConsentStatus = Boolean(consentStatus && !isConfiguredOption(consentStatus, CONSENT_STATUSES));

    if (invalidConsentStatus) {
      errors.push(`Row ${lineNumber}: invalid Consent Status "${consentStatus}".`);
      status = "Failed";
      reason = `Invalid Consent Status "${consentStatus}".`;
    }
    if (!hasMinimum) {
      status = "Missing required fields";
      reason = "Email and Company are required before HubSpot sync.";
    }
    if (email && !isLikelyEmail(email)) {
      status = "Failed";
      reason = "Email format failed validation.";
    }
    if (normalizedEmail && seenEmails.has(normalizedEmail)) {
      const firstSeen = seenEmails.get(normalizedEmail);
      status = firstSeen === email ? "Existing contact found" : "Conflict";
      reason = firstSeen === email ? "Duplicate contact in this upload with the same email." : "Same email appears with case difference in this upload.";
    }
    if (normalizedEmail && existingEmails.has(normalizedEmail)) {
      const existingEmail = existingEmails.get(normalizedEmail);
      status = existingEmail === email ? "Existing contact found" : "Conflict";
      reason = existingEmail === email ? "Same email already exists in event contact history." : "Same email already exists with different casing.";
    }
    if (!email && firstName && lastName && company) {
      if (missingEmailNameCompany.has(nameCompanyKey)) {
        status = "Possible duplicate";
        reason = "Same name and company with missing email appears more than once.";
      } else {
        reason = "Missing email; held for correction before sync.";
      }
    }
    if (email && isGenericEmail(email)) {
      status = "Possible duplicate";
      reason = "Generic email address should be reviewed before creating a prospect.";
    }
    if (status === "New contact" && company && existingCompanies.has(normalizeKey(company)) && !existingEmails.has(normalizedEmail)) {
      status = "Existing company found";
      reason = "Company exists; new prospect can be attached after SkyMap routing.";
    }
    if (status === "New contact" && company && !existingCompanies.has(normalizeKey(company))) {
      status = "New company will be created";
      reason = "Company not found in mock records; ready for new company creation preview.";
    }

    const skyMapResult = processSkyMapRecord({
      firstName,
      lastName,
      email,
      company,
      companyDomain: extractDomainFromEmail(email),
      existingContacts: skyMapContacts,
      existingCompanies: skyMapCompanies,
    });

    if (skyMapResult.confidence === "Conflict") {
      status = "Conflict";
      reason = "SkyMap found a conflict. Do not sync until resolved.";
    } else if (skyMapResult.eligibility.includes("Hold")) {
      status = status === "Missing required fields" || status === "Failed" ? status : "Possible duplicate";
      reason = `${reason} SkyMap: ${skyMapResult.eligibility}.`;
    }
    if (invalidConsentStatus) {
      status = "Failed";
      reason = `Invalid Consent Status "${consentStatus}".`;
    }

    if (normalizedEmail) seenEmails.set(normalizedEmail, email);
    if (!email && nameCompanyKey) missingEmailNameCompany.add(nameCompanyKey);

    return {
      id: `CONTACT-UPLOAD-${eventId}-${lineNumber}`,
      firstName,
      lastName,
      email,
      company,
      title,
      phone,
      country,
      captureMethod,
      consentStatus,
      notes,
      status,
      reason,
      skyMapResult,
    };
  });

  if (lines.length === 0) errors.push("CSV must include at least one contact row.");
  return { lines, errors };
}

function getContactUploadSummary(lines: UploadedContactLine[]) {
  const readyStatuses: ContactUploadStatus[] = ["New contact", "Existing company found", "New company will be created"];
  return {
    total: lines.length,
    ready: lines.filter((line) => readyStatuses.includes(line.status)).length,
    duplicatesHeld: lines.filter((line) => line.status === "Existing contact found" || line.status === "Conflict").length,
    possibleDuplicatesHeld: lines.filter((line) => line.status === "Possible duplicate").length,
    missingRequired: lines.filter((line) => line.status === "Missing required fields").length,
    failed: lines.filter((line) => line.status === "Failed").length,
  };
}

function parseConversationCsv(csvText: string, eventId: string): { lines: UploadedConversationLine[]; errors: string[] } {
  const errors: string[] = [];
  const rows = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map(parseCsvRow);

  if (rows.length === 0) return { lines: [], errors: ["CSV is empty."] };

  const headers = rows[0].map((header) => header.trim());
  const missingColumns = requiredConversationCsvColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) return { lines: [], errors: [`Missing required columns: ${missingColumns.join(", ")}.`] };

  const indexFor = (column: string) => headers.indexOf(column);
  const lines = rows.slice(1).map((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const rawProductInterest = row[indexFor("Product Interest")]?.trim() ?? "";
    const rawLeadQuality = row[indexFor("Lead Quality")]?.trim() ?? "";
    const validProductInterest = !rawProductInterest || isConfiguredOption(rawProductInterest, PRODUCT_INTEREST);
    const validLeadQuality = !rawLeadQuality || isConfiguredOption(rawLeadQuality, LEAD_QUALITY);
    if (!validProductInterest) errors.push(`Row ${lineNumber}: invalid Product Interest "${rawProductInterest}".`);
    if (!validLeadQuality) errors.push(`Row ${lineNumber}: invalid Lead Quality "${rawLeadQuality}".`);
    const line: UploadedConversationLine = {
      id: `CONV-UPLOAD-${eventId}-${lineNumber}`,
      contactEmail: row[indexFor("Contact Email")]?.trim() ?? "",
      company: row[indexFor("Company")]?.trim() ?? "",
      contactName: row[indexFor("Contact Name")]?.trim() ?? "",
      title: row[indexFor("Title")]?.trim() ?? "",
      conversationOwner: row[indexFor("Conversation Owner")]?.trim() ?? "",
      conversationSummary: row[indexFor("Conversation Summary")]?.trim() ?? "",
      productInterest: rawProductInterest && validProductInterest ? normalizeProductInterest(rawProductInterest) : "",
      isSalesLead: normalizeYesNo(row[indexFor("Is Sales Lead")]?.trim() ?? ""),
      leadQuality: validLeadQuality ? normalizeLeadQuality(rawLeadQuality) : "",
      buyingTimeline: row[indexFor("Buying Timeline")]?.trim() ?? "",
      estimatedOpportunitySize: row[indexFor("Estimated Opportunity Size")]?.trim() ?? "",
      nextStep: row[indexFor("Next Step")]?.trim() ?? "",
      followUpOwner: row[indexFor("Follow-Up Owner")]?.trim() ?? "",
      followUpDate: row[indexFor("Follow-Up Date")]?.trim() ?? "",
      notes: row[indexFor("Notes")]?.trim() ?? "",
      status: "Conversation intelligence only",
      reason: "",
    };

    if (line.isSalesLead === "Yes" && !line.leadQuality) line.leadQuality = "Medium";
    if (line.isSalesLead === "Yes" && !line.followUpDate) line.followUpDate = getDefaultFollowUpDate(line.leadQuality);
    return classifyUploadedConversation(line);
  });

  return { lines, errors: lines.length === 0 ? ["CSV must include at least one conversation row."] : [] };
}

function classifyUploadedConversation(line: UploadedConversationLine): UploadedConversationLine {
  const next = { ...line };
  if (next.isSalesLead === "Yes" && !next.leadQuality) next.leadQuality = "Medium";
  if (next.isSalesLead === "Yes" && !next.followUpDate) next.followUpDate = getDefaultFollowUpDate(next.leadQuality);

  const normalizedEmail = normalizeEmail(next.contactEmail);
  const data = getWorkflowData();
  const duplicateContact =
    normalizedEmail &&
    (data.contacts.some((contact) => normalizeEmail(contact.email) === normalizedEmail && (contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate")) ||
      isGenericEmail(normalizedEmail));

  if (duplicateContact) {
    next.status = "Duplicate contact review";
    next.reason = "Duplicate or generic contact detected; hold conversation before lead sync.";
    return next;
  }

  if (next.isSalesLead !== "Yes") {
    next.status = "Conversation intelligence only";
    next.reason = "Is Sales Lead is No, so this is stored as event intelligence only.";
    return next;
  }

  const missing = getMissingQualifiedLeadFields(next);
  if (missing.length > 0) {
    next.status = "Hold and complete missing fields";
    next.reason = `Missing required lead fields: ${missing.join(", ")}.`;
    return next;
  }

  next.status = "Ready for HubSpot Lead sync";
  next.reason = `Ready for HubSpot Lead sync. Follow-up SLA applied: ${next.leadQuality || "Medium"}.`;
  return next;
}

function getMissingQualifiedLeadFields(line: UploadedConversationLine) {
  const missing: string[] = [];
  if (!line.contactEmail) missing.push("Contact email");
  if (!line.company) missing.push("Company");
  if (!line.conversationSummary) missing.push("Conversation summary");
  if (!line.productInterest) missing.push("Product interest");
  if (!line.followUpOwner) missing.push("Follow-up owner");
  if (!line.nextStep) missing.push("Next step");
  return missing;
}

function getConversationUploadSummary(lines: UploadedConversationLine[]) {
  return {
    total: lines.length,
    readyLeadSync: lines.filter((line) => line.status === "Ready for HubSpot Lead sync").length,
    holdMissing: lines.filter((line) => line.status === "Hold and complete missing fields").length,
    intelligenceOnly: lines.filter((line) => line.status === "Conversation intelligence only").length,
    duplicateReview: lines.filter((line) => line.status === "Duplicate contact review").length,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isLikelyEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isGenericEmail(email: string) {
  const localPart = normalizeEmail(email).split("@")[0] ?? "";
  return genericEmailPrefixes.includes(localPart);
}

function isPersonalDomain(domain: string) {
  return ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "qq.com", "163.com"].includes(domain.toLowerCase());
}

function extractDomainFromEmail(email: string) {
  return normalizeEmail(email).split("@")[1] ?? "";
}

function getCreateEventValidation(form: CreateEventForm) {
  const requiredFields: Array<[keyof CreateEventForm, string]> = [
    ["eventName", "Event name is required."],
    ["startDate", "Event start date is required."],
    ["endDate", "Event end date is required."],
    ["location", "Location is required."],
    ["region", "Region is required."],
    ["eventType", "Event type is required."],
    ["eventTier", "Event tier is required."],
    ["eventOwner", "Event Owner is required."],
    ["functionalOwner", "Functional owner is required."],
    ["fundingSource", "Funding source is required."],
    ["reasonToBelieve", "Reason to believe is required."],
    ["leadCaptureMethod", "Lead capture method is required."],
    ["postEventPlan", "Post-event plan is required."],
    ["outreachOwner", "Outreach owner is required."],
    ["followUpTimeline", "Follow-up timeline is required."],
  ];
  const messages = requiredFields
    .filter(([key]) => !String(form[key] ?? "").trim())
    .map(([, message]) => message);

  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    messages.push("Event end date cannot be before the start date.");
  }
  if (Number(form.estimatedCost) < 0) {
    messages.push("Estimated all-in cost cannot be negative.");
  }
  if (form.costLines.length === 0) {
    messages.push("Cost estimate CSV is required before approval.");
  }
  const estimatedTotal = form.costLines.reduce((sum, line) => sum + line.estimatedAmount, 0);
  const actualTotal = form.costLines.reduce((sum, line) => sum + Number(line.actualAmount || 0), 0);
  const variancePercentage = estimatedTotal > 0 ? ((actualTotal - estimatedTotal) / estimatedTotal) * 100 : 0;
  if (variancePercentage > 10 && !form.varianceExplanation.trim()) {
    messages.push("Variance explanation is required when actual cost is more than 10% above estimate.");
  }
  if (form.eventTier === "Other" && !form.eventTierExplanation.trim()) {
    messages.push("Event Tier = Other requires an explanation.");
  }

  const summary = getMeasurableObjectiveSummary(form);
  if (!summary.allQuestionsAnswered) {
    messages.push("All measurable objective questions must be answered before approval.");
  }
  if (form.measurableObjectives.marketingListGrowth === "Yes" && !form.objectiveCommitments.targetContactCount) messages.push("Marketing list growth requires Target Contact Count.");
  if (form.measurableObjectives.salesLeadGeneration === "Yes" && !form.objectiveCommitments.targetQualifiedLeadCount) messages.push("Sales lead generation requires Target Qualified Lead Count.");
  if (form.measurableObjectives.channelExpansion === "Yes" && !form.objectiveCommitments.targetQualifiedPartnerConversations) messages.push("Channel expansion requires Target Qualified Partner Conversations.");
  if (form.measurableObjectives.channelExpansion === "Yes" && !form.objectiveCommitments.partnerAgreementsInitiated) messages.push("Channel expansion requires Partner Agreements Initiated.");

  return messages;
}

function getFieldError(field: keyof CreateEventForm, form: CreateEventForm) {
  if (field === "eventTierExplanation" && form.eventTier === "Other" && !form.eventTierExplanation.trim()) return "Explanation is required when Event Tier is Other.";
  if (field === "endDate" && form.startDate && form.endDate && form.endDate < form.startDate) return "End date cannot be before start date.";
  if (field === "estimatedCost" && Number(form.estimatedCost) < 0) return "Cost cannot be negative.";
  if (!String(form[field] ?? "").trim()) return "Required.";
  return "";
}

function getApprovalRoutingPreview(form: CreateEventForm) {
  const estimatedCost = Number(form.estimatedCost || 0);
  const summary = getMeasurableObjectiveSummary(form);
  const routes = ["Functional owner approval"];

  if (estimatedCost > 5000) routes.push("Department Head required");
  if (estimatedCost > 15000) routes.push("CFO + CEO visibility");
  if (form.eventTier === "Tier 1 Strategic") routes.push("Leadership approval required");
  if (summary.allQuestionsAnswered && summary.measurableYesCount === 0) routes.push("Non-measurable event review");
  if (summary.isMarketingListOnly) routes.push("Marketing-list-only handling");
  if (form.eventType === "Marketing List Build") routes.push("HubSpot nurture list review");

  return routes;
}

function getMeasurableObjectiveSummary(form: CreateEventForm) {
  const marketingListGrowth = form.measurableObjectives.marketingListGrowth === "Yes";
  const salesLeadGeneration = form.measurableObjectives.salesLeadGeneration === "Yes";
  const channelExpansion = form.measurableObjectives.channelExpansion === "Yes";
  const measurableYesCount = [marketingListGrowth, salesLeadGeneration, channelExpansion].filter(Boolean).length;
  const allQuestionsAnswered = Object.values(form.measurableObjectives).every(Boolean);

  return {
    allQuestionsAnswered,
    measurableYesCount,
    isMarketingListOnly: marketingListGrowth && !salesLeadGeneration && !channelExpansion,
  };
}

function getDerivedObjectiveStatus(objective: EventObjective): EventObjective["status"] {
  if (!objective.expected_yes_no || objective.commitment_value === null) return "Not Measurable";
  if (objective.actual_value === null) return "Not Started";
  if (objective.commitment_value <= 0) return objective.actual_value > 0 ? "Exceeded" : "Met";
  if (objective.actual_value > objective.commitment_value) return "Exceeded";
  if (objective.actual_value >= objective.commitment_value) return "Met";
  if (objective.actual_value >= objective.commitment_value * 0.8) return "On Track";
  return "Behind Commitment";
}

function formatObjectiveValue(value: number | null | undefined) {
  return value === null || value === undefined ? "None" : number.format(value);
}

function applyEventListFilters(events: EventRecord[], filters: EventListFilters) {
  const search = filters.search.trim().toLowerCase();
  return events.filter((event) => {
    const searchable = `${event.event_name} ${event.event_owner} ${event.owner} ${event.location} ${event.functional_owner}`.toLowerCase();
    const commitmentStatus = getCommitmentStatus(event);

    if (search && !searchable.includes(search)) return false;
    if (filters.eventStatus !== "All" && event.status !== filters.eventStatus) return false;
    if (filters.region !== "All" && event.region !== filters.region) return false;
    if (filters.owner !== "All" && event.event_owner !== filters.owner) return false;
    if (filters.eventType !== "All" && event.event_type !== filters.eventType) return false;
    if (filters.eventTier !== "All" && event.event_tier !== filters.eventTier) return false;
    if (filters.approvalStatus !== "All" && event.approval_status !== filters.approvalStatus) return false;
    if (filters.functionalOwner !== "All" && event.functional_owner !== filters.functionalOwner) return false;
    if (filters.overdueItems === "Has overdue" && event.overdue_items.length === 0) return false;
    if (filters.overdueItems === "No overdue" && event.overdue_items.length > 0) return false;
    if (filters.startDateFrom && event.event_start_date < filters.startDateFrom) return false;
    if (filters.startDateTo && event.event_start_date > filters.startDateTo) return false;
    if (filters.commitmentStatus !== "All" && commitmentStatus !== filters.commitmentStatus) return false;
    if (filters.costVariance === "Over budget" && event.actual_cost_total <= event.estimated_cost_total) return false;
    if (filters.costVariance === "Variance >10%" && event.variance_percentage <= 10) return false;
    if (filters.costVariance === "Under budget" && event.actual_cost_total >= event.estimated_cost_total) return false;
    if (filters.costVariance === "No actuals" && event.actual_cost_total !== 0) return false;

    return true;
  });
}

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function getCommitmentStatus(event: EventRecord) {
  const objectives = getWorkflowData().objectives.filter((objective) => objective.event_id === event.event_id);
  if (objectives.length === 0) return "No Objective";
  if (objectives.some((objective) => objective.status === "Behind Commitment")) return "Behind Commitment";
  if (objectives.some((objective) => objective.status === "Missed")) return "Missed";
  if (objectives.every((objective) => objective.status === "Not Measurable")) return "Not Measurable";
  if (objectives.some((objective) => objective.status === "Exceeded")) return "Exceeded";
  if (objectives.some((objective) => objective.status === "Met")) return "Met";
  if (objectives.some((objective) => objective.status === "On Track")) return "On Track";
  return objectives[0].status;
}

function getFilteredEvents(events: EventRecord[], filterKey: EventFilterKey): EventRecord[] {
  const data = getWorkflowData();
  if (filterKey === "all") return events;
  if (filterKey.startsWith("approval:")) {
    const status = filterKey.replace("approval:", "") as ApprovalStatus;
    return events.filter((event) => event.approval_status === status);
  }
  if (filterKey.startsWith("region:")) {
    const region = filterKey.replace("region:", "") as Region;
    return events.filter((event) => event.region === region);
  }
  if (filterKey.startsWith("cohort:")) {
    const cohort = filterKey.replace("cohort:", "");
    return events.filter((event) => getEventCohort(event) === cohort);
  }

  switch (filterKey) {
    case "awaiting-approval":
      return events.filter((event) => ["Submitted", "Functional Review", "Finance Review"].includes(event.approval_status));
    case "approved":
      return events.filter((event) => approvedStatuses.includes(event.approval_status));
    case "over-budget":
      return events.filter((event) => event.actual_cost_total > event.estimated_cost_total);
    case "contacts-uploaded":
      return events.filter((event) => data.contacts.some((contact) => contact.event_id === event.event_id));
    case "contacts-synced":
      return events.filter((event) => data.contacts.some((contact) => contact.event_id === event.event_id && contact.hubspot_sync_status === "Synced"));
    case "conversations-uploaded":
      return events.filter((event) => data.conversations.some((conversation) => conversation.event_id === event.event_id));
    case "leads-synced":
      return events.filter((event) =>
        data.conversations.some((conversation) => conversation.event_id === event.event_id && conversation.is_sales_lead && conversation.hubspot_sync_status === "Synced"),
      );
    case "duplicate-held":
    case "duplicate-review":
      return events.filter((event) =>
        data.contacts.some(
          (contact) =>
            contact.event_id === event.event_id &&
            (contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate") &&
            contact.hubspot_sync_status === "Held for review",
        ),
      );
    case "missing-attendee-list":
      return events.filter((event) => isPastOrPostEvent(event) && !isNonMeasurable(event) && event.event_type !== "Marketing List Build" && !hasUpload(event, "Attendance"));
    case "missing-cost-reconciliation":
      return events.filter((event) => isPastOrPostEvent(event) && event.actual_cost_total === 0);
    case "non-measurable":
      return events.filter((event) => isNonMeasurable(event));
    case "marketing-list-only":
      return events.filter((event) => isMarketingListOnlyEvent(event));
    case "missing-uploads":
      return events.filter((event) => getFilteredEvents([event], "missing-contact-upload").length > 0 || getFilteredEvents([event], "missing-attendee-list").length > 0 || getFilteredEvents([event], "missing-conversation-upload").length > 0);
    case "missing-contact-upload":
      return events.filter((event) => isPastOrPostEvent(event) && !isNonMeasurable(event) && !data.contacts.some((contact) => contact.event_id === event.event_id));
    case "missing-conversation-upload":
      return events.filter((event) => isPastOrPostEvent(event) && !isNonMeasurable(event) && !data.conversations.some((conversation) => conversation.event_id === event.event_id));
    case "failed-sync":
      return events.filter(
        (event) =>
          data.contacts.some((contact) => contact.event_id === event.event_id && contact.hubspot_sync_status === "Failed") ||
          data.conversations.some((conversation) => conversation.event_id === event.event_id && conversation.hubspot_sync_status === "Failed"),
      );
    case "cost-variance":
      return events.filter((event) => event.variance_percentage > 10);
    case "follow-up-overdue":
      return events.filter((event) => createReminderQueue([event], reminders).some((reminder) => reminder.event_id === event.event_id && (reminder.status === "Overdue" || reminder.status === "Escalated")));
    default:
      return events;
  }
}

function getRegionalPerformance(events: EventRecord[], region: Region) {
  const data = getWorkflowData();
  const regionEvents = events.filter((event) => event.region === region);
  const regionEventIds = new Set(regionEvents.map((event) => event.event_id));
  const regionReminders = createReminderQueue(regionEvents, reminders).filter((reminder) => regionEventIds.has(reminder.event_id));
  const overdueItems = regionEvents.reduce((sum, event) => sum + event.overdue_items.length, 0) + regionReminders.filter((reminder) => reminder.status === "Overdue" || reminder.status === "Escalated").length;
  const leadConversations = data.conversations.filter((conversation) => regionEventIds.has(conversation.event_id) && conversation.is_sales_lead);
  const overdueFollowUps = leadConversations.filter((conversation) => conversation.follow_up_date && new Date(`${conversation.follow_up_date}T12:00:00`) < currentDate && conversation.hubspot_sync_status !== "Synced").length;
  const compliance = leadConversations.length === 0 ? 100 : Math.max(0, Math.round(((leadConversations.length - overdueFollowUps) / leadConversations.length) * 100));

  return {
    region,
    events: regionEvents.length,
    spend: regionEvents.reduce((sum, event) => sum + event.actual_cost_total, 0),
    contacts: data.contacts.filter((contact) => regionEventIds.has(contact.event_id)).length,
    leads: leadConversations.length,
    compliance,
    overdueItems,
  };
}

function getAgedCohorts(events: EventRecord[]) {
  return ["0-30 days", "31-60 days", "61-90 days", "90+ days"].map((label) => {
    const cohortEvents = events.filter((event) => getEventCohort(event) === label);
    const overdueItems = cohortEvents.reduce((sum, event) => sum + event.overdue_items.length, 0);
    const hasSyncIssue = cohortEvents.some((event) => getEventRiskBadges(event).includes("Sync Issue"));
    const hasOverBudget = cohortEvents.some((event) => getEventRiskBadges(event).includes("Over Budget"));
    const risk = hasSyncIssue ? "Sync Issue" : hasOverBudget ? "Over Budget" : overdueItems > 0 ? "Needs Review" : "Healthy";

    return { label, events: cohortEvents.length, overdueItems, risk };
  });
}

function getEventCohort(event: EventRecord) {
  const start = new Date(`${event.event_start_date}T12:00:00`);
  const ageDays = Math.max(0, Math.floor((currentDate.getTime() - start.getTime()) / 86_400_000));
  if (ageDays <= 30) return "0-30 days";
  if (ageDays <= 60) return "31-60 days";
  if (ageDays <= 90) return "61-90 days";
  return "90+ days";
}

function getEventUploadStatus(event: EventRecord, kind: "contact" | "conversation") {
  const data = getWorkflowData();
  const records = kind === "contact"
    ? data.contacts.filter((contact) => contact.event_id === event.event_id)
    : data.conversations.filter((conversation) => conversation.event_id === event.event_id);
  const uploadTypes = kind === "contact" ? ["Attendance", "Registration", "Marketing List"] : ["Conversation Notes", "Sales Nomination"];
  const batches = data.uploads.filter((upload) => upload.event_id === event.event_id && uploadTypes.includes(upload.upload_type));
  const failedCount = records.filter((record) => record.hubspot_sync_status === "Failed").length + batches.reduce((sum, batch) => sum + batch.failed_records, 0);
  const heldCount = records.filter((record) => record.hubspot_sync_status === "Held for review").length + batches.reduce((sum, batch) => sum + batch.held_for_review_records, 0);
  const recordCount = records.length || batches.reduce((sum, batch) => sum + batch.total_records, 0);
  const requiredPostEvent = isPastOrPostEvent(event) && !isNonMeasurable(event) && (kind === "contact" || !isMarketingListOnlyEvent(event));

  if (failedCount > 0) return { status: "Failed", label: "Failed", detail: `${number.format(failedCount)} failed validation or sync` };
  if (heldCount > 0) return { status: "Held", label: "Held", detail: `${number.format(heldCount)} held for review` };
  if (recordCount > 0) return { status: "Uploaded", label: "Uploaded", detail: `${number.format(recordCount)} record${recordCount === 1 ? "" : "s"}` };
  if (requiredPostEvent) return { status: "Missing", label: "Missing", detail: kind === "contact" ? "Contact list needed" : "Conversation list needed" };
  return { status: "Not due", label: "Not due", detail: isPastOrPostEvent(event) ? "Not required for this event" : "Event has not ended" };
}

function getEventHubSpotSyncSummary(event: EventRecord, role: Role) {
  const data = getWorkflowData();
  const records = getVisibleSyncRecordsForRole(role, data.syncRecords, [event], data.conversations).filter((record) => record.eventId === event.event_id);
  const failed = records.filter((record) => record.syncStatus === "Failed").length;
  const held = records.filter((record) => record.syncStatus === "Held for review").length;
  const ready = records.filter((record) => record.syncStatus === "Ready to sync").length;
  const synced = records.filter((record) => record.syncStatus === "Synced").length;
  const suppressed = records.filter((record) => record.syncStatus === "Suppressed / do not market" || record.syncStatus === "DTEN.me / SkyMap only").length;
  const total = records.length;
  const detailParts = [`${number.format(synced)} synced`, `${number.format(held)} held`, `${number.format(failed)} failed`];
  if (ready > 0) detailParts.push(`${number.format(ready)} ready`);
  if (suppressed > 0) detailParts.push(`${number.format(suppressed)} suppressed/intel only`);

  if (total === 0) return { status: "No records", label: "No records", detail: "Nothing queued" };
  if (failed > 0) return { status: "Failed", label: "Sync issue", detail: detailParts.join(" / ") };
  if (held > 0) return { status: "Held", label: "Held", detail: detailParts.join(" / ") };
  if (ready > 0) return { status: "Ready", label: "Ready", detail: detailParts.join(" / ") };
  return { status: "Synced", label: "Synced", detail: detailParts.join(" / ") };
}

function getPrimaryEventStatus(event: EventRecord, reminderEntries: Reminder[]): PrimaryEventStatus {
  const data = getWorkflowData();
  const objectives = data.objectives.filter((objective) => objective.event_id === event.event_id);
  const contacts = data.contacts.filter((contact) => contact.event_id === event.event_id);
  const conversations = data.conversations.filter((conversation) => conversation.event_id === event.event_id);
  const syncRecords = data.syncRecords.filter((record) => record.eventId === event.event_id);
  const eventReminders = reminderEntries.filter((reminder) => reminder.event_id === event.event_id);
  const hasOverdueWork =
    event.overdue_items.length > 0 ||
    eventReminders.some((reminder) => reminder.status === "Overdue" || reminder.status === "Escalated" || getReminderDueState(reminder) === "Overdue");
  const hasBehindCommitment =
    ["Behind Commitment", "Missed"].includes(getCommitmentStatus(event)) ||
    objectives.some((objective) => objective.status === "Behind Commitment" || objective.status === "Missed");
  const hasOpsBlocker =
    event.hubspotStatus === "Held for review" ||
    event.hubspotStatus === "Failed" ||
    syncRecords.some((record) => record.syncStatus === "Held for review" || record.syncStatus === "Failed") ||
    contacts.some((contact) => contact.hubspot_sync_status === "Held for review" || contact.hubspot_sync_status === "Failed" || contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate" || contact.skymap_match_status === "Conflict") ||
    conversations.some((conversation) => conversation.hubspot_sync_status === "Held for review" || conversation.hubspot_sync_status === "Failed") ||
    buildDuplicateReviewRecords([event], data.duplicates).some((record) => record.eventId === event.event_id && record.status !== "Resolved" && record.status !== "Do Not Sync");
  const hasMissingData =
    getFilteredEvents([event], "missing-attendee-list").length > 0 ||
    getFilteredEvents([event], "missing-cost-reconciliation").length > 0 ||
    getFilteredEvents([event], "missing-contact-upload").length > 0 ||
    getFilteredEvents([event], "missing-conversation-upload").length > 0 ||
    getFilteredEvents([event], "missing-uploads").length > 0 ||
    getOperatingRiskIndicators(event).includes("Missing Data");
  const needsUserAction = event.approval_status === "Draft" || event.approval_status === "Needs Revision" || getEventRiskBadges(event).includes("Needs Review");

  if (hasOverdueWork) return "Overdue";
  if (needsUserAction) return "Needs your action";
  if (event.actual_cost_total > event.estimated_cost_total || event.variance_percentage > 10) return "Over budget";
  if (hasBehindCommitment) return "Behind commitment";
  if (hasMissingData) return "Missing data";
  if (["Submitted", "Functional Review", "Finance Review"].includes(event.approval_status)) return "Waiting on approval";
  if (hasOpsBlocker) return "Waiting on Ops";
  return "Ready";
}

function getEventRiskBadges(event: EventRecord) {
  const badges = new Set<string>();
  const objectives = getWorkflowData().objectives.filter((objective) => objective.event_id === event.event_id);

  if (event.actual_cost_total > event.estimated_cost_total || event.variance_percentage > 10) badges.add("Over Budget");
  if (objectives.some((objective) => objective.status === "Behind Commitment" || objective.status === "Missed")) badges.add("Behind Commitment");
  if (getFilteredEvents([event], "failed-sync").length > 0) badges.add("Sync Issue");
  if (
    event.overdue_items.length > 0 ||
    createReminderQueue([event], reminders).some((reminder) => reminder.event_id === event.event_id && (reminder.status === "Overdue" || reminder.status === "Escalated")) ||
    getFilteredEvents([event], "duplicate-review").length > 0
  ) {
    badges.add("Needs Review");
  }
  if (
    getFilteredEvents([event], "missing-attendee-list").length > 0 ||
    getFilteredEvents([event], "missing-cost-reconciliation").length > 0 ||
    getFilteredEvents([event], "missing-contact-upload").length > 0 ||
    getFilteredEvents([event], "missing-conversation-upload").length > 0
  ) {
    badges.add("Missing Data");
  }

  if (badges.size === 0) badges.add("Healthy");
  return Array.from(badges);
}

function hasUpload(event: EventRecord, uploadType: string) {
  return getWorkflowData().uploads.some((upload) => upload.event_id === event.event_id && upload.upload_type === uploadType);
}

function isPastOrPostEvent(event: EventRecord) {
  return postEventStatuses.includes(event.approval_status) || new Date(`${event.event_end_date}T23:59:59`) < currentDate;
}

function isNonMeasurable(event: EventRecord) {
  const objectives = getWorkflowData().objectives.filter((objective) => objective.event_id === event.event_id);
  return (
    event.event_tier === "Non-Measurable" ||
    event.event_type === "Internal Enablement" ||
    event.risk_flags.includes("Non-Measurable Event") ||
    (objectives.length > 0 && objectives.every((objective) => !objective.expected_yes_no || objective.status === "Not Measurable"))
  );
}

function isMarketingListOnlyEvent(event: EventRecord) {
  if (event.event_type === "Marketing List Build" || event.risk_flags.includes("Marketing-List-Only Event")) return true;
  const objectives = getWorkflowData().objectives.filter((objective) => objective.event_id === event.event_id);
  const measurableObjectives = objectives.filter((objective) => objective.expected_yes_no);
  return measurableObjectives.length > 0 && measurableObjectives.every((objective) => objective.objective_type === "Marketing List Growth");
}

export default App;
