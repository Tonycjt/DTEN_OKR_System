import Link from "next/link";
import type { FollowUpStatus, Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pacingStatusTone, weeklyReportStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { reviewOwnerWhere } from "@/lib/review-routing";
import { formatShortDate, formatWeekRange } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type SearchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const searchTypes = ["ALL", "OBJECTIVES", "KEY_RESULTS", "REPORTS", "COMMENTS", "FOLLOW_UPS"] as const;
type SearchType = (typeof searchTypes)[number];
type BadgeTone = "danger" | "info" | "neutral" | "success" | "warning";

type SearchResult = {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  badge?: string;
  badgeTone?: BadgeTone;
};

function asBadgeTone(tone: string): BadgeTone {
  return tone as BadgeTone;
}

function followUpBadgeTone(status: FollowUpStatus): BadgeTone {
  if (status === "DONE") {
    return "success";
  }

  if (status === "CANCELLED") {
    return "neutral";
  }

  return "warning";
}

function firstSearchParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  const firstValue = Array.isArray(value) ? value[0] : value;
  const text = firstValue?.trim();
  return text ? text : undefined;
}

function parseSearchType(value?: string): SearchType {
  return value && searchTypes.includes(value as SearchType) ? (value as SearchType) : "ALL";
}

function andObjectiveWhere(...clauses: Prisma.ObjectiveWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function andKeyResultWhere(...clauses: Prisma.KeyResultWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function andWeeklyReportWhere(...clauses: Prisma.WeeklyReportWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function noneObjectiveWhere(): Prisma.ObjectiveWhereInput {
  return { id: "__no_matching_objectives__" };
}

function noneKeyResultWhere(): Prisma.KeyResultWhereInput {
  return { id: "__no_matching_key_results__" };
}

function noneWeeklyReportWhere(): Prisma.WeeklyReportWhereInput {
  return { id: "__no_matching_weekly_reports__" };
}

function containsText(query: string) {
  return {
    contains: query,
    mode: "insensitive" as const,
  };
}

function shouldRunSearch(query: string) {
  return query.trim().length >= 2;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const query = firstSearchParam(params, "q") ?? "";
  const searchType = parseSearchType(firstSearchParam(params, "type"));
  const isCompanyViewer = user.role === "ADMIN" || user.role === "CEO" || user.role === "EXECUTIVE";
  const isDepartmentViewer = user.role === "DEPARTMENT_HEAD" && Boolean(user.departmentId);
  const isManager = user.role === "MANAGER";

  const userScopeWhere: Prisma.UserWhereInput = {
    isActive: true,
    ...(isCompanyViewer ? {} : isDepartmentViewer ? { departmentId: user.departmentId } : isManager ? reviewOwnerWhere(user.id) : { id: user.id }),
  };

  const scopedUsers = await prisma.user.findMany({
    where: userScopeWhere,
    select: { id: true },
  });
  const scopedUserIds = scopedUsers.map((scopedUser) => scopedUser.id);
  const ownerScopeWhere = scopedUserIds.length > 0 ? { ownerId: { in: scopedUserIds } } : noneKeyResultWhere();
  const objectiveOwnerScopeWhere = scopedUserIds.length > 0 ? { ownerId: { in: scopedUserIds } } : noneObjectiveWhere();
  const reportScopeWhere = scopedUserIds.length > 0 ? { userId: { in: scopedUserIds } } : noneWeeklyReportWhere();
  const objectiveScopeWhere: Prisma.ObjectiveWhereInput = isCompanyViewer
    ? {}
    : isDepartmentViewer
      ? { departmentId: user.departmentId }
      : objectiveOwnerScopeWhere;
  const keyResultScopeWhere: Prisma.KeyResultWhereInput = ownerScopeWhere;

  const canSearch = shouldRunSearch(query);
  const text = containsText(query);

  const [objectives, keyResults, reports, comments, followUps] = canSearch
    ? await Promise.all([
        searchType === "ALL" || searchType === "OBJECTIVES"
          ? prisma.objective.findMany({
              where: andObjectiveWhere(objectiveScopeWhere, {
                OR: [{ title: text }, { description: text }, { quarter: text }],
              }),
              orderBy: { updatedAt: "desc" },
              take: 8,
              include: { owner: true, department: true, team: true },
            })
          : Promise.resolve([]),
        searchType === "ALL" || searchType === "KEY_RESULTS"
          ? prisma.keyResult.findMany({
              where: andKeyResultWhere(keyResultScopeWhere, {
                OR: [{ title: text }, { metricName: text }, { objective: { title: text } }],
              }),
              orderBy: { updatedAt: "desc" },
              take: 8,
              include: { owner: true, objective: true },
            })
          : Promise.resolve([]),
        searchType === "ALL" || searchType === "REPORTS"
          ? prisma.weeklyReport.findMany({
              where: andWeeklyReportWhere(reportScopeWhere, {
                OR: [{ summary: text }, { user: { name: text } }, { priorities: { some: { content: text } } }],
              }),
              orderBy: { weekStart: "desc" },
              take: 8,
              include: { user: true, priorities: true },
            })
          : Promise.resolve([]),
        searchType === "ALL" || searchType === "COMMENTS"
          ? prisma.comment.findMany({
              where: {
                body: text,
                OR: [
                  { keyResult: keyResultScopeWhere },
                  { weeklyReport: reportScopeWhere },
                  { authorId: user.id },
                ],
              },
              orderBy: { createdAt: "desc" },
              take: 8,
              include: {
                author: true,
                keyResult: true,
                weeklyReport: {
                  include: { user: true },
                },
              },
            })
          : Promise.resolve([]),
        searchType === "ALL" || searchType === "FOLLOW_UPS"
          ? prisma.followUp.findMany({
              where: {
                content: text,
                OR: [
                  { ownerId: { in: scopedUserIds } },
                  { assignedById: { in: scopedUserIds } },
                  { ownerId: user.id },
                  { assignedById: user.id },
                ],
              },
              orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
              take: 8,
              include: { owner: true, assignedBy: true },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  const results: SearchResult[] = [
    ...objectives.map((objective) => ({
      id: objective.id,
      type: "Objective",
      title: objective.title,
      description: `${objective.owner.name} / ${objective.department?.name ?? "No department"} / ${objective.quarter}`,
      href: `/objectives/${objective.id}`,
      badge: formatEnumLabel(objective.status),
      badgeTone: asBadgeTone(workStatusTone(objective.status)),
    })),
    ...keyResults.map((kr) => ({
      id: kr.id,
      type: "Key Result",
      title: kr.title,
      description: `${kr.objective.title} / ${kr.owner?.name ?? "No owner"} / Confidence ${kr.confidenceScore}/5`,
      href: `/key-results/${kr.id}`,
      badge: formatEnumLabel(kr.pacingStatus),
      badgeTone: asBadgeTone(pacingStatusTone(kr.pacingStatus)),
    })),
    ...reports.map((report) => ({
      id: report.id,
      type: "Weekly Report",
      title: `${report.user.name} / ${formatWeekRange(report.weekStart, report.weekEnd)}`,
      description: report.summary ?? `${report.priorities.length} priorities in this report.`,
      href: report.userId === user.id ? "/weekly-report/history" : "/reviews/pending",
      badge: formatEnumLabel(report.status),
      badgeTone: asBadgeTone(weeklyReportStatusTone(report.status)),
    })),
    ...comments.map((comment) => ({
      id: comment.id,
      type: "Comment",
      title: comment.keyResult?.title ?? `${comment.weeklyReport?.user.name ?? "Weekly report"} comment`,
      description: `${comment.author.name} / ${comment.body}`,
      href: comment.keyResultId ? `/key-results/${comment.keyResultId}` : comment.weeklyReport?.userId === user.id ? "/weekly-report/history" : "/reviews/pending",
      badge: formatShortDate(comment.createdAt),
      badgeTone: "info" as const,
    })),
    ...followUps.map((followUp) => ({
      id: followUp.id,
      type: "Follow-up",
      title: followUp.content,
      description: `Owner: ${followUp.owner.name} / Assigned by ${followUp.assignedBy.name}`,
      href: followUp.sourceObjectType === "KEY_RESULT" ? `/key-results/${followUp.sourceObjectId}` : "/dashboard",
      badge: formatEnumLabel(followUp.status),
      badgeTone: followUpBadgeTone(followUp.status),
    })),
  ];

  return (
    <div className="stack">
      <PageHeader title="Search" description="Find visible OKRs, KRs, reports, comments, and follow-ups." />

      <Card>
        <CardHeader>
          <h2>Advanced Search</h2>
          <p>Results stay inside your role and review scope.</p>
        </CardHeader>
        <CardContent>
          <form className="search-form" method="get">
            <label className="field search-query-field">
              <span>Search</span>
              <input defaultValue={query} minLength={2} name="q" placeholder="Search execution updates, blockers, KRs, owners..." />
            </label>
            <label className="field">
              <span>Type</span>
              <select defaultValue={searchType} name="type">
                {searchTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === "ALL" ? "All result types" : formatEnumLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <div className="search-actions">
              <Button type="submit">Search</Button>
              <LinkButton href="/search" tone="secondary">
                Reset
              </LinkButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Results</h2>
          <p>{canSearch ? `${results.length} matches for "${query}".` : "Enter at least two characters to search."}</p>
        </CardHeader>
        <CardContent>
          <div className="route-grid">
            {results.map((result) => (
              <div className="route-item" key={`${result.type}-${result.id}`}>
                <span>
                  <Link href={result.href}>
                    <strong>{result.title}</strong>
                  </Link>
                  <br />
                  <span className="muted">
                    {result.type} / {result.description}
                  </span>
                </span>
                <span className="table-actions">
                  {result.badge ? <Badge tone={result.badgeTone}>{result.badge}</Badge> : null}
                  <Link href={result.href}>Open</Link>
                </span>
              </div>
            ))}
            {canSearch && results.length === 0 ? <div className="route-item">No matching results in your visible scope.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
