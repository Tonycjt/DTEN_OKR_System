"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ObjectiveLevel, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent, getCurrentQuarterMonthIndex } from "@/lib/okr-calculations";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const objectiveLevels: ObjectiveLevel[] = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

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

function numberValue(value: FormDataEntryValue | null, fallback: number) {
  const text = optionalString(value);

  if (!text) {
    return fallback;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: FormDataEntryValue | null, fallback: number) {
  return Math.round(numberValue(value, fallback));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function createObjectiveAction(formData: FormData) {
  const user = await requireUser();
  const level = requiredString(formData.get("level"), "Level") as ObjectiveLevel;
  const status = requiredString(formData.get("status"), "Status") as WorkStatus;

  if (!objectiveLevels.includes(level)) {
    throw new Error("Invalid objective level.");
  }

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid objective status.");
  }

  const objective = await prisma.objective.create({
    data: {
      title: requiredString(formData.get("title"), "Title"),
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: requiredString(formData.get("quarter"), "Quarter"),
      progressPercent: clamp(numberValue(formData.get("progressPercent"), 0), 0, 100),
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      ownerId: requiredString(formData.get("ownerId"), "Owner"),
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
      parentObjectiveId: optionalString(formData.get("parentObjectiveId")),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "CREATED",
      entityType: "Objective",
      entityId: objective.id,
      metadata: { title: objective.title, level: objective.level },
    },
  });

  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  redirect(`/objectives/${objective.id}`);
}

export async function createKeyResultAction(formData: FormData) {
  const user = await requireUser();
  const objectiveId = requiredString(formData.get("objectiveId"), "Objective");
  const startValue = numberValue(formData.get("startValue"), 0);
  const currentValue = numberValue(formData.get("currentValue"), startValue);
  const targetValue = numberValue(formData.get("targetValue"), 100);
  const progressPercent = calculateProgressPercent(startValue, currentValue, targetValue);
  const confidenceScore = clamp(intValue(formData.get("confidenceScore"), 3), 1, 5);
  const status = requiredString(formData.get("status"), "Status") as WorkStatus;

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid KR status.");
  }

  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentMonthTargetPercent = numberValue(formData.get(`targetPercent${currentMonthIndex}`), Number.NaN);
  const pacingStatus = calculatePacingStatus({
    progressPercent,
    currentMonthTargetPercent: Number.isFinite(currentMonthTargetPercent) ? currentMonthTargetPercent : null,
  });

  const keyResult = await prisma.keyResult.create({
    data: {
      objectiveId,
      ownerId: requiredString(formData.get("ownerId"), "Owner"),
      title: requiredString(formData.get("title"), "Title"),
      metricName: optionalString(formData.get("metricName")),
      startValue,
      currentValue,
      targetValue,
      progressPercent,
      confidenceScore,
      status,
      pacingStatus,
      monthlyTargets: {
        create: [1, 2, 3].map((monthIndex) => ({
          monthIndex,
          targetValue: numberValue(formData.get(`targetValue${monthIndex}`), targetValue),
          targetPercent: clamp(numberValue(formData.get(`targetPercent${monthIndex}`), monthIndex === 3 ? 100 : monthIndex * 33), 0, 100),
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "CREATED",
      entityType: "KeyResult",
      entityId: keyResult.id,
      metadata: { title: keyResult.title, objectiveId },
    },
  });

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  redirect(`/key-results/${keyResult.id}`);
}

export async function updateKeyResultAction(formData: FormData) {
  const user = await requireUser();
  const keyResultId = requiredString(formData.get("keyResultId"), "Key Result");
  const objectiveId = requiredString(formData.get("objectiveId"), "Objective");
  const startValue = numberValue(formData.get("startValue"), 0);
  const currentValue = numberValue(formData.get("currentValue"), startValue);
  const targetValue = numberValue(formData.get("targetValue"), 100);
  const progressPercent = calculateProgressPercent(startValue, currentValue, targetValue);
  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentMonthTargetPercent = numberValue(formData.get(`targetPercent${currentMonthIndex}`), Number.NaN);
  const status = requiredString(formData.get("status"), "Status") as WorkStatus;

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid KR status.");
  }

  await prisma.keyResult.update({
    where: { id: keyResultId },
    data: {
      title: requiredString(formData.get("title"), "Title"),
      metricName: optionalString(formData.get("metricName")),
      ownerId: requiredString(formData.get("ownerId"), "Owner"),
      startValue,
      currentValue,
      targetValue,
      progressPercent,
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      status,
      pacingStatus: calculatePacingStatus({
        progressPercent,
        currentMonthTargetPercent: Number.isFinite(currentMonthTargetPercent) ? currentMonthTargetPercent : null,
      }),
    },
  });

  await Promise.all(
    [1, 2, 3].map((monthIndex) =>
      prisma.monthlyTarget.upsert({
        where: {
          keyResultId_monthIndex: {
            keyResultId,
            monthIndex,
          },
        },
        create: {
          keyResultId,
          monthIndex,
          targetValue: numberValue(formData.get(`targetValue${monthIndex}`), targetValue),
          targetPercent: clamp(numberValue(formData.get(`targetPercent${monthIndex}`), monthIndex === 3 ? 100 : monthIndex * 33), 0, 100),
        },
        update: {
          targetValue: numberValue(formData.get(`targetValue${monthIndex}`), targetValue),
          targetPercent: clamp(numberValue(formData.get(`targetPercent${monthIndex}`), monthIndex === 3 ? 100 : monthIndex * 33), 0, 100),
        },
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "UPDATED",
      entityType: "KeyResult",
      entityId: keyResultId,
      metadata: { progressPercent, status },
    },
  });

  revalidatePath(`/key-results/${keyResultId}`);
  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
}
