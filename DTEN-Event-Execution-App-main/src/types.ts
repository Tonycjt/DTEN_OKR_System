export type Role =
  | "Event Owner"
  | "Sales Rep"
  | "Regional Sales Leader"
  | "Channel Leader"
  | "Department Head"
  | "Marketing Ops"
  | "Finance / CFO"
  | "Leadership"
  | "Technical Team"
  | "Admin";

export const EVENT_TYPES = [
  "Field Event",
  "Webinar",
  "Partner Event",
  "Executive Briefing",
  "Trade Show",
  "Customer Advisory Board",
  "Internal Enablement",
  "Marketing List Build",
] as const;

export const EVENT_TIERS = ["Tier 1", "Tier 2", "Tier 3", "Non-Measurable"] as const;

export const APPROVAL_STATUSES = [
  "Draft",
  "Submitted",
  "Needs Revision",
  "Functional Review",
  "Finance Review",
  "Approved",
  "Rejected",
  "Locked",
  "Event Completed",
  "Post-Event Reporting",
  "HubSpot Sync In Progress",
  "Scorecard Active",
  "Cost Reconciliation Pending",
  "Completed",
  "Archived",
] as const;

export const COST_CATEGORIES = [
  "Participation Fee",
  "Travel",
  "Shipping",
  "Marketing Materials",
  "Labor / Contractor",
  "Partner Contribution",
  "Other",
] as const;

export const OBJECTIVE_CATEGORIES = [
  "Pipeline Created",
  "Qualified Meetings",
  "Executive Meetings",
  "MQLs",
  "Partner Influence",
  "Customer Retention",
  "Marketing List Growth",
  "Brand Awareness",
  "Non-Measurable",
] as const;

export const PRODUCT_INTEREST = [
  "D7X",
  "D7X Dual",
  "AI Board",
  "Orbit",
  "DTEN Bar / BYOD",
  "DTEN Vue Pro",
  "DTEN Mate",
  "Services / Warranty",
  "Other",
] as const;

export const CONSENT_STATUSES = ["Consented", "Consent Unknown", "Opted Out / Unsubscribed", "Legitimate Interest", "Not Required"] as const;

export const LEAD_QUALITY = ["High", "Medium", "Low"] as const;

export const SYNC_STATUSES = ["Not Ready", "Ready to sync", "Held for review", "Failed", "Synced", "Suppressed / do not market", "DTEN.me / SkyMap only"] as const;

export const MATCH_STATUSES = ["Not Checked", "Matched", "Possible Duplicate", "Duplicate", "No Match", "Manual Review", "Conflict"] as const;

export const OBJECTIVE_STATUSES = ["Not Started", "On Track", "Behind Commitment", "Met", "Exceeded", "Missed", "Not Measurable"] as const;

export const UPLOAD_STATUSES = ["Queued", "Processing", "Needs Review", "Complete", "Failed", "Held"] as const;

