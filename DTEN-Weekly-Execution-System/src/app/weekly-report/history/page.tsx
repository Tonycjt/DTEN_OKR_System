import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { weeklyTaskStatusTone, weeklyReportStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { getMonthIndexForQuarter, getQuarterMonthNames } from "@/lib/okr-calculations";
import { formatWeekRange } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

// ---- types ----------------------------------------------------------------

type CheckInRow = {
  id: string;
  previousValue: number;
  newValue: number;
  progressPercent: number;
  confidenceScore: number;
  status: string;
  blocker: string | null;
  note: string | null;
  keyResultId: string;
};

type ReportEntry = {
  reportId: string;
  weekStart: Date;
  weekEnd: Date;
  status: string;
  summary: string | null;
  thisWeekTasks: { id: string; content: string; status: string; progressPercent: number; blocker: string | null }[];
  nextWeekTasks: { id: string; content: string; status: string; progressPercent: number; blocker: string | null }[];
  checkInsForGroup: CheckInRow[];
  comments: { id: string; authorName: string; body: string }[];
  review: { decision: string; comment: string | null; managerName: string } | null;
};

type HistoryGroup = {
  key: string;
  krId: string;
  krTitle: string;
  objectiveId: string;
  objectiveTitle: string;
  monthIndex: number | null;
  monthlyTargetTitle: string | null;
  quarterMonthName: string | null;
  reports: ReportEntry[];
  mostRecentWeekStart: Date;
};

// ---- page -----------------------------------------------------------------

export default async function WeeklyReportHistoryPage() {
  const user = await requireUser();

  // Backend enforces personal scope: only the current user's reports are loaded.
  const reports = await prisma.weeklyReport.findMany({
    where: { userId: user.id },
    orderBy: { weekStart: "desc" },
    include: {
      weeklyTasks: { orderBy: [{ sectionType: "asc" }, { createdAt: "asc" }] },
      checkIns: {
        include: {
          keyResult: {
            select: {
              id: true,
              title: true,
              monthlyTargets: { select: { monthIndex: true, title: true } },
              objective: { select: { id: true, title: true, quarter: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      reviews: {
        include: { manager: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      comments: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // ---- build history groups -----------------------------------------------

  const groupsMap = new Map<string, HistoryGroup>();
  const noTargetEntries: ReportEntry[] = [];

  for (const report of reports) {
    const thisWeekTasks = report.weeklyTasks
      .filter((t) => t.sectionType === "THIS_WEEK")
      .map((t) => ({ id: t.id, content: t.content, status: t.status, progressPercent: t.progressPercent, blocker: t.blocker }));
    const nextWeekTasks = report.weeklyTasks
      .filter((t) => t.sectionType === "NEXT_WEEK")
      .map((t) => ({ id: t.id, content: t.content, status: t.status, progressPercent: t.progressPercent, blocker: t.blocker }));
    const comments = report.comments.map((c) => ({ id: c.id, authorName: c.author.name, body: c.body }));
    const review = report.reviews[0]
      ? { decision: report.reviews[0].decision, comment: report.reviews[0].comment, managerName: report.reviews[0].manager.name }
      : null;

    if (report.checkIns.length === 0) {
      // Report with tasks but no KR updates → no-target bucket
      if (report.weeklyTasks.length > 0) {
        noTargetEntries.push({
          reportId: report.id,
          weekStart: report.weekStart,
          weekEnd: report.weekEnd,
          status: report.status,
          summary: report.summary,
          thisWeekTasks,
          nextWeekTasks,
          checkInsForGroup: [],
          comments,
          review,
        });
      }
      continue;
    }

    // Track which (kr, monthIndex) groups this report has already been added to,
    // so we don't add the same report twice to the same group.
    const addedToKeys = new Set<string>();

    for (const checkIn of report.checkIns) {
      const kr = checkIn.keyResult;
      const monthIdx = getMonthIndexForQuarter(kr.objective.quarter, report.weekStart);
      const key = monthIdx != null ? `${kr.id}:${monthIdx}` : `${kr.id}:null`;

      if (!groupsMap.has(key)) {
        const monthlyTarget = monthIdx != null ? kr.monthlyTargets.find((mt) => mt.monthIndex === monthIdx) ?? null : null;
        const quarterMonthName =
          monthIdx != null ? getQuarterMonthNames(kr.objective.quarter)[monthIdx - 1] : null;

        groupsMap.set(key, {
          key,
          krId: kr.id,
          krTitle: kr.title,
          objectiveId: kr.objective.id,
          objectiveTitle: kr.objective.title,
          monthIndex: monthIdx,
          monthlyTargetTitle: monthlyTarget?.title ?? null,
          quarterMonthName,
          reports: [],
          mostRecentWeekStart: report.weekStart,
        });
      }

      if (!addedToKeys.has(key)) {
        addedToKeys.add(key);
        const group = groupsMap.get(key)!;

        const checkInsForGroup = report.checkIns
          .filter((ci) => ci.keyResultId === kr.id)
          .map((ci) => ({
            id: ci.id,
            previousValue: ci.previousValue,
            newValue: ci.newValue,
            progressPercent: ci.progressPercent,
            confidenceScore: ci.confidenceScore,
            status: ci.status,
            blocker: ci.blocker,
            note: ci.note,
            keyResultId: ci.keyResultId,
          }));

        group.reports.push({
          reportId: report.id,
          weekStart: report.weekStart,
          weekEnd: report.weekEnd,
          status: report.status,
          summary: report.summary,
          thisWeekTasks,
          nextWeekTasks,
          checkInsForGroup,
          comments,
          review,
        });

        if (report.weekStart > group.mostRecentWeekStart) {
          group.mostRecentWeekStart = report.weekStart;
        }
      }
    }
  }

  const sortedGroups = [...groupsMap.values()].sort(
    (a, b) => b.mostRecentWeekStart.getTime() - a.mostRecentWeekStart.getTime()
  );

  // ---- render ---------------------------------------------------------------

  const hasAnyHistory = sortedGroups.length > 0 || noTargetEntries.length > 0;

  return (
    <div className="stack">
      <PageHeader
        title="Weekly Report History"
        description={`All historical weekly reports for ${user.name}, grouped by monthly target and KR.`}
      />

      {!hasAnyHistory ? (
        <Card>
          <CardContent>No weekly reports yet. Submit your first weekly report to start building history.</CardContent>
        </Card>
      ) : null}

      {sortedGroups.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <div className="stack">
              <div className="table-actions">
                <h2>
                  {group.monthlyTargetTitle
                    ? `${group.quarterMonthName} Goal: ${group.monthlyTargetTitle}`
                    : group.quarterMonthName
                      ? `${group.quarterMonthName} (No Goal Set)`
                      : "Outside Quarter Period"}
                </h2>
              </div>
              <p className="muted">
                KR:{" "}
                <Link href={`/key-results/${group.krId}`} className="link">
                  {group.krTitle}
                </Link>
                {" · "}
                <Link href={`/objectives/${group.objectiveId}`} className="link">
                  {group.objectiveTitle}
                </Link>
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="stack">
              {group.reports.map((entry) => (
                <ReportHistoryEntry key={entry.reportId} entry={entry} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {noTargetEntries.length > 0 ? (
        <Card>
          <CardHeader>
            <h2>No Monthly Target</h2>
            <p className="muted">Reports with tasks but no KR updates in this period.</p>
          </CardHeader>
          <CardContent>
            <div className="stack">
              {noTargetEntries.map((entry) => (
                <ReportHistoryEntry key={entry.reportId} entry={entry} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---- sub-component (still server-rendered) --------------------------------

function ReportHistoryEntry({ entry }: { entry: ReportEntry }) {
  return (
    <div className="history-entry">
      {/* Week header */}
      <div className="history-entry-header">
        <span className="history-entry-week">{formatWeekRange(entry.weekStart, entry.weekEnd)}</span>
        <Badge tone={weeklyReportStatusTone(entry.status as Parameters<typeof weeklyReportStatusTone>[0])}>
          {formatEnumLabel(entry.status)}
        </Badge>
      </div>

      {entry.summary ? <p className="muted history-summary">{entry.summary}</p> : null}

      <div className="grid grid-2">
        {/* Tasks */}
        <div className="stack">
          {entry.thisWeekTasks.length > 0 ? (
            <div className="history-subsection">
              <h4 className="history-section-title">This Week&apos;s Tasks</h4>
              <div className="history-task-list">
                {entry.thisWeekTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          ) : null}

          {entry.nextWeekTasks.length > 0 ? (
            <div className="history-subsection">
              <h4 className="history-section-title">Next Week&apos;s Tasks</h4>
              <div className="history-task-list">
                {entry.nextWeekTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          ) : null}

          {entry.thisWeekTasks.length === 0 && entry.nextWeekTasks.length === 0 ? (
            <p className="muted">No tasks recorded this week.</p>
          ) : null}
        </div>

        {/* KR updates + review + comments */}
        <div className="stack">
          {entry.checkInsForGroup.length > 0 ? (
            <div className="history-subsection">
              <h4 className="history-section-title">KR Update</h4>
              <div className="history-task-list">
                {entry.checkInsForGroup.map((ci) => (
                  <div key={ci.id} className="history-kr-update">
                    <div className="history-kr-update-values">
                      <span>
                        <strong>{ci.previousValue}</strong> → <strong>{ci.newValue}</strong>
                      </span>
                      <span className="muted">{ci.progressPercent}% progress</span>
                      <Badge tone={workStatusTone(ci.status as Parameters<typeof workStatusTone>[0])}>
                        {formatEnumLabel(ci.status)}
                      </Badge>
                      <span className="muted">Confidence: {ci.confidenceScore}/5</span>
                    </div>
                    {ci.note ? <p className="muted">Note: {ci.note}</p> : null}
                    {ci.blocker ? <p className="muted notice-danger-inline">Blocker: {ci.blocker}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {entry.review ? (
            <div className="history-subsection">
              <h4 className="history-section-title">Review</h4>
              <div className="history-review">
                <div className="history-review-meta">
                  <Badge tone={entry.review.decision === "APPROVED" ? "success" : entry.review.decision === "NEEDS_FOLLOW_UP" ? "warning" : "danger"}>
                    {formatEnumLabel(entry.review.decision)}
                  </Badge>
                  <span className="muted">{entry.review.managerName}</span>
                </div>
                {entry.review.comment ? <p className="muted">{entry.review.comment}</p> : null}
              </div>
            </div>
          ) : null}

          {entry.comments.length > 0 ? (
            <div className="history-subsection">
              <h4 className="history-section-title">Comments</h4>
              <div className="history-comments">
                {entry.comments.map((c) => (
                  <div key={c.id} className="history-comment">
                    <strong>{c.authorName}:</strong> <span className="muted">{c.body}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
}: {
  task: { id: string; content: string; status: string; progressPercent: number; blocker: string | null };
}) {
  return (
    <div className="history-task">
      <div className="history-task-header">
        <span className="history-task-content">{task.content}</span>
        <Badge tone={weeklyTaskStatusTone(task.status as Parameters<typeof weeklyTaskStatusTone>[0])}>
          {formatEnumLabel(task.status)}
        </Badge>
      </div>
      <div className="history-task-progress">
        <ProgressBar value={task.progressPercent} />
        <span className="muted">{task.progressPercent}%</span>
      </div>
      {task.blocker ? <p className="muted notice-danger-inline">Blocker: {task.blocker}</p> : null}
    </div>
  );
}
