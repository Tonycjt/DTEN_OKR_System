import { BarChart3, CircleDollarSign, CloudUpload, DatabaseZap, FileCheck2, Handshake, ShieldCheck, TriangleAlert } from "lucide-react";
import { calculateEventScorecard, calculateLeadershipScorecard, calculateRegionalScorecard, type ScorecardData, type ScorecardRow } from "../../lib/scorecard";
import type { EventRecord, Region, Role } from "../../types";
import { EmptyState, Metric, MiniStat, Panel, ScorecardStatusBadge } from "../shared/ui";

const regions: Region[] = ["West", "East", "EMEA", "APAC"];

type EventSummary = {
  event: EventRecord;
  rows: ScorecardRow[];
  summary: ReturnType<typeof calculateEventScorecard>["summary"];
};

const roleRowVisibility: Partial<Record<Role, RegExp>> = {
  "Sales Rep": /Sales leads|Follow-up compliance|HubSpot sync success/i,
  "Event Owner": /Marketing contacts|Sales leads|Channel partner conversations|Partner agreements initiated|Estimated cost|HubSpot sync success|Duplicate review status|Follow-up compliance/i,
  "Regional Sales Leader": /Sales leads|Follow-up compliance|Channel partner conversations|Partner agreements initiated/i,
  "Channel Leader": /Channel partner conversations|Partner agreements initiated|Follow-up compliance/i,
  "Marketing Ops": /Marketing contacts|HubSpot sync success|Duplicate review status/i,
  "Finance / CFO": /Estimated cost/i,
  "Technical Team": /HubSpot sync success/i,
};

export function Scorecards({ events, scorecardData, role }: { events: EventRecord[]; scorecardData: ScorecardData; role: Role }) {
  const eventSummaries = events.map((event) => {
    const scorecard = calculateEventScorecard(event, scorecardData);
    return { event, rows: getRowsForRole(role, scorecard.rows), summary: scorecard.summary };
  });
  const aggregate = calculateLeadershipScorecard(events, scorecardData);
  const regional = regions.map((region) => calculateRegionalScorecard(events, region, scorecardData)).filter((row) => role === "Leadership" || role === "Admin" || row.events > 0);
  const metrics = getRoleMetrics(role, events, scorecardData, aggregate);

  return (
    <div className="scorecards-page space-y-8">
      <section className="scorecard-intro">
        <p className="text-sm leading-6 text-slate-600">Review event performance against commitments.</p>
      </section>
      {events.length === 0 ? (
        <EmptyState title="No scorecards available" copy="Scorecards appear when this role has events in scope." />
      ) : null}
      <section className="scorecard-summary-section">
        <p className="scorecard-section-label">Summary cards</p>
        <div className="scorecard-summary-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => <Metric key={metric.title} title={metric.title} value={metric.value} detail={metric.detail} icon={metric.icon} />)}
        </div>
      </section>

      <section className="scorecard-exceptions-section">
        <p className="scorecard-section-label">Key exceptions</p>
        {renderRoleSummary(role, events, scorecardData, aggregate)}
      </section>

      {(role === "Leadership" || role === "Admin" || role === "Regional Sales Leader") && (
        <section className="scorecard-detail-section">
          <p className="scorecard-section-label">Detailed tables</p>
          <RegionalScorecardPanel role={role} regional={regional} />
        </section>
      )}

      <section className="scorecard-detail-section">
        <p className="scorecard-section-label">Event detail scorecards</p>
        <EventScorecardPanel role={role} eventSummaries={eventSummaries} />
      </section>
    </div>
  );
}

function getRowsForRole(role: Role, rows: ScorecardRow[]) {
  if (role === "Leadership" || role === "Admin") return rows;
  const matcher = roleRowVisibility[role];
  return matcher ? rows.filter((row) => matcher.test(row.objective)) : rows;
}

