import { checkIns, objectives, quarters, weeklyReports } from "@/mock-data";
import { deriveOkrUpdateStatus } from "@/lib/weekly-update-status";
import type { CheckIn, Objective, User, WeeklyReport } from "@/types";

export { deriveOkrUpdateStatus, isValidCheckIn } from "@/lib/weekly-update-status";

export type WeekWindow = {
  week_start_date: string;
  week_end_date: string;
};

export type WeeklyReportSubmissionStatus = "submitted" | "missing" | "draft";

type ObjectiveSource = {
  objectives?: Objective[];
};

type CheckInSource = ObjectiveSource & {
  checkIns?: CheckIn[];
};

type WeeklyReportSource = {
  weeklyReports?: WeeklyReport[];
};

type WeekOptions = {
  week?: WeekWindow;
};

type ActiveObjectiveOptions = ObjectiveSource &
  WeekOptions & {
    quarterId?: string;
  };

type CheckInOptions = CheckInSource & WeekOptions;

type WeeklyReportOptions = WeeklyReportSource & WeekOptions;

type WeeklyComplianceOptions = CheckInSource &
  WeekOptions & {
    quarterId?: string;
    users?: User[];
  };

const defaultWeekStartDay = 1;
const defaultWeekEndDay = 5;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function getCurrentWeek(referenceDate: Date | string = new Date()): WeekWindow {
  const date = toUtcDateOnly(referenceDate);
  const day = date.getUTCDay();
  const daysSinceWeekStart = (day - defaultWeekStartDay + 7) % 7;
  const weekStart = addDays(date, -daysSinceWeekStart);
  const weekEnd = addDays(weekStart, defaultWeekEndDay - defaultWeekStartDay);

  return {
    week_start_date: formatDateOnly(weekStart),
    week_end_date: formatDateOnly(weekEnd),
  };
}

export function getActiveObjectivesForUser(userId: string, options: ActiveObjectiveOptions = {}) {
  const sourceObjectives = options.objectives ?? objectives;
  const activeQuarterId = options.quarterId ?? quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0]?.id;
  const week = options.week ?? getCurrentWeek();

  return sourceObjectives.filter((objective) => {
    return (
      objective.ownerUserId === userId &&
      objective.quarterId === activeQuarterId &&
      objective.isActive &&
      objective.approvalState === "Approved" &&
      !objective.archived &&
      overlapsWeek(objective, week)
    );
  });
}

export function getCheckInsForUserWeek(userId: string, options: CheckInOptions = {}) {
  const sourceCheckIns = options.checkIns ?? checkIns;
  const sourceObjectives = options.objectives ?? objectives;
  const week = options.week ?? getCurrentWeek();

  return sourceCheckIns.filter((checkIn) => {
    const objective = sourceObjectives.find((item) => item.id === checkIn.objectiveId);

    return (
      checkIn.createdByUserId === userId &&
      isDateInWeek(checkIn.checkInDate, week) &&
      (!objective || objective.ownerUserId === userId)
    );
  });
}

export function getWeeklyReportForWeek(userId: string, options: WeeklyReportOptions = {}) {
  const sourceReports = options.weeklyReports ?? weeklyReports;
  const week = options.week ?? getCurrentWeek();

  return sourceReports.find(
    (report) => report.userId === userId && report.weekStartDate === week.week_start_date && report.weekEndDate === week.week_end_date,
  );
}

export function getPreviousWeeklyReport(userId: string, options: WeeklyReportOptions = {}) {
  const sourceReports = options.weeklyReports ?? weeklyReports;
  const week = options.week ?? getCurrentWeek();

  return sourceReports
    .filter((report) => report.userId === userId && report.weekEndDate < week.week_start_date)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
}

export function getWeeklyReportStatusForUser(userId: string, options: WeeklyReportOptions = {}): WeeklyReportSubmissionStatus {
  const report = getWeeklyReportForWeek(userId, options);

  if (!report) {
    return "missing";
  }

  return report.submittedAt ? "submitted" : "draft";
}

export function getWeeklyUpdateCompliance(options: WeeklyComplianceOptions = {}) {
  const sourceUsers = options.users ?? [];
  const week = options.week ?? getCurrentWeek();
  const usersWithActiveOkrs = sourceUsers.filter((user) => getActiveObjectivesForUser(user.id, options).length > 0);

  if (usersWithActiveOkrs.length === 0) {
    return 0;
  }

  const updatedUsers = usersWithActiveOkrs.filter((user) => {
    const activeObjectives = getActiveObjectivesForUser(user.id, options);
    const userCheckIns = getCheckInsForUserWeek(user.id, { ...options, week });
    return deriveOkrUpdateStatus(activeObjectives, userCheckIns) === "Updated";
  });

  return Math.round((updatedUsers.length / usersWithActiveOkrs.length) * 100);
}

function overlapsWeek(objective: Objective, week: WeekWindow) {
  const activeFrom = objective.activeFrom ?? objective.createdAt.slice(0, 10);
  const activeTo = objective.activeTo ?? week.week_end_date;

  return activeFrom <= week.week_end_date && activeTo >= week.week_start_date;
}

function isDateInWeek(value: string, week: WeekWindow) {
  return value >= week.week_start_date && value <= week.week_end_date;
}

function toUtcDateOnly(value: Date | string) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
