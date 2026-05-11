export type UserRole = "Employee" | "Manager" | "Leadership" | "Admin";

export type ObjectiveLevel = "company" | "department" | "team" | "individual";

export type ObjectiveStatus = "Draft" | "Active" | "At Risk" | "Off Track" | "Completed" | "On Hold" | "Archived";

export type KeyResultStatus = "Not Started" | "On Track" | "At Risk" | "Off Track" | "Completed";

export type Confidence = "High" | "Medium" | "Low";

export type ApprovalState =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Changes Pending Re-approval"
  | "Archived";

export type Visibility =
  | "Company-wide"
  | "Leadership-only"
  | "Team-only"
  | "Manager visibility"
  | "Private to owner + manager";

export type KeyResultMetricType = "Percentage" | "Numeric increase" | "Numeric decrease" | "Milestone/manual";

export type RollupMode = "Manual" | "Auto from linked child objective";

export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

export type OkrUpdateStatus = "No Active OKRs" | "Not Updated" | "Partially Updated" | "Updated";

export type KRPacingStatus = "Ahead" | "On Pace" | "Behind" | "No Target";

export type MonthlyTarget = {
  id: string;
  monthLabel: string;
  targetValue: number;
  targetProgressPercent: number;
  notes?: string | null;
};

export type WeeklyPriorityFollowUpStatus = "Completed" | "Partially completed" | "Not completed" | "No longer relevant";
export type WeeklyPriorityFollowUpState = "completed" | "partially_completed" | "not_completed" | "no_longer_relevant";
export type TrackerLinkType = "google_doc" | "google_sheet" | "crm_report" | "dashboard" | "other";
export type WeeklyPriorityType = "linked_key_result" | "ad_hoc";
export type ManagerReviewStatus = "not_reviewed" | "reviewed" | "commented" | "needs_follow_up";
export type OkrChangeRequestStatus = "pending" | "approved" | "rejected";
export type OkrMaterialChangeType =
  | "objective_title"
  | "key_result_title"
  | "key_result_target"
  | "monthly_targets"
  | "add_key_result"
  | "remove_key_result"
  | "owner"
  | "visibility"
  | "alignment_link"
  | "rollup_link";

export type TrackerLink = {
  id: string;
  title: string;
  url: string;
  type: TrackerLinkType;
  addedByUserId: string;
  addedAt: string;
};

export type WeeklyPriority = {
  id: string;
  text: string;
  priorityRank: number;
  isTopPriority: boolean;
  linkedKeyResultId?: string | null;
  linkedObjectiveId?: string | null;
  priorityType: WeeklyPriorityType;
  trackerLinks: TrackerLink[];
  followUpStatus?: WeeklyPriorityFollowUpState | null;
  followUpNote?: string | null;
};

export type NotificationChannel = "in_app" | "email";

export type NotificationStatus = "Queued" | "Sent" | "Read" | "Failed";

export type NotificationType =
  | "approval_needed"
  | "approval_approved"
  | "approval_rejected"
  | "weekly_update_reminder"
  | "monday_weekly_update_reminder"
  | "incomplete_weekly_update_reminder"
  | "wednesday_incomplete_update_reminder"
  | "missed_weekly_update"
  | "friday_missed_update_reminder"
  | "manager_attention_needed"
  | "due_date_approaching"
  | "quarter_close_reminder"
  | "comment_created"
  | "comment_replied"
  | "rollup_state_changed"
  | "weekly_report_comment";

export type ResourceType = "objective" | "key_result" | "weekly_report";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId: string;
  teamId: string;
  primaryManagerId: string | null;
  localManagerId?: string | null;
  title: string;
  location: string;
  isActive: boolean;
};

export type Department = {
  id: string;
  name: string;
  ownerUserId: string;
  archived: boolean;
};

export type Team = {
  id: string;
  name: string;
  departmentId: string;
  leaderUserId: string;
  archived: boolean;
};

export type Quarter = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  archived: boolean;
};

export type Objective = {
  id: string;
  title: string;
  description: string;
  ownerUserId: string;
  level: ObjectiveLevel;
  departmentId: string | null;
  teamId: string | null;
  quarterId: string;
  visibility: Visibility;
  status: ObjectiveStatus;
  confidence: Confidence;
  score: number;
  approvalState: ApprovalState;
  parentObjectiveId?: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  activeFrom?: string | null;
  activeTo?: string | null;
  isActive: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KeyResult = {
  id: string;
  objectiveId: string;
  title: string;
  description: string;
  metricType: KeyResultMetricType;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  progressPercent: number;
  status: KeyResultStatus;
  ownerUserId: string;
  dueDate?: string | null;
  rollupMode: RollupMode;
  linkedChildObjectiveId?: string | null;
  monthlyTargets: MonthlyTarget[];
  trackerLinks: TrackerLink[];
};

export type Approval = {
  id: string;
  objectiveId: string;
  approverUserId: string;
  approvalStatus: ApprovalStatus;
  approvalNote?: string | null;
  approvalTimestamp?: string | null;
  createdAt: string;
};

export type WeeklyPriorityFollowUp = {
  id: string;
  previousPriorityText: string;
  status: WeeklyPriorityFollowUpStatus;
  note?: string | null;
};

export type WeeklyReport = {
  id: string;
  userId: string;
  quarterId: string;
  weekStartDate: string;
  weekEndDate: string;
  okrUpdateStatus: OkrUpdateStatus;
  lastWeekPriorityFollowUps: WeeklyPriorityFollowUp[];
  weeklyPriorities: WeeklyPriority[];
  /**
   * Legacy compatibility for current prototype UI. New work should use weeklyPriorities.
   */
  nextWeekPriorities: [string, string?, string?];
  challengesComments?: string | null;
  managerReviewStatus: ManagerReviewStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  managerReviewNote?: string | null;
  submittedAt: string;
  updatedAt: string;
};

export type CheckIn = {
  id: string;
  resourceType: "objective" | "key_result";
  objectiveId: string;
  keyResultId?: string | null;
  checkInDate: string;
  progressUpdate: string;
  objectiveStatus?: ObjectiveStatus | null;
  keyResultStatus?: KeyResultStatus | null;
  confidence?: Confidence | null;
  progressPercent?: number | null;
  currentValue?: number | null;
  notes?: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  parentCommentId?: string | null;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  archived: boolean;
};

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  resourceType: ResourceType;
  resourceId: string;
  channel: NotificationChannel;
  sentAt?: string | null;
  readAt?: string | null;
  status: NotificationStatus;
};

export type AuditLog = {
  id: string;
  actorUserId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type OkrChangeRequest = {
  id: string;
  objectiveId: string;
  requestedByUserId: string;
  approverUserId: string;
  status: OkrChangeRequestStatus;
  requestedChanges: Partial<{
    objectiveTitle: string;
    keyResultId: string;
    keyResultTitle: string;
    keyResultTargetValue: number;
    monthlyTargets: MonthlyTarget[];
    addKeyResult: KeyResult;
    removeKeyResultId: string;
    ownerUserId: string;
    visibility: Visibility;
    parentObjectiveId: string | null;
    linkedChildObjectiveId: string | null;
    materialChangeTypes: OkrMaterialChangeType[];
  }>;
  reason: string;
  managerNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
};
