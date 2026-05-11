import type { EventContact, EventConversation, EventRecord, SyncStatus } from "../types";

export type HubSpotSyncStatus = SyncStatus;

export type HubSpotSyncRecord = {
  id: string;
  recordType: "Contact" | "Lead";
  name: string;
  company: string;
  email: string;
  eventId: string;
  eventName: string;
  syncDestination: string;
  syncStatus: HubSpotSyncStatus;
  errorReason: string;
  issueOwner: string;
  correctionAction: string;
  hubspotId: string | null;
};

export function buildHubSpotSyncQueue(events: EventRecord[], contacts: EventContact[] = [], conversations: EventConversation[] = []): HubSpotSyncRecord[] {
  const visibleEventIds = new Set(events.map((event) => event.event_id));
  const contactRecords = contacts.filter((contact) => visibleEventIds.has(contact.event_id)).map<HubSpotSyncRecord>((contact) => {
    const event = events.find((item) => item.event_id === contact.event_id);
    const duplicate = contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate";
    const missingRequired = !contact.email || !contact.company;
    const optOut = contact.consent_status === "Opted Out / Unsubscribed";
    const consentUnknown = contact.consent_status === "Consent Unknown";
    const failed = contact.hubspot_sync_status === "Failed";
    let syncStatus: HubSpotSyncStatus = "Ready to sync";
    let errorReason = consentUnknown ? "Consent unknown; sync allowed but marked unknown." : "";
    let issueOwner = "Marketing Ops";
    let correctionAction = consentUnknown ? "Mark consent unknown in HubSpot" : "No action needed";

    if (failed) {
      syncStatus = "Failed";
      errorReason = contact.error_message ?? "Previous simulated HubSpot sync failed.";
      issueOwner = "Marketing Ops / Technical Team";
      correctionAction = "Correct record and retry";
    } else if (optOut) {
      syncStatus = "Suppressed / do not market";
      errorReason = "Contact opted out or unsubscribed; preserve suppression.";
      issueOwner = "Marketing Ops";
      correctionAction = "Do not market; preserve suppression";
    } else if (missingRequired) {
      syncStatus = "Held for review";
      errorReason = "Email and Company are required before sync.";
      correctionAction = "Complete missing required fields";
    } else if (duplicate) {
      syncStatus = "Held for review";
      errorReason = `${contact.skymap_match_status}; duplicate contacts are held before HubSpot sync.`;
      correctionAction = "Review duplicate and select merge/create action";
    } else if (contact.hubspot_sync_status === "Synced") {
      syncStatus = "Synced";
      correctionAction = "No action needed";
    }

    return {
      id: `HS-CONTACT-${contact.contact_record_id}`,
      recordType: "Contact",
      name: `${contact.first_name} ${contact.last_name}`,
      company: contact.company,
      email: contact.email,
      eventId: contact.event_id,
      eventName: event?.event_name ?? contact.event_id,
      syncDestination: "HubSpot Marketing Contact / Prospect",
      syncStatus,
      errorReason,
      issueOwner,
      correctionAction,
      hubspotId: contact.hubspot_contact_id,
    };
  });

  const leadRecords = conversations.filter((conversation) => visibleEventIds.has(conversation.event_id)).map<HubSpotSyncRecord>((conversation) => {
    const event = events.find((item) => item.event_id === conversation.event_id);
    const duplicate = contacts.some(
      (contact) =>
        normalizeEmail(contact.email) === normalizeEmail(conversation.contact_email) &&
        (contact.skymap_match_status === "Duplicate" || contact.skymap_match_status === "Possible Duplicate"),
    );
    const missing = !conversation.contact_email || !conversation.company || !conversation.conversation_summary || !conversation.product_interest || !conversation.follow_up_owner || !conversation.next_step;
    let syncStatus: HubSpotSyncStatus = "Ready to sync";
    let errorReason = "";
    let issueOwner = conversation.follow_up_owner || "Marketing Ops";
    let correctionAction = "No action needed";

    if (!conversation.is_sales_lead) {
      syncStatus = "DTEN.me / SkyMap only";
      errorReason = "Non-lead conversation; store as event intelligence only.";
      correctionAction = "No HubSpot lead action";
    } else if (conversation.hubspot_sync_status === "Failed") {
      syncStatus = "Failed";
      errorReason = conversation.error_message ?? "Previous simulated HubSpot lead sync failed.";
      issueOwner = "Marketing Ops / Technical Team";
      correctionAction = "Complete correction and retry";
    } else if (duplicate) {
      syncStatus = "Held for review";
      errorReason = "Duplicate contact detected; hold qualified lead before sync.";
      correctionAction = "Resolve duplicate contact first";
    } else if (missing) {
      syncStatus = "Held for review";
      errorReason = "Qualified lead is missing required fields.";
      correctionAction = "Complete required lead fields";
    } else if (conversation.hubspot_sync_status === "Synced") {
      syncStatus = "Synced";
      correctionAction = "No action needed";
    }

    return {
      id: `HS-LEAD-${conversation.conversation_id}`,
      recordType: "Lead",
      name: conversation.contact_name,
      company: conversation.company,
      email: conversation.contact_email,
      eventId: conversation.event_id,
      eventName: event?.event_name ?? conversation.event_id,
      syncDestination: conversation.is_sales_lead ? "HubSpot Lead" : "DTEN.me / SkyMap intelligence",
      syncStatus,
      errorReason,
      issueOwner,
      correctionAction,
      hubspotId: conversation.hubspot_lead_id,
    };
  });

  return [...contactRecords, ...leadRecords];
}

export function upsertSyncRecords(current: HubSpotSyncRecord[], incoming: HubSpotSyncRecord[]) {
  const map = new Map(current.map((record) => [record.id, record]));
  incoming.forEach((record) => map.set(record.id, record));
  return Array.from(map.values());
}

export function mapHubSpotSyncStatusToSyncStatus(status: HubSpotSyncStatus): SyncStatus {
  return status;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
