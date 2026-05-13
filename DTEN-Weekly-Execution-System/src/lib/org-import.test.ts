import { describe, expect, it } from "vitest";
import { parseOrgImportText, sampleOrgImportCsv, type ExistingOrgUser } from "./org-import";

const noExistingUsers: ExistingOrgUser[] = [];

describe("parseOrgImportText", () => {
  it("accepts the sample CSV", () => {
    const result = parseOrgImportText(sampleOrgImportCsv(), noExistingUsers);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({
      email: "ceo@dten.com",
      role: "CEO",
      employmentStatus: "ACTIVE",
    });
  });

  it("detects duplicate emails before import", () => {
    const csv = [
      "name,email,title,role,department,team,primary_manager_email,review_owner_email,employment_status",
      "Casey Chen,ceo@dten.com,CEO,CEO,Executive,,,ACTIVE",
      "Casey Duplicate,ceo@dten.com,CEO,CEO,Executive,,,ACTIVE",
    ].join("\n");

    const result = parseOrgImportText(csv, noExistingUsers);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 3,
          field: "email",
          message: expect.stringContaining("duplicates row 2"),
        }),
      ]),
    );
  });

  it("detects missing manager references", () => {
    const csv = [
      "name,email,title,role,department,team,primary_manager_email,review_owner_email,employment_status",
      "Casey Chen,ceo@dten.com,CEO,CEO,Executive,,,ACTIVE",
      "Riley Wong,engineer@dten.com,Senior Engineer,EMPLOYEE,Product Engineering,Android Team,missing@dten.com,ceo@dten.com,ACTIVE",
    ].join("\n");

    const result = parseOrgImportText(csv, noExistingUsers);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 3,
          field: "primary_manager_email",
          message: expect.stringContaining("missing@dten.com does not exist"),
        }),
      ]),
    );
  });

  it("detects circular primary-manager relationships", () => {
    const csv = [
      "name,email,title,role,department,team,primary_manager_email,review_owner_email,employment_status",
      "Avery Park,manager@dten.com,Certification Manager,MANAGER,Product Engineering,Certification Team,engineer@dten.com,engineer@dten.com,ACTIVE",
      "Riley Wong,engineer@dten.com,Senior Engineer,EMPLOYEE,Product Engineering,Android Team,manager@dten.com,manager@dten.com,ACTIVE",
    ].join("\n");

    const result = parseOrgImportText(csv, noExistingUsers);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "primary_manager_email",
          message: expect.stringContaining("Circular relationship detected"),
        }),
      ]),
    );
  });

  it("accepts tab-delimited rows copied from Excel", () => {
    const tsv = [
      "name\temail\ttitle\trole\tdepartment\tteam\tprimary_manager_email\treview_owner_email\temployment_status",
      "Casey Chen\tceo@dten.com\tCEO\tCEO\tExecutive\t\t\t\tACTIVE",
      "Morgan Lee\thead@dten.com\tHead of Product Engineering\tDEPARTMENT_HEAD\tProduct Engineering\tCertification Team\tceo@dten.com\tceo@dten.com\tACTIVE",
    ].join("\n");

    const result = parseOrgImportText(tsv, noExistingUsers);

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.email)).toEqual(["ceo@dten.com", "head@dten.com"]);
  });
});