export const REMINDER_STATUSES = ["Open", "Overdue", "Escalated", "Completed"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type EventTier = (typeof EVENT_TIERS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type CostCategory = (typeof COST_CATEGORIES)[number];
export type ObjectiveCategory = (typeof OBJECTIVE_CATEGORIES)[number];
export type ProductInterest = (typeof PRODUCT_INTEREST)[number];
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export type LeadQuality = (typeof LEAD_QUALITY)[number];
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export type Region = "West" | "East" | "EMEA" | "APAC";

export type Event = {
  event_id: string;
  event_name: string;
  event_start_date: string;
  event_end_date: string;
  location: string;
  region: Region;
  event_type: EventType;
  event_tier: EventTier;
  event_owner: string;
  functional_owner: string;
  funding_source: string;
  approval_status: ApprovalStatus;
  objective_lock_status: "Unlocked" | "Locked" | "Exception Requested";
  estimated_cost_total: number;
  actual_cost_total: number;
  variance_amount: number;
  variance_percentage: number;
  variance_explanation: string;
  created_by: string;
  created_date: string;
  approved_by_functional_leader: string | null;
  approved_by_department_head: string | null;
  approved_by_finance: string | null;
  approved_date: string | null;
  risk_flags: string[];
  overdue_items: string[];
};

export type EventObjective = {
  objective_id: string;
  event_id: string;
  objective_type: ObjectiveCategory;
  expected_yes_no: boolean;
  commitment_value: number | null;
  actual_value: number | null;
  status: ObjectiveStatus;
  notes: string;
  override_request_status?: "None" | "Requested" | "Approved";
  override_requested_value?: number | null;
  override_request_reason?: string;
  override_requested_by?: string;
  override_requested_at?: string;
  override_approved_by?: string;
  override_approved_at?: string;
};

export type EventCostLine = {
  cost_line_id: string;
  event_id: string;
  cost_category: CostCategory;
  estimated_amount: number;
  actual_amount: number;
  vendor: string;
  notes: string;
};

export type EventContact = {
  contact_record_id: string;
  event_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  country: string;
  region: Region;
  capture_method: "Badge Scan" | "Manual Entry" | "CSV Upload" | "Webinar Registration" | "Sales Nomination" | "Partner List";
  consent_status: ConsentStatus;
  upload_batch_id: string;
  skymap_match_status: MatchStatus;
  hubspot_sync_status: SyncStatus;
  hubspot_contact_id: string | null;
  error_message: string | null;
};

export type EventConversation = {
  conversation_id: string;
  event_id: string;
  contact_email: string;
  contact_name: string;
  company: string;
  title: string;
  conversation_owner: string;
  conversation_summary: string;
  product_interest: ProductInterest;
  is_sales_lead: boolean;
  lead_quality: LeadQuality;
  buying_timeline: "0-3 months" | "3-6 months" | "6-12 months" | "12+ months" | "No active project";
  estimated_opportunity_size: number | null;
  next_step: string;
  follow_up_owner: string;
  follow_up_date: string | null;
  hubspot_sync_status: SyncStatus;
  hubspot_lead_id: string | null;
  error_message: string | null;
};

export type UploadBatch = {
  upload_batch_id: string;
  event_id: string;
  upload_type: "Registration" | "Attendance" | "Conversation Notes" | "Marketing List" | "Sales Nomination";
  uploaded_by: string;
  upload_date: string;
  total_records: number;
  valid_records: number;
  duplicate_records: number;
  possible_duplicate_records: number;
  failed_records: number;
  synced_records: number;
  held_for_review_records: number;
  status: UploadStatus;
};

export type ActivityLog = {
  log_id: string;
  event_id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
  related_object?: string;
  override_audit?: {
    changed_by: string;
    change_timestamp: string;
    previous_value: string;
    new_value: string;
    reason: string;
    approver: string;
  };
};

export type Reminder = {
  reminder_id: string;
  event_id: string;
  owner: string;
  reminder_type:
    | "Approval"
    | "Budget Variance"
    | "Duplicate Review"
    | "HubSpot Sync"
    | "Sales Follow-Up"
    | "Scorecard Review"
    | "Contact Upload"
    | "Conversation Upload"
    | "Lead Status Update"
    | "Cost Reconciliation"
    | "Missing HubSpot Fields";
  due_date: string;
  status: ReminderStatus;
  escalation_owner: string;
};

export type EventStage = ApprovalStatus | "Approval" | "Execution" | "Post Event" | "Closed";

export type EventStatus = "On Track" | "At Risk" | "Blocked" | "Complete";

export type EventRecord = Event & {
  id: string;
  name: string;
  type: EventType;
  city: string;
  owner: string;
  stage: EventStage;
  status: EventStatus;
  date: string;
  budget: number;
  forecastPipeline: number;
  actualPipeline: number;
  registrations: number;
  attendees: number;
  leads: number;
  mqls: number;
  duplicates: number;
  hubspotStatus: SyncStatus;
  skymapRoute: string;
  approval: {
    marketing: boolean;
    finance: boolean;
    sales: boolean;
  };
  checklist: string[];
  notes: string;
};

export type DuplicateGroup = {
  id: string;
  eventId: string;
  primary: string;
  matched: string;
  confidence: number;
  reason: string;
  action: "Review" | "Merge" | "Ignore";
};
