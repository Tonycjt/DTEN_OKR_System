"use server";

import { revalidatePath } from "next/cache";
import type { FollowUpSourceType, FollowUpStatus, UserRole } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { sendFollowUpAssignedEmail } from "@/server/email-notifications";
import { prisma } from "@/server/prisma";

const creatorRoles: UserRole[] = ["ADMIN", "CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"];
const sourceTypes: FollowUpSourceType[] = ["KEY_RESULT", "WEEKLY_REPORT", "MANAGER_REVIEW"];
const followUpStatuses: FollowUpStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];

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

function optionalDate(value: FormDataEntryValue | null) {
  const text = optionalString(value);

  if (!text) {
    return null;
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Due date is invalid.");
  }

  return date;
}

export async function createFollowUpAction(formData: FormData) {
  const user = await requireUser();

  if (!creatorRoles.includes(user.role)) {
    throw new Error("Only managers and leaders can create follow-ups.");
  }

  const sourceObjectType = requiredString(formData.get("sourceObjectType"), "Source type") as FollowUpSourceType;
  const sourceObjectId = requiredString(formData.get("sourceObjectId"), "Source object");
  const ownerId = requiredString(formData.get("ownerId"), "Owner");
  const content = requiredString(formData.get("content"), "Follow-up");
  const dueDate = optionalDate(formData.get("dueDate"));
  const redirectPath = optionalString(formData.get("redirectPath")) ?? "/dashboard";

  if (!sourceTypes.includes(sourceObjectType)) {
    throw new Error("Invalid follow-up source.");
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!owner) {
    throw new Error("Follow-up owner not found.");
  }

  await prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.create({
      data: {
        sourceObjectType,
        sourceObjectId,
        ownerId,
        assignedById: user.id,
        content,
        dueDate,
      },
    });

    await tx.notification.create({
      data: {
        userId: ownerId,
        type: "FOLLOW_UP_ASSIGNED",
        title: "Follow-up assigned",
        body: `${user.name} assigned a follow-up: ${content}`,
        relatedUrl: redirectPath,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATED",
        entityType: "FollowUp",
        entityId: followUp.id,
        metadata: {
          sourceObjectType,
          sourceObjectId,
          ownerId,
          dueDate: dueDate?.toISOString() ?? null,
        },
      },
    });
  });

  await sendFollowUpAssignedEmail({
    assignee: owner,
    assigner: user,
    content,
    dueDate,
    relatedPath: redirectPath,
  });

  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath(redirectPath);
}

export async function updateFollowUpStatusAction(formData: FormData) {
  const user = await requireUser();
  const followUpId = requiredString(formData.get("followUpId"), "Follow-up");
  const status = requiredString(formData.get("status"), "Status") as FollowUpStatus;
  const redirectPath = optionalString(formData.get("redirectPath")) ?? "/dashboard";

  if (!followUpStatuses.includes(status)) {
    throw new Error("Invalid follow-up status.");
  }

  const followUp = await prisma.followUp.findUnique({
    where: { id: followUpId },
    select: {
      id: true,
      ownerId: true,
      assignedById: true,
    },
  });

  if (!followUp) {
    throw new Error("Follow-up not found.");
  }

  const canUpdate = followUp.ownerId === user.id || followUp.assignedById === user.id || user.role === "ADMIN";

  if (!canUpdate) {
    throw new Error("You can only update follow-ups assigned to you or created by you.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.followUp.update({
      where: { id: followUp.id },
      data: { status },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATED",
        entityType: "FollowUp",
        entityId: followUp.id,
        metadata: { status },
      },
    });
  });

  revalidatePath("/dashboard");
  revalidatePath(redirectPath);
}