function getRoleMetrics(role: Role, events: EventRecord[], data: ScorecardData, aggregate: ReturnType<typeof calculateLeadershipScorecard>) {
  const eventIds = new Set(events.map((event) => event.event_id));
  const conversations = data.conversations.filter((conversation) => eventIds.has(conversation.event_id));
  const leadConversations = conversations.filter((conversation) => conversation.is_sales_lead);
  const overdueLeadActions = data.reminders.filter((reminder) => eventIds.has(reminder.event_id) && (reminder.status === "Overdue" || reminder.status === "Escalated") && /Sales Follow-Up|Lead Status/i.test(reminder.reminder_type));
  const partnerConversations = conversations.filter((conversation) => /partner|channel|reseller|dmr|alliance/i.test(`${conversation.company} ${conversation.title} ${conversation.conversation_summary} ${conversation.next_step}`));
  const partnerAgreements = conversations.filter((conversation) => /agreement|mou|contract|reseller agreement|partner agreement|initiated/i.test(`${conversation.conversation_summary} ${conversation.next_step}`));
  const uploadIssues = data.reminders.filter((reminder) => eventIds.has(reminder.event_id) && /Upload|Missing/i.test(reminder.reminder_type));
  const duplicateQueue = data.duplicates.filter((duplicate) => eventIds.has(duplicate.eventId) && duplicate.action === "Review");
  const failedSync = data.syncRecords.filter((record) => eventIds.has(record.eventId) && record.syncStatus === "Failed");
  const heldSync = data.syncRecords.filter((record) => eventIds.has(record.eventId) && record.syncStatus === "Held for review");
  const overBudget = events.filter((event) => event.actual_cost_total > event.estimated_cost_total || event.variance_percentage > 10);
  const varianceNeeded = events.filter((event) => event.variance_percentage > 10 && !event.variance_explanation.trim());
  const fundingApprovals = events.filter((event) => event.approved_by_finance || event.approval_status === "Finance Review" || /finance|cfo/i.test(`${event.approved_by_finance ?? ""} ${event.approval_status}`));
  const nonMeasurable = events.filter((event) => event.event_tier === "Non-Measurable");
  const marketingListOnly = events.filter((event) => event.event_type === "Marketing List Build" || /marketing list/i.test(`${event.event_type} ${event.notes}`));

  if (role === "Sales Rep") {
    return [
      { title: "Own leads", value: String(leadConversations.length), detail: "Qualified leads in personal scope", icon: ShieldCheck },
      { title: "Overdue lead actions", value: String(overdueLeadActions.length), detail: "Lead follow-up reminders assigned or visible", icon: TriangleAlert },
      { title: "Follow-up performance", value: overdueLeadActions.length === 0 ? "On track" : "Needs action", detail: "No company-wide scorecards shown", icon: FileCheck2 },
      { title: "Visible events", value: String(events.length), detail: "Personal event scope", icon: BarChart3 },
    ];
  }

  if (role === "Event Owner") {
    return [
      { title: "Owned events", value: String(events.length), detail: "Scorecards for owned events", icon: BarChart3 },
      { title: "Behind commitment", value: String(aggregate.behindEvents), detail: "Owned events behind or missing data", icon: TriangleAlert },
      { title: "Over budget", value: String(overBudget.length), detail: "Owned event spend exceptions", icon: CircleDollarSign },
      { title: "Missing rows", value: String(aggregate.missingDataRows), detail: "Owned scorecard data gaps", icon: FileCheck2 },
    ];
  }

  if (role === "Regional Sales Leader") {
    return [
      { title: "Regional events", value: String(events.length), detail: "Team scorecard scope", icon: BarChart3 },
      { title: "Behind commitment", value: String(aggregate.behindEvents), detail: "Events behind in region", icon: TriangleAlert },
      { title: "Overdue follow-up", value: String(overdueLeadActions.length), detail: "Rep follow-up reminders in region", icon: FileCheck2 },
      { title: "Regional status", value: aggregate.overallStatus, detail: "Aggregated regional scorecard health", icon: ShieldCheck },
    ];
  }

  if (role === "Channel Leader") {
    return [
      { title: "Channel events", value: String(events.length), detail: "Partner and channel scorecard scope", icon: Handshake },
      { title: "Partner conversations", value: String(partnerConversations.length), detail: "Partner conversation commitments", icon: FileCheck2 },
      { title: "Agreements initiated", value: String(partnerAgreements.length), detail: "Partner agreement initiation signals", icon: ShieldCheck },
      { title: "Behind commitment", value: String(aggregate.behindEvents), detail: "Channel events needing attention", icon: TriangleAlert },
    ];
  }

  if (role === "Marketing Ops") {
    return [
      { title: "Upload compliance", value: uploadIssues.length === 0 ? "Healthy" : String(uploadIssues.length), detail: "Upload and missing-data reminders", icon: CloudUpload },
      { title: "Duplicate queue", value: String(duplicateQueue.length), detail: "Open duplicate review records", icon: FileCheck2 },
      { title: "Sync failures", value: String(failedSync.length), detail: "Failed HubSpot sync records", icon: DatabaseZap },
      { title: "Held records", value: String(heldSync.length), detail: "Records blocked before sync", icon: TriangleAlert },
    ];
  }

  if (role === "Finance / CFO") {
    return [
      { title: "Over budget", value: String(overBudget.length), detail: "Cost scorecard exceptions", icon: CircleDollarSign },
      { title: "Variance explanations", value: String(varianceNeeded.length), detail: "Events over 10% without explanation", icon: FileCheck2 },
      { title: "Funding approvals", value: String(fundingApprovals.length), detail: "Finance review or approval history", icon: ShieldCheck },
      { title: "Cost status", value: aggregate.overallStatus, detail: "Cost-focused visible event scope", icon: BarChart3 },
    ];
  }

  if (role === "Technical Team") {
    return [
      { title: "Sync failures", value: String(failedSync.length), detail: "Failed sync/error records only", icon: DatabaseZap },
      { title: "Held sync records", value: String(heldSync.length), detail: "Records held before retry or review", icon: TriangleAlert },
      { title: "Visible events", value: String(events.length), detail: "Technical sync/error scope", icon: BarChart3 },
      { title: "Sync status", value: failedSync.length > 0 ? "Needs review" : "Healthy", detail: "No company-wide scorecards shown", icon: ShieldCheck },
    ];
  }

  return [
    { title: "Company status", value: aggregate.overallStatus, detail: role === "Admin" ? "All scorecards visible" : "Company-wide scorecard", icon: ShieldCheck },
    { title: "Over budget", value: String(overBudget.length), detail: "Events exceeding budget or variance threshold", icon: CircleDollarSign },
    { title: "Behind commitment", value: String(aggregate.behindEvents), detail: "Events behind or missing scorecard rows", icon: TriangleAlert },
    { title: "Non-measurable / list-only", value: `${nonMeasurable.length} / ${marketingListOnly.length}`, detail: "Non-measurable and marketing-list-only events", icon: FileCheck2 },
  ];
}

