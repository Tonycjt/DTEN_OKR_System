"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

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

export async function saveMonthlyTargetsAction(formData: FormData) {
  const user = await requireUser();
  const keyResultId = requiredString(formData.get("keyResultId"), "Key Result");

  const keyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: { ownerId: true },
  });

  if (!keyResult) throw new Error("Key Result not found.");

  const canEdit =
    keyResult.ownerId === user.id ||
    user.role === "CEO" ||
    user.role === "ADMIN" ||
    user.role === "EXECUTIVE" ||
    user.role === "MANAGER";

  if (!canEdit) throw new Error("You do not have permission to set monthly targets for this KR.");

  await Promise.all(
    [1, 2, 3].map((monthIndex) => {
      const title = optionalString(formData.get(`title${monthIndex}`));
      return prisma.monthlyTarget.upsert({
        where: { keyResultId_monthIndex: { keyResultId, monthIndex } },
        create: { keyResultId, monthIndex, title },
        update: { title },
      });
    })
  );

  revalidatePath(`/key-results/${keyResultId}`);
}

export async function addKeyResultCommentAction(formData: FormData) {
  const user = await requireUser();
  const keyResultId = requiredString(formData.get("keyResultId"), "Key Result");
  const body = requiredString(formData.get("body"), "Comment");

  const keyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      owner: true,
      objective: true,
    },
  });

  if (!keyResult) {
    throw new Error("Key Result not found.");
  }

  const notifyUserIds = new Set<string>();

  if (keyResult.ownerId && keyResult.ownerId !== user.id) {
    notifyUserIds.add(keyResult.ownerId);
  }

  if (keyResult.owner?.managerId && keyResult.owner.managerId !== user.id) {
    notifyUserIds.add(keyResult.owner.managerId);
  }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        keyResultId,
        authorId: user.id,
        body,
      },
    });

    if (notifyUserIds.size > 0) {
      await tx.notification.createMany({
        data: Array.from(notifyUserIds).map((userId) => ({
          userId,
          type: "KR_COMMENT",
          title: "New KR comment",
          body: `${user.name} commented on ${keyResult.title}.`,
          relatedUrl: `/key-results/${keyResult.id}`,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATED",
        entityType: "Comment",
        entityId: comment.id,
        metadata: {
          keyResultId,
          objectiveId: keyResult.objectiveId,
          objectiveTitle: keyResult.objective.title,
        },
      },
    });
  });

  revalidatePath(`/key-results/${keyResultId}`);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
