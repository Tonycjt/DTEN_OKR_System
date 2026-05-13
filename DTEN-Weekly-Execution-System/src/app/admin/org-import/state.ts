import { sampleOrgImportCsv, type OrgImportError } from "@/lib/org-import";

export type OrgImportSummary = {
  created: number;
  updated: number;
  inactive: number;
  departmentsCreated: number;
  teamsCreated: number;
  managerRelationshipsUpdated: number;
  reviewOwnersUpdated: number;
  skippedRows: number;
  appliedRows: number;
};

export type OrgImportState = {
  status: "idle" | "validation_failed" | "applied";
  message: string;
  errors: OrgImportError[];
  summary: OrgImportSummary | null;
  sampleCsv: string;
};

export const initialOrgImportState: OrgImportState = {
  status: "idle",
  message: "Paste CSV data or upload a CSV/TSV export from Excel.",
  errors: [],
  summary: null,
  sampleCsv: sampleOrgImportCsv(),
};
