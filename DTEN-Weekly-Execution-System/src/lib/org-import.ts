import type { UserRole } from "@prisma/client";

export type EmploymentStatus = "ACTIVE" | "INACTIVE";

export type OrgImportRow = {
  rowNumber: number;
  name: string;
  email: string;
  title: string;
  role: UserRole;
  department: string;
  team: string | null;
  primaryManagerEmail: string | null;
  reviewOwnerEmail: string | null;
  employmentStatus: EmploymentStatus;
  localManagerEmail: string | null;
  location: string | null;
  office: string | null;
  employeeId: string | null;
  startDate: Date | null;
  avatarUrl: string | null;
};

export type OrgImportError = {
  rowNumber: number | null;
  field: string;
  message: string;
};

export type ExistingOrgUser = {
  id: string;
  email: string;
  managerId: string | null;
  localManagerId: string | null;
  reviewOwnerId: string | null;
  employeeId: string | null;
};

const requiredColumns = [
  "name",
  "email",
  "title",
  "role",
  "department",
  "team",
  "primary_manager_email",
  "review_owner_email",
  "employment_status",
] as const;

const allowedRoles: UserRole[] = ["ADMIN", "CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"];
const allowedEmploymentStatuses: EmploymentStatus[] = ["ACTIVE", "INACTIVE"];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeader(value: string) {
  return value.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeEnum(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function optionalCell(value: string | undefined) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function optionalEmail(value: string | undefined) {
  return optionalCell(value)?.toLowerCase() ?? null;
}

function parseDate(value: string | undefined) {
  const text = optionalCell(value);

  if (!text) {
    return { value: null, valid: true };
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return { value: null, valid: false };
  }

  return { value: date, valid: true };
}

function detectDelimiter(headerLine: string) {
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function splitDelimitedText(text: string) {
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function buildRow(headers: string[], cells: string[], rowNumber: number, errors: OrgImportError[]) {
  const row = new Map(headers.map((header, index) => [header, cells[index] ?? ""]));
  const email = optionalEmail(row.get("email")) ?? "";
  const role = normalizeEnum(row.get("role") ?? "") as UserRole;
  const employmentStatus = normalizeEnum(row.get("employment_status") ?? "") as EmploymentStatus;
  const parsedStartDate = parseDate(row.get("start_date"));

  if (!optionalCell(row.get("name"))) {
    errors.push({ rowNumber, field: "name", message: "Name is required." });
  }

  if (!email || !emailPattern.test(email)) {
    errors.push({ rowNumber, field: "email", message: "A valid email is required." });
  }

  if (!optionalCell(row.get("title"))) {
    errors.push({ rowNumber, field: "title", message: "Title is required." });
  }

  if (!allowedRoles.includes(role)) {
    errors.push({ rowNumber, field: "role", message: `Role must be one of: ${allowedRoles.join(", ")}.` });
  }

  if (!allowedEmploymentStatuses.includes(employmentStatus)) {
    errors.push({ rowNumber, field: "employment_status", message: "Employment status must be ACTIVE or INACTIVE." });
  }

  if (employmentStatus === "ACTIVE" && !optionalCell(row.get("department"))) {
    errors.push({ rowNumber, field: "department", message: "Department is required for active users." });
  }

  const primaryManagerEmail = optionalEmail(row.get("primary_manager_email"));
  const reviewOwnerEmail = optionalEmail(row.get("review_owner_email"));

  if (employmentStatus === "ACTIVE" && role !== "CEO" && !primaryManagerEmail) {
    errors.push({ rowNumber, field: "primary_manager_email", message: "Active non-CEO users need a primary manager." });
  }

  if (employmentStatus === "ACTIVE" && role !== "CEO" && !reviewOwnerEmail && !primaryManagerEmail) {
    errors.push({ rowNumber, field: "review_owner_email", message: "Active users need a review owner or primary manager fallback." });
  }

  if (!parsedStartDate.valid) {
    errors.push({ rowNumber, field: "start_date", message: "Start date must be a valid YYYY-MM-DD date." });
  }

  return {
    rowNumber,
    name: optionalCell(row.get("name")) ?? "",
    email,
    title: optionalCell(row.get("title")) ?? "",
    role,
    department: optionalCell(row.get("department")) ?? "",
    team: optionalCell(row.get("team")),
    primaryManagerEmail,
    reviewOwnerEmail,
    employmentStatus,
    localManagerEmail: optionalEmail(row.get("local_manager_email")),
    location: optionalCell(row.get("location")),
    office: optionalCell(row.get("office")),
    employeeId: optionalCell(row.get("employee_id")),
    startDate: parsedStartDate.value,
    avatarUrl: optionalCell(row.get("avatar_url")),
  } satisfies OrgImportRow;
}

function addDuplicateValueErrors(rows: OrgImportRow[], errors: OrgImportError[], field: keyof OrgImportRow, label: string) {
  const seen = new Map<string, number>();

  rows.forEach((row) => {
    const value = row[field];

    if (typeof value !== "string" || value.length === 0) {
      return;
    }

    const normalized = value.toLowerCase();
    const existingRowNumber = seen.get(normalized);

    if (existingRowNumber) {
      errors.push({
        rowNumber: row.rowNumber,
        field: String(field),
        message: `${label} duplicates row ${existingRowNumber}.`,
      });
    } else {
      seen.set(normalized, row.rowNumber);
    }
  });
}

function detectCircularRelationships(
  graph: Map<string, string | null>,
  importedEmails: Set<string>,
  field: "primary_manager_email" | "review_owner_email",
  errors: OrgImportError[],
  rowNumbersByEmail: Map<string, number>,
) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(email: string, path: string[]) {
    if (visited.has(email)) {
      return;
    }

    if (visiting.has(email)) {
      const cycleStartIndex = path.indexOf(email);
      const cycle = [...path.slice(cycleStartIndex), email].join(" -> ");
      const rowNumber = rowNumbersByEmail.get(email) ?? null;

      if (importedEmails.has(email)) {
        errors.push({ rowNumber, field, message: `Circular relationship detected: ${cycle}.` });
      }
      return;
    }

    visiting.add(email);
    const nextEmail = graph.get(email);

    if (nextEmail) {
      visit(nextEmail, [...path, nextEmail]);
    }

    visiting.delete(email);
    visited.add(email);
  }

  importedEmails.forEach((email) => visit(email, [email]));
}

export function parseOrgImportText(text: string, existingUsers: ExistingOrgUser[]) {
  const errors: OrgImportError[] = [];
  const table = splitDelimitedText(text);
  const headerCells = table[0] ?? [];
  const headers = headerCells.map(normalizeHeader);

  if (headers.length === 0) {
    return { rows: [], errors: [{ rowNumber: null, field: "file", message: "Import data is empty." }] };
  }

  requiredColumns.forEach((column) => {
    if (!headers.includes(column)) {
      errors.push({ rowNumber: null, field: column, message: `Missing required column: ${column}.` });
    }
  });

  if (errors.length > 0) {
    return { rows: [], errors };
  }

  const rows = table.slice(1).map((cells, index) => buildRow(headers, cells, index + 2, errors));

  if (rows.length === 0) {
    errors.push({ rowNumber: null, field: "file", message: "Import data must include at least one user row." });
  }

  addDuplicateValueErrors(rows, errors, "email", "Email");
  addDuplicateValueErrors(rows, errors, "employeeId", "Employee ID");

  const importedEmails = new Set(rows.map((row) => row.email).filter(Boolean));
  const allEmails = new Set([...existingUsers.map((user) => user.email.toLowerCase()), ...importedEmails]);
  const rowNumbersByEmail = new Map(rows.map((row) => [row.email, row.rowNumber]));
  const existingUsersById = new Map(existingUsers.map((user) => [user.id, user]));
  const existingUsersByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]));

  rows.forEach((row) => {
    const relatedEmails = [
      ["primary_manager_email", row.primaryManagerEmail],
      ["review_owner_email", row.reviewOwnerEmail],
      ["local_manager_email", row.localManagerEmail],
    ] as const;

    relatedEmails.forEach(([field, email]) => {
      if (email && !allEmails.has(email)) {
        errors.push({ rowNumber: row.rowNumber, field, message: `${email} does not exist in this import or the current database.` });
      }

      if (email && email === row.email) {
        errors.push({ rowNumber: row.rowNumber, field, message: "Users cannot be assigned to themselves." });
      }
    });

    if (row.employeeId) {
      const existingUserWithEmployeeId = existingUsers.find(
        (user) => user.employeeId?.toLowerCase() === row.employeeId?.toLowerCase() && user.email.toLowerCase() !== row.email,
      );

      if (existingUserWithEmployeeId) {
        errors.push({
          rowNumber: row.rowNumber,
          field: "employee_id",
          message: `Employee ID is already used by ${existingUserWithEmployeeId.email}.`,
        });
      }
    }
  });

  const managerGraph = new Map<string, string | null>();
  const reviewOwnerGraph = new Map<string, string | null>();

  existingUsers.forEach((user) => {
    const email = user.email.toLowerCase();
    managerGraph.set(email, user.managerId ? (existingUsersById.get(user.managerId)?.email.toLowerCase() ?? null) : null);
    reviewOwnerGraph.set(
      email,
      user.reviewOwnerId
        ? (existingUsersById.get(user.reviewOwnerId)?.email.toLowerCase() ?? null)
        : user.managerId
          ? (existingUsersById.get(user.managerId)?.email.toLowerCase() ?? null)
          : null,
    );
  });

  rows.forEach((row) => {
    const previousUser = existingUsersByEmail.get(row.email);
    const fallbackManagerEmail = row.primaryManagerEmail ?? null;

    managerGraph.set(row.email, row.primaryManagerEmail ?? (previousUser?.managerId ? (existingUsersById.get(previousUser.managerId)?.email.toLowerCase() ?? null) : null));
    reviewOwnerGraph.set(row.email, row.reviewOwnerEmail ?? fallbackManagerEmail);
  });

  detectCircularRelationships(managerGraph, importedEmails, "primary_manager_email", errors, rowNumbersByEmail);
  detectCircularRelationships(reviewOwnerGraph, importedEmails, "review_owner_email", errors, rowNumbersByEmail);

  return { rows, errors };
}

export function sampleOrgImportCsv() {
  return [
    requiredColumns.join(",") + ",local_manager_email,location,office,employee_id,start_date,avatar_url",
    "Casey Chen,ceo@dten.com,CEO,CEO,Executive,, , ,ACTIVE,,San Jose,HQ,E-001,2024-01-01,",
    "Morgan Lee,head@dten.com,Head of Product Engineering,DEPARTMENT_HEAD,Product Engineering,Certification Team,ceo@dten.com,ceo@dten.com,ACTIVE,,San Jose,HQ,E-002,2024-01-15,",
    "Avery Park,manager@dten.com,Certification Manager,MANAGER,Product Engineering,Certification Team,head@dten.com,head@dten.com,ACTIVE,,San Jose,HQ,E-003,2024-02-01,",
    "Riley Wong,engineer@dten.com,Senior Engineer,EMPLOYEE,Product Engineering,Android Team,manager@dten.com,manager@dten.com,ACTIVE,,Remote,Remote,E-004,2024-03-01,",
  ].join("\n");
}
