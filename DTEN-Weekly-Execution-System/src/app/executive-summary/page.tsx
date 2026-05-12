import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { buildWeeklySummaryData } from "@/lib/dashboard-export";
import { formatEnumLabel } from "@/lib/format";
import { formatReviewCompletionRate } from "@/lib/risk-detection";
import { formatShortDate, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";

function averageConfidence(value: number | null) {
  return value == null ? "n/a" : `${value.toFixed(1)}/5`;
}

export default async function ExecutiveSummaryPage() {
  const user = await requireUser();
  const summary = await buildWeeklySummaryData(user);
  const weekEnd = getSundayWeekEnd(summary.weekStart);
  const reviewCompletion = formatReviewCompletionRate(summary.completedReviewCount, summary.reviewableReportCount);
  const topRisk = summary.riskKrs[0];

  return (
    <div className="stack">
      <PageHeader
        title="Weekly Executive Summary"
        description={`${formatShortDate(summary.weekStart)} to ${formatShortDate(weekEnd)} in your visible execution scope.`}
        actions={
          <LinkButton href="/dashboard/export" tone="secondary">
            Export CSV
          </LinkButton>
        }
      />

      <div className="grid grid-3">
        <StatCard label="Visible Users" value={String(summary.visibleUserCount)} detail="in scope" tone="info" />
        <StatCard
          label="Review Completion"
          value={reviewCompletion}
          detail={`${summary.completedReviewCount} of ${summary.reviewableReportCount} reviewable`}
          tone={summary.reviewableReportCount === 0 || summary.completedReviewCount === summary.reviewableReportCount ? "success" : "warning"}
        />
        <StatCard
          label="Missing Updates"
          value={String(summary.missingReportCount)}
          detail={`${summary.currentReportCount} reports started`}
          tone={summary.missingReportCount > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-3">
        <StatCard label="Objectives" value={String(summary.objectiveCount)} detail="visible OKRs" tone="info" />
        <StatCard label="Key Results" value={String(summary.keyResultCount)} detail="visible KRs" tone="success" />
        <StatCard label="Average Confidence" value={averageConfidence(summary.averageConfidence)} detail="KR owner signal" tone="info" />
      </div>

      <Card>
        <CardHeader>
          <h2>Summary Narrative</h2>
          <p>Plain-language readout from current OKR, report, review, and risk data.</p>
        </CardHeader>
        <CardContent>
          <div className="route-grid">
            <div className="route-item">
              <span>
                <strong>Execution health</strong>
                <br />
                <span className="muted">
                  {summary.keyResultCount} KRs are visible, average confidence is {averageConfidence(summary.averageConfidence)}, and {summary.riskKrs.length} KRs are currently flagged as risk items.
                </span>
              </span>
              <Badge tone={summary.riskKrs.length > 0 ? "warning" : "success"}>{summary.riskKrs.length} risks</Badge>
            </div>
            <div className="route-item">
              <span>
                <strong>Weekly operating rhythm</strong>
                <br />
                <span className="muted">
                  {summary.currentReportCount} current-week reports exist for {summary.visibleUserCount} visible users; {summary.missingReportCount} users still need a submitted update.
                </span>
              </span>
              <Badge tone={summary.missingReportCount > 0 ? "warning" : "success"}>{summary.missingReportCount} missing</Badge>
            </div>
            <div className="route-item">
              <span>
                <strong>Highest attention item</strong>
                <br />
                <span className="muted">
                  {topRisk ? `${topRisk.title} owned by ${topRisk.ownerName}: ${topRisk.reasons.join(", ")}` : "No high-risk KRs are visible in this scope."}
                </span>
              </span>
              {topRisk ? (
                <Link href={`/key-results/${topRisk.id}`}>Open KR</Link>
              ) : (
                <Badge tone="success">Clear</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Top Risk KRs</h2>
            <p>KRs that need manager or leadership attention first.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {summary.riskKrs.map((kr) => (
                <div className="route-item" key={kr.id}>
                  <span>
                    <Link href={`/key-results/${kr.id}`}>
                      <strong>{kr.title}</strong>
                    </Link>
                    <br />
                    <span className="muted">
                      {kr.objectiveTitle} / {kr.ownerName} / {Math.round(kr.progressPercent)}% / Confidence {kr.confidenceScore}/5
                      <br />
                      {kr.reasons.join(", ")}
                    </span>
                  </span>
                  <span className="table-actions">
                    <Badge tone={workStatusTone(kr.status)}>{formatEnumLabel(kr.status)}</Badge>
                    <Badge tone={pacingStatusTone(kr.pacingStatus)}>{formatEnumLabel(kr.pacingStatus)}</Badge>
                  </span>
                </div>
              ))}
              {summary.riskKrs.length === 0 ? <div className="route-item">No visible KRs are currently flagged as risks.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Escalations</h2>
            <p>Manager-flagged reviews visible in this scope.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {summary.escalations.map((escalation) => (
                <div className="route-item" key={escalation.id}>
                  <span>
                    <strong>{escalation.employeeName}</strong>
                    <br />
                    <span className="muted">
                      Flagged by {escalation.managerName}
                      {escalation.comment ? ` / ${escalation.comment}` : ""}
                    </span>
                  </span>
                  <Badge tone="danger">Escalated</Badge>
                </div>
              ))}
              {summary.escalations.length === 0 ? <div className="route-item">No risk-flagged escalations are visible.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2>Department Snapshot</h2>
          <p>Scoped comparison of team size, KR load, risk, and missing updates.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Users</th>
                  <th>KRs</th>
                  <th>Risk KRs</th>
                  <th>Missing Updates</th>
                </tr>
              </thead>
              <tbody>
                {summary.departments.map((department) => (
                  <tr key={department.id}>
                    <td>
                      <strong>{department.name}</strong>
                    </td>
                    <td>{department.userCount}</td>
                    <td>{department.keyResultCount}</td>
                    <td>
                      <Badge tone={department.riskCount > 0 ? "danger" : "success"}>{String(department.riskCount)}</Badge>
                    </td>
                    <td>
                      <Badge tone={department.missingReportCount > 0 ? "warning" : "success"}>{String(department.missingReportCount)}</Badge>
                    </td>
                  </tr>
                ))}
                {summary.departments.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No department data is visible.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
