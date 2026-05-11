export type SkyMapConfidence = "High" | "Medium" | "Low" | "Conflict";

export type SkyMapSyncEligibility =
  | "Auto-match"
  | "Auto-create company"
  | "Ready for SkyMap/HubSpot sync"
  | "Hold for review"
  | "Hold for Marketing review"
  | "Hold for Sales Ops / Marketing review"
  | "Do not sync";

export type SkyMapContactRecord = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  companyDomain?: string;
};

export type SkyMapCompanyRecord = {
  companyName: string;
  companyDomain?: string;
  strategic?: boolean;
};

export type SkyMapProcessingInput = SkyMapContactRecord & {
  existingContacts: SkyMapContactRecord[];
  existingCompanies: SkyMapCompanyRecord[];
};

export type SkyMapProcessingResult = {
  contactMatch: string;
  companyMatch: string;
  confidence: SkyMapConfidence;
  eligibility: SkyMapSyncEligibility;
  status: string;
  reason: string;
};

export const personalEmailDomains = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "qq.com",
  "163.com",
]);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeCompanyName(companyName: string) {
  return companyName
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(inc|inc\.|llc|ltd|ltd\.|corp|corp\.|corporation|company|co|co\.|gmbh|plc|sa|sas|limited)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractEmailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const [, domain = ""] = normalized.split("@");
  return domain;
}

export function isPersonalEmailDomain(domain: string) {
  return personalEmailDomains.has(domain.trim().toLowerCase());
}

export function detectContactDuplicate(contact: SkyMapContactRecord, existingContacts: SkyMapContactRecord[]) {
  const email = contact.email;
  const normalizedEmail = normalizeEmail(email);
  const domain = extractEmailDomain(email);
  const normalizedFirst = contact.firstName.trim().toLowerCase();
  const normalizedLast = contact.lastName.trim().toLowerCase();

  const exactEmail = existingContacts.find((existing) => existing.email === email && email);
  if (exactEmail) return { type: "Exact email match", confidence: "High" as const, match: exactEmail };

  const normalizedEmailMatch = existingContacts.find((existing) => normalizeEmail(existing.email) === normalizedEmail && normalizedEmail);
  if (normalizedEmailMatch) return { type: "Normalized email match", confidence: "High" as const, match: normalizedEmailMatch };

  const sameDomainName = existingContacts.find((existing) => {
    return (
      domain &&
      extractEmailDomain(existing.email) === domain &&
      existing.firstName.trim().toLowerCase() === normalizedFirst &&
      existing.lastName.trim().toLowerCase() === normalizedLast
    );
  });
  if (sameDomainName) return { type: "Same domain + same first and last name", confidence: "Medium" as const, match: sameDomainName };

  return { type: "Manual review if uncertain", confidence: "Low" as const, match: null };
}

export function detectCompanyMatch(contact: SkyMapContactRecord, existingCompanies: SkyMapCompanyRecord[]) {
  const domain = contact.companyDomain || extractEmailDomain(contact.email);
  const normalizedCompany = normalizeCompanyName(contact.company);
  const exactDomain = existingCompanies.find((company) => company.companyDomain && company.companyDomain === domain && domain);
  if (exactDomain) return { type: "Exact company domain match", confidence: "High" as const, match: exactDomain };

  const exactName = existingCompanies.find((company) => normalizeCompanyName(company.companyName) === normalizedCompany && normalizedCompany);
  if (exactName) return { type: "Exact normalized company name match", confidence: "High" as const, match: exactName };

  const fuzzyName = existingCompanies.find((company) => {
    const existingName = normalizeCompanyName(company.companyName);
    return (
      existingName &&
      normalizedCompany &&
      (existingName.includes(normalizedCompany) || normalizedCompany.includes(existingName)) &&
      (!domain || !company.companyDomain || company.companyDomain === domain)
    );
  });
  if (fuzzyName) return { type: "Fuzzy company name match + matching website/domain", confidence: "Medium" as const, match: fuzzyName };

  return { type: "Manual review if uncertain", confidence: "Low" as const, match: null };
}

export function determineMatchConfidence(contactMatch: SkyMapConfidence, companyMatch: SkyMapConfidence, hasConflict: boolean): SkyMapConfidence {
  if (hasConflict) return "Conflict";
  if (contactMatch === "High" || companyMatch === "High") return "High";
  if (contactMatch === "Medium" || companyMatch === "Medium") return "Medium";
  return "Low";
}

export function determineSyncEligibility({
  contact,
  companyMatch,
  confidence,
}: {
  contact: SkyMapContactRecord;
  companyMatch: ReturnType<typeof detectCompanyMatch>;
  confidence: SkyMapConfidence;
}): SkyMapSyncEligibility {
  const domain = extractEmailDomain(contact.email);

  if (confidence === "Conflict") return "Do not sync";
  if (companyMatch.match?.strategic) return "Hold for Sales Ops / Marketing review";
  if (!contact.company.trim()) return "Do not sync";
  if (domain && isPersonalEmailDomain(domain)) return "Hold for Marketing review";
  if (confidence === "High") return "Auto-match";
  if (confidence === "Medium") return "Hold for review";
  if (domain && contact.company.trim() && !companyMatch.match) return "Auto-create company";
  return "Hold for review";
}

export function processSkyMapRecord(input: SkyMapProcessingInput): SkyMapProcessingResult {
  const contact = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    company: input.company,
    companyDomain: input.companyDomain,
  };
  const contactMatch = detectContactDuplicate(contact, input.existingContacts);
  const companyMatch = detectCompanyMatch(contact, input.existingCompanies);
  const domain = extractEmailDomain(contact.email);
  const hasConflict = Boolean(contact.email && domain && isPersonalEmailDomain(domain) && companyMatch.match?.strategic);
  const confidence = determineMatchConfidence(contactMatch.confidence, companyMatch.confidence, hasConflict);
  const eligibility = determineSyncEligibility({ contact, companyMatch, confidence });
  const status = eligibility === "Auto-match" || eligibility === "Auto-create company" || eligibility === "Ready for SkyMap/HubSpot sync" ? "Ready" : eligibility;

  return {
    contactMatch: contactMatch.type,
    companyMatch: companyMatch.type,
    confidence,
    eligibility,
    status,
    reason: `${contactMatch.type}; ${companyMatch.type}. Confidence: ${confidence}.`,
  };
}
