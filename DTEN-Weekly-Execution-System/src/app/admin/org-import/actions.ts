"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { initialOrgImportState, type OrgImportState, type OrgImportSummary } from "@/app/admin/org-import/state";
import { parseOrgImportText, type OrgImportRow } from "@/lib/org-import";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

async function readImportText(formData: FormData) {
  const pastedText = String(formData.get("csvText") ?? "").trim();
  const file = formData.get("csvFile");

  if (typeof File !== "undefined" && file instanceof File && file.size > 0) {
    return (await file.text()).trim();
  }

  return pastedText;
}

function departmentKey(name: string) {
  return name.trim().toLowerCase();
}

function teamKey(departmentId: string, teamName: string) {
  return `${departmentId}:${teamName.trim().toLowerCase()}`;
}

function uniqueValues(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0))));
}

export async function importOrgStructureAction(_previousState: OrgImportState, formData: FormData): Promise<OrgImportState> {
  const actor = await requireRole(["ADMIN", "CEO"]);
  const importText = await readImportText(formData);

  if (!importText) {
    return {
      ...initialOrgImportState,
      status: "validation_failed",
      message: "Import data is required.",
      errors: [{ rowNumber: null, field: "file", message: "Paste CSV data or upload a CSV/TSV file." }],
    };
  }

  const existingUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      managerId: true,
      localManagerId: true,
      reviewOwnerId: true,
      employeeId: true,
    },
  });

  const validation = parseOrgImportText(importText, existingUsers);

  if (validation.errors.length > 0) {
    return {
      ...initialOrgImportState,
      status: "validation_failed",
      message: "Validation failed. No organization changes were applied.",
      errors: validation.errors,
      summary: {
        created: 0,
        updated: 0,
        inactive: 0,
        departmentsCreated: 0,
        teamsCreated: 0,
        managerRelationshipsUpdated: 0,
        reviewOwnersUpdated: 0,
        skippedRows: validation.errors.filter((error) => error.rowNumber !== null).length,
        appliedRows: 0,
      },
    };
  }

  const summary = await applyOrgImportRows(validation.rows, actor.id);

  revalidatePath("/admin/org-import");
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  revalidatePath("/reviews/pending");

  return {
    ...initialOrgImportState,
    status: "applied",
    message: "Organization import applied successfully.",
    errors: [],
    summary,
  };
}

async function applyOrgImportRows(rows: OrgImportRow[], actorId: string): Promise<OrgImportSummary> {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  return prisma.$transaction(async (tx) => {
    let departmentsCreated = 0;
    let teamsCreated = 0;
    let managerRelationshipsUpdated = 0;
    let reviewOwnersUpdated = 0;

    const [existingDepartments, existingTeams, existingUsers] = await Promise.all([
      tx.department.findMany(),
      tx.team.findMany(),
      tx.user.findMany(),
    ]);

    const departmentsByName = new Map(existingDepartments.map((department) => [departmentKey(department.name), department]));
    const departmentNames = uniqueValues(rows.map((row) => row.department));

    for (const departmentName of departmentNames) {
      if (!departmentsByName.has(departmentKey(departmentName))) {
        const department = await tx.department.create({
          data: {
            name: departmentName,
            description: "Created from organization structure import.",
          },
        });

        departmentsByName.set(departmentKey(department.name), department);
        departmentsCreated += 1;
      }
    }

    const teamsByName = new Map(existingTeams.map((team) => [teamKey(team.departmentId, team.name), team]));

    for (const row of rows) {
      if (!row.team || !row.department) {
        continue;
      }

      const department = departmentsByName.get(departmentKey(row.department));

      if (!department) {
        continue;
      }

      const key = teamKey(department.id, row.team);

      if (!teamsByName.has(key)) {
        const team = await tx.team.create({
          data: {
            name: row.team,
            description: "Created from organization structure import.",
            departmentId: department.id,
          },
        });

        teamsByName.set(key, team);
        teamsCreated += 1;
      }
    }

    const existingUsersByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]));
    const usersByEmail = new Map(existingUsersByEmail);
    let created = 0;
    let updated = 0;
    let inactive = 0;

    for (const row of rows) {
      const department = row.department ? departmentsByName.get(departmentKey(row.department)) : null;
      const team = row.team && department ? teamsByName.get(teamKey(department.id, row.team)) : null;
      const existingUser = existingUsersByEmail.get(row.email);
      const baseData = {
        email: row.email,
        name: row.name,
        role: row.role,
        title: row.title,
        isActive: row.employmentStatus === "ACTIVE",
        departmentId: department?.id ?? null,
        teamId: team?.id ?? null,
        location: row.location,
        office: row.office,
        employeeId: row.employeeId,
        startDate: row.startDate,
        avatarUrl: row.avatarUrl,
      };

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: baseData,
          })
        : await tx.user.create({
            data: {
              ...baseData,
              passwordHash,
            },
          });

      usersByEmail.set(row.email, user);

      if (existingUser) {
        updated += 1;
      } else {
        created += 1;
      }

      if (row.employmentStatus === "INACTIVE") {
        inactive += 1;
      }
    }

    for (const row of rows) {
      const user = usersByEmail.get(row.email);

      if (!user) {
        continue;
      }

      const existingUser = existingUsersByEmail.get(row.email);
      const managerId = row.primaryManagerEmail ? (usersByEmail.get(row.primaryManagerEmail)?.id ?? null) : null;
      const localManagerId = row.localManagerEmail ? (usersByEmail.get(row.localManagerEmail)?.id ?? null) : null;
      const reviewOwnerId = row.reviewOwnerEmail ? (usersByEmail.get(row.reviewOwnerEmail)?.id ?? null) : managerId;

      if ((existingUser?.managerId ?? null) !== managerId) {
        managerRelationshipsUpdated += 1;
      }

      if ((existingUser?.reviewOwnerId ?? null) !== reviewOwnerId) {
        reviewOwnersUpdated += 1;
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          managerId,
          localManagerId,
          reviewOwnerId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: existingUser ? "UPDATED" : "CREATED",
          entityType: "User",
          entityId: updatedUser.id,
          metadata: {
            source: "organization-import",
            rowNumber: row.rowNumber,
            email: row.email,
            employmentStatus: row.employmentStatus,
            managerEmail: row.primaryManagerEmail,
            localManagerEmail: row.localManagerEmail,
            reviewOwnerEmail: row.reviewOwnerEmail ?? row.primaryManagerEmail,
          },
        },
      });
    }

    return {
      created,
      updated,
      inactive,
      departmentsCreated,
      teamsCreated,
      managerRelationshipsUpdated,
      reviewOwnersUpdated,
      skippedRows: 0,
      appliedRows: rows.length,
    };
  });
}
