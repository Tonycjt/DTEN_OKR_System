import type { Approval, AuditLog, CheckIn, Comment, KeyResult, Notification, Objective, OkrChangeRequest, WeeklyReport } from "@/types";

export type LocalOkrStore = {
  objectives: Objective[];
  keyResults: KeyResult[];
  approvals: Approval[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  checkIns: CheckIn[];
  weeklyReports: WeeklyReport[];
  comments: Comment[];
  okrChangeRequests: OkrChangeRequest[];
};

const storageKey = "dten-weekly-execution-local-okrs";

export function createEmptyLocalOkrStore(): LocalOkrStore {
  return {
    objectives: [],
    keyResults: [],
    approvals: [],
    notifications: [],
    auditLogs: [],
    checkIns: [],
    weeklyReports: [],
    comments: [],
    okrChangeRequests: [],
  };
}

export function loadLocalOkrStore(): LocalOkrStore {
  if (typeof window === "undefined") {
    return createEmptyLocalOkrStore();
  }

  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return createEmptyLocalOkrStore();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<LocalOkrStore>;

    return {
      objectives: parsedValue.objectives ?? [],
      keyResults: parsedValue.keyResults ?? [],
      approvals: parsedValue.approvals ?? [],
      notifications: parsedValue.notifications ?? [],
      auditLogs: parsedValue.auditLogs ?? [],
      checkIns: parsedValue.checkIns ?? [],
      weeklyReports: parsedValue.weeklyReports ?? [],
      comments: parsedValue.comments ?? [],
      okrChangeRequests: parsedValue.okrChangeRequests ?? [],
    };
  } catch {
    return createEmptyLocalOkrStore();
  }
}

export function saveLocalOkrStore(store: LocalOkrStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(store));
  window.dispatchEvent(new Event("dten-local-okrs-updated"));
}

export function upsertLocalObjective(store: LocalOkrStore, objective: Objective) {
  return {
    ...store,
    objectives: [objective, ...store.objectives.filter((item) => item.id !== objective.id)],
  };
}

export function replaceLocalKeyResults(store: LocalOkrStore, objectiveId: string, keyResults: KeyResult[]) {
  return {
    ...store,
    keyResults: [...store.keyResults.filter((item) => item.objectiveId !== objectiveId), ...keyResults],
  };
}

export function addLocalApproval(store: LocalOkrStore, approval: Approval) {
  return {
    ...store,
    approvals: [approval, ...store.approvals],
  };
}

export function upsertLocalApproval(store: LocalOkrStore, approval: Approval) {
  return {
    ...store,
    approvals: [approval, ...store.approvals.filter((item) => item.id !== approval.id)],
  };
}

export function addLocalNotification(store: LocalOkrStore, notification: Notification) {
  return {
    ...store,
    notifications: [notification, ...store.notifications],
  };
}

export function upsertLocalNotification(store: LocalOkrStore, notification: Notification) {
  return {
    ...store,
    notifications: [notification, ...store.notifications.filter((item) => item.id !== notification.id)],
  };
}

export function addLocalAuditLog(store: LocalOkrStore, auditLog: AuditLog) {
  return {
    ...store,
    auditLogs: [auditLog, ...store.auditLogs],
  };
}

export function upsertLocalCheckIn(store: LocalOkrStore, checkIn: CheckIn) {
  return {
    ...store,
    checkIns: [checkIn, ...store.checkIns.filter((item) => item.id !== checkIn.id)],
  };
}

export function replaceLocalCheckInsForUserWeek(store: LocalOkrStore, userId: string, weekStartDate: string, weekEndDate: string, checkIns: CheckIn[]) {
  return {
    ...store,
    checkIns: [
      ...checkIns,
      ...store.checkIns.filter(
        (item) => !(item.createdByUserId === userId && item.checkInDate >= weekStartDate && item.checkInDate <= weekEndDate),
      ),
    ],
  };
}

export function upsertLocalWeeklyReport(store: LocalOkrStore, weeklyReport: WeeklyReport) {
  return {
    ...store,
    weeklyReports: [
      weeklyReport,
      ...store.weeklyReports.filter(
        (item) =>
          item.id !== weeklyReport.id &&
          !(
            item.userId === weeklyReport.userId &&
            item.weekStartDate === weeklyReport.weekStartDate &&
            item.weekEndDate === weeklyReport.weekEndDate
          ),
      ),
    ],
  };
}

export function addLocalComment(store: LocalOkrStore, comment: Comment) {
  return {
    ...store,
    comments: [comment, ...store.comments],
  };
}

export function addLocalOkrChangeRequest(store: LocalOkrStore, changeRequest: OkrChangeRequest) {
  return {
    ...store,
    okrChangeRequests: [changeRequest, ...store.okrChangeRequests],
  };
}

export function upsertLocalOkrChangeRequest(store: LocalOkrStore, changeRequest: OkrChangeRequest) {
  return {
    ...store,
    okrChangeRequests: [changeRequest, ...store.okrChangeRequests.filter((item) => item.id !== changeRequest.id)],
  };
}
