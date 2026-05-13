"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const orgManagerRoles: UserRole[] = ["ADMIN", "CEO", "DEPARTMENT_HEAD"];
const allowedRoles: UserRole[] = ["ADMIN", "CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE", "VIEWER"];

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

export async function updateDepartmentAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  await prisma.department.update({
    where: { id: requiredString(formData.get("departmentId"), "Department") },
    data: {
      name: requiredString(formData.get("name"), "Department name"),
      description: optionalString(formData.get("description")),
    },
  });

  revalidatePath("/admin/departments");
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
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

export async function updateTeamAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  await prisma.team.update({
    where: { id: requiredString(formData.get("teamId"), "Team") },
    data: {
      name: requiredString(formData.get("name"), "Team name"),
      description: optionalString(formData.get("description")),
      departmentId: requiredString(formData.get("departmentId"), "Department"),
    },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
}

export async function createUserAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  const role = requiredString(formData.get("role"), "Role") as UserRole;

  if (!allowedRoles.includes(role)) {
    throw new Error("Invalid role.");
  }

  const password = optionalString(formData.get("password")) ?? "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const managerId = optionalString(formData.get("managerId"));
  const reviewOwnerId = optionalString(formData.get("reviewOwnerId"));

  await prisma.user.create({
    data: {
      email: requiredString(formData.get("email"), "Email").toLowerCase(),
      passwordHash,
      name: requiredString(formData.get("name"), "Name"),
      role,
      title: optionalString(formData.get("title")),
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
      managerId,
      reviewOwnerId: reviewOwnerId ?? managerId,
    },
  });

  revalidatePath("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  await requireRole(orgManagerRoles);

  const userId = requiredString(formData.get("userId"), "User");
  const role = requiredString(formData.get("role"), "Role") as UserRole;

  if (!allowedRoles.includes(role)) {
    throw new Error("Invalid role.");
  }

  const password = optionalString(formData.get("password"));
  const managerId = optionalString(formData.get("managerId"));
  const reviewOwnerId = optionalString(formData.get("reviewOwnerId"));

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: requiredString(formData.get("email"), "Email").toLowerCase(),
      name: requiredString(formData.get("name"), "Name"),
      role,
      title: optionalString(formData.get("title")),
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
      managerId: managerId === userId ? null : managerId,
      reviewOwnerId: reviewOwnerId === userId ? null : reviewOwnerId,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
}
