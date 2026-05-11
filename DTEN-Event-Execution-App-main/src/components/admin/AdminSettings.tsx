import { ChevronRight } from "lucide-react";
import { CONSENT_STATUSES, COST_CATEGORIES, EVENT_TYPES, MATCH_STATUSES, PRODUCT_INTEREST, SYNC_STATUSES } from "../../types";
import { ConfigRow, MiniStat, Panel, RiskBadge, SettingRow, SystemRow, TagGrid } from "../shared/ui";

const objectiveCategoryOptions = [
  "Brand presence and credibility",
  "Marketing list growth",
  "Sales lead generation",
  "Channel expansion",
  "Partner obligation and enablement",
  "Customer retention and expansion",
  "Market intelligence",
];

export function AdminSettings() {
  const eventTypeConfigs = EVENT_TYPES.map((item) => ({ name: item, owner: item.includes("Partner") ? "Channel" : item.includes("Marketing") ? "Marketing Ops" : "Marketing", status: "Active" }));
  const eventTierConfigs = [
    { name: "Tier 1 Strategic", approval: "Leadership approval required", routing: "Marketing Leader + Regional / Channel Leader + Leadership" },
    { name: "Tier 1", approval: "Functional + Finance, leadership visibility", routing: "Functional owner + Finance" },
    { name: "Tier 2", approval: "Functional + Finance", routing: "Functional owner + Finance" },
    { name: "Tier 3", approval: "Functional + Finance when spend exists", routing: "Functional owner + Finance" },
    { name: "Other", approval: "Explanation required", routing: "Department Head review when exception applies" },
  ];
  const approvalThresholds = [
    "Cost > $5,000 requires Department Head",
    "Cost > $15,000 requires CFO + CEO visibility",
    "Tier 1 Strategic requires Leadership approval",
    "Marketing-list-only event > $3,000 requires Department Head + Finance",
    "Non-measurable event requires Department Head + Finance",
  ];
  const reminderRules = [
    "Event request submitted: Functional leader reviews objective commitments",
    "Functional approval completed: Finance reviews funding approval",
    "Event end + 1 day: Event Owner uploads contact and conversation lists",
    "Event end + 7 days: Event Owner + Regional Leader escalation",
    "Wednesday / Friday after event: attendees update lead status",
    "T+30: Finance / Event Owner reconcile actual cost",
    "Duplicate, failed sync, missing HubSpot fields, variance >10%, and overdue follow-up create exception reminders",
  ];
  const hubSpotFields = [
    "DTEN Event ID",
    "DTEN Event Name",
    "Event Date",
    "Event Type",
    "Event Tier",
    "Event Region",
    "Event Owner",
    "Capture Method",
    "Conversation Summary",
    "Product Interest",
    "Lead Quality",
    "Buying Timeline",
    "Estimated Opportunity Size",
    "Follow-up Owner",
    "Follow-up Due Date",
    "SkyMap Record ID",
    "DTEN.me Event URL",
    "Event Upload Batch ID",
    "Event Source Detail",
    "Consent Status",
  ];
  const twentyFlow = ["HubSpot Qualified Lead", "SkyMap", "Twenty Contact", "Twenty Lead", "Twenty Task", "Sales confirms", "Twenty Opportunity"];

  return (
    <div className="space-y-6">
      <Panel title="Admin Settings" action={<RiskBadge value="Needs Review" label="Prototype configuration" />}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniStat label="Workflow layer" value="DTEN.me" />
          <MiniStat label="Routing layer" value="SkyMap" />
          <MiniStat label="Engagement layer" value="HubSpot" />
          <MiniStat label="CRM system of record" value="Twenty Phase 2" />
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">Configure event types, approvals, fields, reminders, and permissions. These settings are editable-looking mock controls for leadership and Ops review and do not write to a backend or call external systems.</p>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="1. Event Type Configuration">
          <div className="space-y-3">
            {eventTypeConfigs.map((item) => <ConfigRow key={item.name} title={item.name} meta={item.owner} detail="Included in intake dropdown and dashboard filters." />)}
          </div>
        </Panel>

        <Panel title="2. Event Tier Configuration">
          <div className="space-y-3">
            {eventTierConfigs.map((item) => <ConfigRow key={item.name} title={item.name} meta={item.approval} detail={item.routing} />)}
          </div>
        </Panel>

        <Panel title="3. Cost Categories">
          <TagGrid items={COST_CATEGORIES} />
        </Panel>

        <Panel title="4. Objective Categories">
          <TagGrid items={objectiveCategoryOptions} />
        </Panel>

        <Panel title="5. Approval Thresholds">
          <div className="space-y-3">
            {approvalThresholds.map((item) => <SettingRow key={item} title={item} copy="Enabled in approval routing preview and simulated approval workflow." enabled />)}
          </div>
        </Panel>

        <Panel title="6. Reminder Rules">
          <div className="space-y-3">
            {reminderRules.map((item) => <ConfigRow key={item} title={item.split(":")[0]} meta="Enabled" detail={item.includes(":") ? item.split(":").slice(1).join(":").trim() : item} />)}
          </div>
        </Panel>

        <Panel title="7. HubSpot Field Mapping">
          <div className="grid gap-2 md:grid-cols-2">
            {hubSpotFields.map((field) => (
              <div key={field} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold">{field}</p>
                <p className="mt-1 text-xs text-slate-500">Mapped from DTEN.me / SkyMap mock data</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="8. Product Interest Dropdown">
          <TagGrid items={PRODUCT_INTEREST} />
        </Panel>

        <Panel title="9. Consent Status Dropdown">
          <TagGrid items={CONSENT_STATUSES} />
        </Panel>

        <Panel title="Sync Status Values">
          <TagGrid items={SYNC_STATUSES} />
        </Panel>

        <Panel title="SkyMap Match Status Values">
          <TagGrid items={MATCH_STATUSES} />
        </Panel>

        <Panel title="10. Phase 2 Twenty Preview" action={<RiskBadge value="Missing Data" label="Not part of V1" />}>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-900">Twenty integration is not part of V1.</h3>
            <p className="mt-2 text-sm leading-6 text-amber-800">V1 ends at DTEN.me workflow, SkyMap processing simulation, and HubSpot marketing / lead engagement sync simulation. This preview shows future routing only.</p>
          </div>
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            {twentyFlow.map((step, index) => (
              <div key={step} className="flex flex-1 items-center gap-3">
                <div className="flex-1 rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-semibold text-slate-800">{step}</div>
                {index < twentyFlow.length - 1 && <ChevronRight className="hidden size-5 shrink-0 text-slate-400 lg:block" />}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Systems map">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SystemRow name="DTEN.me" role="Workflow layer" copy="Approvals, execution tracking, uploads, duplicate review, reminders, and scorecards." />
          <SystemRow name="SkyMap" role="Data and routing layer" copy="Deterministic matching, duplicate confidence, account routing, and sync eligibility." />
          <SystemRow name="HubSpot" role="Marketing / lead engagement" copy="Simulated campaigns, static lists, marketing contacts, prospects, and qualified leads." />
          <SystemRow name="Twenty" role="Phase 2 preview only" copy="Future CRM system of record. No V1 integration or write action." />
        </div>
      </Panel>
    </div>
  );
}