function renderRoleSummary(role: Role, events: EventRecord[], data: ScorecardData, aggregate: ReturnType<typeof calculateLeadershipScorecard>) {
  if (role === "Leadership" || role === "Admin") {
    return (
      <Panel title={role === "Admin" ? "All scorecards" : "Company-wide executive scorecard"} action={<ScorecardStatusBadge status={aggregate.overallStatus} />}>
        <div className="grid gap-4 md:grid-cols-3">
          <MiniStat label="Recommended executive action" value={aggregate.recommendedAction} />
          <MiniStat label="Main risk" value={aggregate.mainRisk} />
          <MiniStat label="Executive scope" value={role === "Admin" ? "All sections" : "Company-wide"} />
        </div>
      </Panel>
    );
  }

  if (role === "Marketing Ops") {
    const eventIds = new Set(events.map((event) => event.event_id));
    const uploads = data.reminders.filter((reminder) => eventIds.has(reminder.event_id) && /Upload|Missing/i.test(reminder.reminder_type)).length;
    const duplicates = data.duplicates.filter((duplicate) => eventIds.has(duplicate.eventId) && duplicate.action === "Review").length;
    const syncFailures = data.syncRecords.filter((record) => eventIds.has(record.eventId) && record.syncStatus === "Failed").length;
    return <RoleSummaryPanel title="Operational scorecards" status={aggregate.overallStatus} stats={[ ["Upload compliance issues", uploads], ["Duplicate review queue", duplicates], ["Sync failure summary", syncFailures] ]} />;
  }

  if (role === "Finance / CFO") {
    const overBudget = events.filter((event) => event.actual_cost_total > event.estimated_cost_total || event.variance_percentage > 10).length;
    const varianceNeeded = events.filter((event) => event.variance_percentage > 10 && !event.variance_explanation.trim()).length;
    const approvals = events.filter((event) => event.approved_by_finance || event.approval_status === "Finance Review").length;
    return <RoleSummaryPanel title="Cost scorecards" status={aggregate.overallStatus} stats={[ ["Over-budget events", overBudget], ["Variance explanations", varianceNeeded], ["Funding approval history", approvals] ]} />;
  }

  if (role === "Technical Team") {
    const eventIds = new Set(events.map((event) => event.event_id));
    const failed = data.syncRecords.filter((record) => eventIds.has(record.eventId) && record.syncStatus === "Failed").length;
    const held = data.syncRecords.filter((record) => eventIds.has(record.eventId) && record.syncStatus === "Held for review").length;
    return <RoleSummaryPanel title="Sync/error scorecards" status={failed > 0 ? "Behind" : "Met"} stats={[ ["Failed sync records", failed], ["Held sync records", held], ["Visible technical events", events.length] ]} />;
  }

  const title = role === "Regional Sales Leader" ? "Regional/team scorecard" : role === "Channel Leader" ? "Channel/partner scorecard" : role === "Sales Rep" ? "Personal follow-up scorecard" : "Owned event scorecard";
  return <RoleSummaryPanel title={title} status={aggregate.overallStatus} stats={[ ["Visible events", events.length], ["Behind commitment", aggregate.behindEvents], ["Missing rows", aggregate.missingDataRows] ]} />;
}

