"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PriorityType } from "@prisma/client";
import { getMondayWeekStart } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const priorityTypes: PriorityType[] = ["KR_LINKED", "AD_HOC"];

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = optionalString(value);
  if (!text) throw new Error(`${fieldName} is required.`);
  return text;
}

async function isAssignedKr(krId: string, userId: string) {
  const kr = await prisma.keyResult.findFirst({ where: { id: krId, ownerId: userId }, select: { id: true } });
  return Boolean(kr);
}

export async function createPlanPriorityAction(formData: FormData) {
  const user = await requireUser();
  const weekStart = getMondayWeekStart();
  const type = requiredString(formData.get("type"), "Priority type") as PriorityType;
  const linkedKeyResultId = optionalString(formData.get("linkedKeyResultId"));

  if (!priorityTypes.includes(type)) redirect("/weekly-plan?error=invalid-type");
  if (type === "KR_LINKED" && !linkedKeyResultId) redirect("/weekly-plan?error=kr-required");
  if (linkedKeyResultId && !(await isAssignedKr(linkedKeyResultId, user.id))) redirect("/weekly-plan?error=kr-not-assigned");

  await prisma.weeklyPriority.create({
    data: {
      userId: user.id,
      weekStartDate: weekStart,
      type,
      content: requiredString(formData.get("content"), "Priority"),
      status: "NOT_STARTED",
      linkedKeyResultId: type === "KR_LINKED" ? linkedKeyResultId : null,
    },
  });

  revalidatePath("/weekly-plan");
  revalidatePath("/weekly-report/current");
}

export async function updatePlanPriorityAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");
  const type = requiredString(formData.get("type"), "Priority type") as PriorityType;
  const linkedKeyResultId = optionalString(formData.get("linkedKeyResultId"));

  if (!priorityTypes.includes(type)) redirect("/weekly-plan?error=invalid-type");
  if (type === "KR_LINKED" && !linkedKeyResultId) redirect("/weekly-plan?error=kr-required");

  const existing = await prisma.weeklyPriority.findFirst({
    where: { id: priorityId, userId: user.id },
    select: { id: true, linkedKeyResultId: true },
  });

  if (!existing) redirect("/weekly-plan?error=not-found");

  if (linkedKeyResultId && linkedKeyResultId !== existing.linkedKeyResultId && !(await isAssignedKr(linkedKeyResultId, user.id))) {
    redirect("/weekly-plan?error=kr-not-assigned");
  }

  await prisma.weeklyPriority.update({
    where: { id: priorityId, userId: user.id },
    data: {
      type,
      content: requiredString(formData.get("content"), "Priority"),
      linkedKeyResultId: type === "KR_LINKED" ? linkedKeyResultId : null,
    },
  });

  revalidatePath("/weekly-plan");
  revalidatePath("/weekly-report/current");
}

export async function deletePlanPriorityAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");

  await prisma.weeklyPriority.delete({
    where: { id: priorityId, userId: user.id },
  });

  revalidatePath("/weekly-plan");
  revalidatePath("/weekly-report/current");
}

export async function carryOverPriorityAction(formData: FormData) {
  const user = await requireUser();
  const sourcePriorityId = requiredString(formData.get("sourcePriorityId"), "Source priority");
  const weekStart = getMondayWeekStart();

  const source = await prisma.weeklyPriority.findFirst({
    where: { id: sourcePriorityId, userId: user.id },
    select: { id: true, type: true, content: true, linkedKeyResultId: true },
  });

  if (!source) redirect("/weekly-plan?error=not-found");

  // Prevent duplicate carry-overs for the same source into the same week.
  const existing = await prisma.weeklyPriority.findFirst({
    where: { carriedOverFromId: sourcePriorityId, userId: user.id, weekStartDate: weekStart },
    select: { id: true },
  });

  if (existing) redirect("/weekly-plan?error=already-carried-over");

  await prisma.weeklyPriority.create({
    data: {
      userId: user.id,
      weekStartDate: weekStart,
      type: source.type,
      content: source.content,
      status: "NOT_STARTED",
      linkedKeyResultId: source.linkedKeyResultId,
      carriedOverFromId: source.id,
    },
  });

  revalidatePath("/weekly-plan");
  revalidatePath("/weekly-report/current");
}
