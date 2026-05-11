"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const orgManagerRoles: UserRole[] = ["ADMIN", "CEO", "DEPARTMENT_HEAD"];
const allowedRoles: UserRole[] = ["ADMIN", "CEO", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"];

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = optionalString(value);

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

export async function createDepartmentAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  await prisma.department.create({
    data: {
      name: requiredString(formData.get("name"), "Department name"),
      description: optionalString(formData.get("description")),
    },
  });

  revalidatePath("/admin/departments");
}

export async function createTeamAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  await prisma.team.create({
    data: {
      name: requiredString(formData.get("name"), "Team name"),
      description: optionalString(formData.get("description")),
      departmentId: requiredString(formData.get("departmentId"), "Department"),
    },
  });

  revalidatePath("/admin/teams");
}

export async function createUserAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  const role = requiredString(formData.get("role"), "Role") as UserRole;

  if (!allowedRoles.includes(role)) {
    throw new Error("Invalid role.");
  }

  const password = optionalString(formData.get("password")) ?? "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email: requiredString(formData.get("email"), "Email").toLowerCase(),
      passwordHash,
      name: requiredString(formData.get("name"), "Name"),
      role,
      title: optionalString(formData.get("title")),
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
      managerId: optionalString(formData.get("managerId")),
    },
  });

  revalidatePath("/admin/users");
}