function RoleSummaryPanel({ title, status, stats }: { title: string; status: ReturnType<typeof calculateLeadershipScorecard>["overallStatus"]; stats: Array<[string, string | number]> }) {
  return (
    <Panel title={title} action={<ScorecardStatusBadge status={status} />}>
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map(([label, value]) => <MiniStat key={label} label={label} value={String(value)} />)}
      </div>
    </Panel>
  );
}

function RegionalScorecardPanel({ role, regional }: { role: Role; regional: ReturnType<typeof calculateRegionalScorecard>[] }) {
  return (
    <Panel title={role === "Regional Sales Leader" ? "Regional/team scorecard" : "Regional comparisons"}>
      <div className="table-shell overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Overall status</th>
              <th className="px-4 py-3">Main risk</th>
              <th className="px-4 py-3">Missing data</th>
              <th className="px-4 py-3">Recommended action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {regional.map((row) => (
              <tr key={row.region}>
                <td className="px-4 py-4 font-semibold">{row.region}</td>
                <td className="px-4 py-4 text-slate-600">{row.events}</td>
                <td className="px-4 py-4"><ScorecardStatusBadge status={row.overallStatus} /></td>
                <td className="px-4 py-4 text-slate-600">{row.mainRisk}</td>
                <td className="px-4 py-4 text-slate-600">{row.missingData}</td>
                <td className="px-4 py-4 text-slate-600">{row.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EventScorecardPanel({ role, eventSummaries }: { role: Role; eventSummaries: EventSummary[] }) {
  const title = role === "Sales Rep" ? "Personal event lead scorecards" : role === "Finance / CFO" ? "Cost event scorecards" : role === "Marketing Ops" ? "Operational event scorecards" : role === "Technical Team" ? "Sync/error event scorecards" : role === "Channel Leader" ? "Channel event scorecards" : "Event scorecards";
  const eventGridClass = role === "Leadership" || role === "Admin" ? "grid gap-6" : "grid gap-6 lg:grid-cols-2";

  return (
    <Panel title={title}>
      <div className={eventGridClass}>
        {eventSummaries.length === 0 && <div className="lg:col-span-2"><EmptyState title="No scorecards available" copy="Scorecards appear when this role has events in scope." /></div>}
        {eventSummaries.map(({ event, rows, summary }) => (
          <div key={event.id} className="scorecard-event-card rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{event.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{event.type} · {event.owner}</p>
              </div>
              <ScorecardStatusBadge status={summary.overallStatus} />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <MiniStat key={row.objective} label={row.objective} value={row.actual} />
              ))}
              {rows.length === 0 && <MiniStat label="Visible scorecard rows" value="None" />}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
