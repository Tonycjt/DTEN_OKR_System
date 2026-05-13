"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ObjectiveLevel, ObjectiveProgressMode, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent, getCurrentQuarterMonthIndex } from "@/lib/okr-calculations";
import { validateObjectiveKrWeights } from "@/lib/rollup-validation";
import { requireUser } from "@/server/auth";
import { sendKrBlockedEmail } from "@/server/email-notifications";
import { recalculateObjectiveProgressFromKrs } from "@/server/objective-rollup";
import { prisma } from "@/server/prisma";

const objectiveLevels: ObjectiveLevel[] = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"];
const objectiveProgressModes: ObjectiveProgressMode[] = ["MANUAL", "AUTO"];
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
  const progressMode = (optionalString(formData.get("progressMode")) ?? "MANUAL") as ObjectiveProgressMode;

  if (!objectiveLevels.includes(level)) {
    throw new Error("Invalid objective level.");
  }

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid objective status.");
  }

  if (!objectiveProgressModes.includes(progressMode)) {
    throw new Error("Invalid objective progress mode.");
  }

  const objective = await prisma.objective.create({
    data: {
      title: requiredString(formData.get("title"), "Title"),
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: requiredString(formData.get("quarter"), "Quarter"),
      progressMode,
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

export async function updateObjectiveAction(formData: FormData) {
  const user = await requireUser();
  const objectiveId = requiredString(formData.get("objectiveId"), "Objective");
  const level = requiredString(formData.get("level"), "Level") as ObjectiveLevel;
  const status = requiredString(formData.get("status"), "Status") as WorkStatus;
  const progressMode = (optionalString(formData.get("progressMode")) ?? "MANUAL") as ObjectiveProgressMode;
  const parentObjectiveId = optionalString(formData.get("parentObjectiveId"));

  if (!objectiveLevels.includes(level)) {
    throw new Error("Invalid objective level.");
  }

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid objective status.");
  }

  if (!objectiveProgressModes.includes(progressMode)) {
    throw new Error("Invalid objective progress mode.");
  }

  if (parentObjectiveId === objectiveId) {
    throw new Error("An objective cannot be aligned to itself.");
  }

  const existingObjective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      approvalStatus: true,
      keyResults: {
        select: {
          weightPercent: true,
        },
      },
    },
  });

  if (!existingObjective) {
    throw new Error("Objective not found.");
  }

  if (existingObjective.keyResults.length > 0) {
    const weightValidation = validateObjectiveKrWeights({
      weights: existingObjective.keyResults.map((keyResult) => ({ percent: keyResult.weightPercent })),
      status,
      approvalStatus: existingObjective.approvalStatus,
    });

    if (!weightValidation.isValid) {
      throw new Error(weightValidation.message ?? "KR weights must be valid before saving.");
    }
  }

  const objective = await prisma.objective.update({
    where: { id: objectiveId },
    data: {
      title: requiredString(formData.get("title"), "Title"),
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: requiredString(formData.get("quarter"), "Quarter"),
      progressMode,
      progressPercent: progressMode === "AUTO" ? undefined : clamp(numberValue(formData.get("progressPercent"), 0), 0, 100),
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      ownerId: requiredString(formData.get("ownerId"), "Owner"),
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
      parentObjectiveId,
    },
  });

  if (progressMode === "AUTO") {
    await prisma.$transaction(async (tx) => {
      await recalculateObjectiveProgressFromKrs(tx, objectiveId);
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "UPDATED",
      entityType: "Objective",
      entityId: objective.id,
      metadata: { title: objective.title, status: objective.status, progressPercent: objective.progressPercent },
    },
  });

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
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
  const ownerId = requiredString(formData.get("ownerId"), "Owner");
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 0), 0, 100);

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid KR status.");
  }

  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentMonthTargetPercent = numberValue(formData.get(`targetPercent${currentMonthIndex}`), Number.NaN);
  const pacingStatus = calculatePacingStatus({
    progressPercent,
    currentMonthTargetPercent: Number.isFinite(currentMonthTargetPercent) ? currentMonthTargetPercent : null,
  });

  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      status: true,
      approvalStatus: true,
      keyResults: {
        select: {
          weightPercent: true,
        },
      },
    },
  });

  if (!objective) {
    throw new Error("Objective not found.");
  }

  const weightValidation = validateObjectiveKrWeights({
    weights: [...objective.keyResults.map((keyResult) => ({ percent: keyResult.weightPercent })), { percent: weightPercent }],
    status: objective.status,
    approvalStatus: objective.approvalStatus,
  });

  if (!weightValidation.isValid) {
    throw new Error(weightValidation.message ?? "KR weights must be valid before saving.");
  }

  const keyResult = await prisma.$transaction(async (tx) => {
    const createdKeyResult = await tx.keyResult.create({
      data: {
        objectiveId,
        ownerId,
        title: requiredString(formData.get("title"), "Title"),
        metricName: optionalString(formData.get("metricName")),
        startValue,
        currentValue,
        targetValue,
        progressPercent,
        weightPercent,
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

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATED",
        entityType: "KeyResult",
        entityId: createdKeyResult.id,
        metadata: { title: createdKeyResult.title, objectiveId, weightPercent },
      },
    });

    await recalculateObjectiveProgressFromKrs(tx, objectiveId);

    return createdKeyResult;
  });

  if (status === "ON_HOLD") {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (owner) {
      await prisma.notification.create({
        data: {
          userId: owner.id,
          type: "KR_BLOCKED",
          title: "KR blocked",
          body: `${keyResult.title} was created as blocked/on hold.`,
          relatedUrl: `/key-results/${keyResult.id}`,
        },
      });

      await sendKrBlockedEmail({
        owner,
        keyResultTitle: keyResult.title,
        relatedPath: `/key-results/${keyResult.id}`,
      });
    }
  }

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
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
  const ownerId = requiredString(formData.get("ownerId"), "Owner");
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 100), 0, 100);

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid KR status.");
  }

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: {
      id: true,
      title: true,
      status: true,
      weightPercent: true,
      objective: {
        select: {
          status: true,
          approvalStatus: true,
          keyResults: {
            select: {
              id: true,
              weightPercent: true,
            },
          },
        },
      },
      owner: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!existingKeyResult) {
    throw new Error("Key Result not found.");
  }

  const weightValidation = validateObjectiveKrWeights({
    weights: existingKeyResult.objective.keyResults.map((keyResult) => ({
      percent: keyResult.id === keyResultId ? weightPercent : keyResult.weightPercent,
    })),
    status: existingKeyResult.objective.status,
    approvalStatus: existingKeyResult.objective.approvalStatus,
  });

  if (!weightValidation.isValid) {
    throw new Error(weightValidation.message ?? "KR weights must be valid before saving.");
  }

  const updatedKeyResult = await prisma.$transaction(async (tx) => {
    const result = await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        title: requiredString(formData.get("title"), "Title"),
        metricName: optionalString(formData.get("metricName")),
        ownerId,
        startValue,
        currentValue,
        targetValue,
        progressPercent,
        weightPercent,
        confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
        status,
        pacingStatus: calculatePacingStatus({
          progressPercent,
          currentMonthTargetPercent: Number.isFinite(currentMonthTargetPercent) ? currentMonthTargetPercent : null,
        }),
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    await Promise.all(
      [1, 2, 3].map((monthIndex) =>
        tx.monthlyTarget.upsert({
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

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATED",
        entityType: "KeyResult",
        entityId: keyResultId,
        metadata: { progressPercent, status, weightPercent },
      },
    });

    await recalculateObjectiveProgressFromKrs(tx, objectiveId);

    return result;
  });

  if (existingKeyResult.status !== "ON_HOLD" && status === "ON_HOLD") {
    await prisma.notification.create({
      data: {
        userId: updatedKeyResult.ownerId,
        type: "KR_BLOCKED",
        title: "KR blocked",
        body: `${updatedKeyResult.title} was marked blocked/on hold.`,
        relatedUrl: `/key-results/${keyResultId}`,
      },
    });

    await sendKrBlockedEmail({
      owner: updatedKeyResult.owner,
      keyResultTitle: updatedKeyResult.title,
      relatedPath: `/key-results/${keyResultId}`,
    });
  }

  revalidatePath(`/key-results/${keyResultId}`);
  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
