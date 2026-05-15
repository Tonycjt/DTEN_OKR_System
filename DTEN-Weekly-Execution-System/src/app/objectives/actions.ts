"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ObjectiveLevel, ObjectiveProgressSource, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent } from "@/lib/okr-calculations";
import { isInAssignableScope } from "@/lib/org-scope";
import { validateObjectiveKrWeights } from "@/lib/rollup-validation";
import { requireUser } from "@/server/auth";
import { sendKrBlockedEmail } from "@/server/email-notifications";
import { recalculateObjectiveAndParents, recalculateObjectiveProgress, recalculateParentObjectiveProgress } from "@/server/objective-rollup";
import { prisma } from "@/server/prisma";

const objectiveLevels: ObjectiveLevel[] = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"];
const objectiveProgressSources: ObjectiveProgressSource[] = ["MANUAL", "DIRECT_KRS"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

export type ObjectiveFormErrors = {
  title?: string;
  quarter?: string;
  ownerId?: string;
  krs?: string;
  general?: string;
};

export type ObjectiveFormState = { errors: ObjectiveFormErrors } | null;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function numberValue(value: FormDataEntryValue | null, fallback: number) {
  const text = optionalString(value);
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: FormDataEntryValue | null, fallback: number) {
  return Math.round(numberValue(value, fallback));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function actionAlert(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function requiredStringOrAlert(value: FormDataEntryValue | null, fieldName: string, path: string) {
  const text = optionalString(value);
  if (!text) actionAlert(path, `${fieldName} is required.`);
  return text;
}

// ─── Create Objective ─────────────────────────────────────────────────────────
// Called with useActionState. intent="save" → DRAFT (no KR weight check).
// intent="publish" → validates all required fields, KR scope, KR weights, then saves as ON_TRACK.

export async function createObjectiveAction(
  _prevState: ObjectiveFormState,
  formData: FormData,
): Promise<ObjectiveFormState> {
  const user = await requireUser();
  const isPublish = optionalString(formData.get("intent")) === "publish";

  const title = optionalString(formData.get("title"));
  const quarter = optionalString(formData.get("quarter"));
  const ownerId = optionalString(formData.get("ownerId"));
  const level = (optionalString(formData.get("level")) ?? "COMPANY") as ObjectiveLevel;
  const progressSource = (optionalString(formData.get("progressSource")) ?? "DIRECT_KRS") as ObjectiveProgressSource;

  const errors: ObjectiveFormErrors = {};
  if (!title) errors.title = "Title is required.";
  if (!quarter) errors.quarter = "Quarter is required.";
  if (!ownerId) errors.ownerId = "Owner is required.";
  if (!objectiveLevels.includes(level)) errors.general = "Invalid level.";
  if (!objectiveProgressSources.includes(progressSource)) errors.general = "Invalid progress source.";

  // Parse KR rows (only rows that have a title)
  const krCount = intValue(formData.get("krCount"), 0);
  const krRows = Array.from({ length: krCount }, (_, i) => ({
    title: optionalString(formData.get(`krTitle_${i}`)),
    ownerId: optionalString(formData.get(`krOwnerId_${i}`)),
    startValue: numberValue(formData.get(`krStart_${i}`), 0),
    targetValue: numberValue(formData.get(`krTarget_${i}`), 100),
    weightPercent: clamp(numberValue(formData.get(`krWeight_${i}`), 0), 0, 100),
    confidenceScore: clamp(intValue(formData.get(`krConfidence_${i}`), 3), 1, 5),
  })).filter((kr) => Boolean(kr.title));

  if (isPublish && Object.keys(errors).length === 0) {
    // Validate each KR owner is within actor's scope
    for (const kr of krRows) {
      if (!kr.ownerId) {
        errors.krs = "Every KR must have an owner assigned.";
        break;
      }
      if (!(await isInAssignableScope(user.id, user.role, kr.ownerId))) {
        errors.krs = "One or more KR owners are outside your assignable org scope.";
        break;
      }
    }

    // Validate KR weights sum to 100 when there are KRs and source is DIRECT_KRS
    if (!errors.krs && progressSource === "DIRECT_KRS" && krRows.length > 0) {
      const total = krRows.reduce((sum, kr) => sum + kr.weightPercent, 0);
      if (Math.abs(total - 100) > 0.01) {
        errors.krs = `KR weights must total 100% to publish. Current total: ${Math.round(total * 100) / 100}%.`;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors };

  const status: WorkStatus = isPublish ? "ON_TRACK" : "DRAFT";

  const objective = await prisma.objective.create({
    data: {
      title: title!,
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: quarter!,
      progressSource,
      progressPercent: progressSource === "MANUAL" ? clamp(numberValue(formData.get("progressPercent"), 0), 0, 100) : 0,
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      ownerId: ownerId!,
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "CREATED",
      entityType: "Objective",
      entityId: objective.id,
      metadata: { title: objective.title, level: objective.level, status },
    },
  });

  // Create any inline KR rows
  for (const kr of krRows) {
    if (!kr.title || !kr.ownerId) continue;
    const progressPercent = calculateProgressPercent(kr.startValue, kr.startValue, kr.targetValue);
    await prisma.keyResult.create({
      data: {
        objectiveId: objective.id,
        ownerId: kr.ownerId,
        title: kr.title,
        startValue: kr.startValue,
        currentValue: kr.startValue,
        targetValue: kr.targetValue,
        progressPercent,
        weightPercent: kr.weightPercent,
        confidenceScore: kr.confidenceScore,
        status: "ON_TRACK",
        pacingStatus: calculatePacingStatus({ progressPercent, currentMonthTargetPercent: null }),
      },
    });
  }

  if (krRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      await recalculateObjectiveProgress(tx, objective.id);
    });
  }

  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  redirect(`/objectives/${objective.id}`);
}

// ─── Update Objective ─────────────────────────────────────────────────────────
// Called with useActionState. intent="save" → minimal validation (draft save).
// intent="update" → full validation including KR weights.

export async function updateObjectiveAction(
  _prevState: ObjectiveFormState,
  formData: FormData,
): Promise<ObjectiveFormState> {
  const user = await requireUser();
  const objectiveId = optionalString(formData.get("objectiveId"));
  if (!objectiveId) actionAlert("/company-okrs", "Objective ID missing.");

  const isUpdate = optionalString(formData.get("intent")) === "update";
  const level = (optionalString(formData.get("level")) ?? "COMPANY") as ObjectiveLevel;
  const status = (optionalString(formData.get("status")) ?? "DRAFT") as WorkStatus;
  const progressSource = (optionalString(formData.get("progressSource")) ?? "DIRECT_KRS") as ObjectiveProgressSource;

  const errors: ObjectiveFormErrors = {};
  const title = optionalString(formData.get("title"));
  const quarter = optionalString(formData.get("quarter"));
  const ownerId = optionalString(formData.get("ownerId"));

  if (!title) errors.title = "Title is required.";
  if (!quarter) errors.quarter = "Quarter is required.";
  if (!ownerId) errors.ownerId = "Owner is required.";
  if (!objectiveLevels.includes(level)) errors.general = "Invalid level.";
  if (!objectiveProgressSources.includes(progressSource)) errors.general = "Invalid progress source.";
  if (!workStatuses.includes(status)) errors.general = "Invalid status.";

  if (Object.keys(errors).length > 0) return { errors };

  const existingObjective = await prisma.objective.findUnique({
    where: { id: objectiveId! },
    select: {
      ownerId: true,
      approvalStatus: true,
      keyResults: { select: { weightPercent: true } },
    },
  });

  if (!existingObjective) actionAlert("/company-okrs", "Objective not found.");

  if (existingObjective!.ownerId !== user.id && user.role !== "CEO" && user.role !== "ADMIN") {
    return { errors: { general: "Only the objective owner can edit this objective." } };
  }

  // For the Update action (published objective): validate KR weights if DIRECT_KRS
  if (isUpdate && progressSource === "DIRECT_KRS" && existingObjective!.keyResults.length > 0) {
    const weightValidation = validateObjectiveKrWeights({
      weights: existingObjective!.keyResults.map((kr) => ({ percent: kr.weightPercent })),
      status,
      approvalStatus: existingObjective!.approvalStatus,
    });
    if (!weightValidation.isValid) {
      return { errors: { krs: weightValidation.message ?? "KR weights must total 100% before updating." } };
    }
  }

  const objective = await prisma.objective.update({
    where: { id: objectiveId! },
    data: {
      title: title!,
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: quarter!,
      progressSource,
      progressPercent: progressSource === "MANUAL" ? clamp(numberValue(formData.get("progressPercent"), 0), 0, 100) : undefined,
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      ownerId: ownerId!,
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
    },
  });

  await prisma.$transaction(async (tx) => {
    await recalculateObjectiveProgress(tx, objectiveId!);
    await recalculateParentObjectiveProgress(tx, objectiveId!);
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "UPDATED",
      entityType: "Objective",
      entityId: objective.id,
      metadata: { title: objective.title, status: objective.status },
    },
  });

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  redirect(`/objectives/${objectiveId!}`);
}

// ─── Key Result actions (unchanged) ──────────────────────────────────────────

export async function createKeyResultAction(formData: FormData) {
  const user = await requireUser();
  const objectiveId = requiredStringOrAlert(formData.get("objectiveId"), "Objective", "/company-okrs");
  const alertPath = `/objectives/${objectiveId}`;
  const startValue = numberValue(formData.get("startValue"), 0);
  const currentValue = numberValue(formData.get("currentValue"), startValue);
  const targetValue = numberValue(formData.get("targetValue"), 100);
  const progressPercent = calculateProgressPercent(startValue, currentValue, targetValue);
  const confidenceScore = clamp(intValue(formData.get("confidenceScore"), 3), 1, 5);
  const status = requiredStringOrAlert(formData.get("status"), "Status", alertPath) as WorkStatus;
  const ownerId = requiredStringOrAlert(formData.get("ownerId"), "Owner", alertPath);
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 0), 0, 100);

  if (!workStatuses.includes(status)) actionAlert(alertPath, "Invalid KR status.");

  if (!(await isInAssignableScope(user.id, user.role, ownerId))) {
    actionAlert(alertPath, "You cannot assign a KR to that user.");
  }

  const pacingStatus = calculatePacingStatus({ progressPercent, currentMonthTargetPercent: null });

  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      ownerId: true,
      status: true,
      approvalStatus: true,
      progressSource: true,
      keyResults: { select: { weightPercent: true } },
    },
  });

  if (!objective) actionAlert("/company-okrs", "Objective not found.");

  if (objective.ownerId !== user.id && user.role !== "CEO" && user.role !== "ADMIN") {
    actionAlert(alertPath, "Only the objective owner can add KRs to this objective.");
  }

  if (objective.progressSource === "CHILD_OBJECTIVES") {
    actionAlert(alertPath, "This objective calculates progress from child objectives. Switch progress source before adding direct KRs.");
  }

  if (objective.progressSource === "DIRECT_KRS") {
    const weightValidation = validateObjectiveKrWeights({
      weights: [...objective.keyResults.map((kr) => ({ percent: kr.weightPercent })), { percent: weightPercent }],
      status: objective.status,
      approvalStatus: objective.approvalStatus,
    });
    if (!weightValidation.isValid) {
      actionAlert(alertPath, weightValidation.message ?? "KR weights must be valid before saving.");
    }
  }

  const keyResult = await prisma.$transaction(async (tx) => {
    const created = await tx.keyResult.create({
      data: {
        objectiveId,
        ownerId,
        title: requiredStringOrAlert(formData.get("title"), "Title", alertPath),
        metricName: optionalString(formData.get("metricName")),
        startValue,
        currentValue,
        targetValue,
        progressPercent,
        weightPercent,
        confidenceScore,
        status,
        pacingStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATED",
        entityType: "KeyResult",
        entityId: created.id,
        metadata: { title: created.title, objectiveId, weightPercent },
      },
    });

    await recalculateObjectiveAndParents(tx, objectiveId);
    return created;
  });

  if (status === "ON_HOLD") {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, email: true, name: true },
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
      await sendKrBlockedEmail({ owner, keyResultTitle: keyResult.title, relatedPath: `/key-results/${keyResult.id}` });
    }
  }

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  redirect(`/objectives/${objectiveId}`);
}

export async function updateKeyResultAction(formData: FormData) {
  const user = await requireUser();
  const keyResultId = requiredStringOrAlert(formData.get("keyResultId"), "Key Result", "/company-okrs");
  const objectiveId = requiredStringOrAlert(formData.get("objectiveId"), "Objective", `/key-results/${keyResultId}`);
  const alertPath = `/key-results/${keyResultId}`;
  const startValue = numberValue(formData.get("startValue"), 0);
  const currentValue = numberValue(formData.get("currentValue"), startValue);
  const targetValue = numberValue(formData.get("targetValue"), 100);
  const progressPercent = calculateProgressPercent(startValue, currentValue, targetValue);
  const status = requiredStringOrAlert(formData.get("status"), "Status", alertPath) as WorkStatus;
  const ownerId = requiredStringOrAlert(formData.get("ownerId"), "Owner", alertPath);
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 100), 0, 100);

  if (!workStatuses.includes(status)) actionAlert(alertPath, "Invalid KR status.");

  if (!(await isInAssignableScope(user.id, user.role, ownerId))) {
    actionAlert(alertPath, "You cannot assign a KR to that user.");
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
          progressSource: true,
          keyResults: { select: { id: true, weightPercent: true } },
        },
      },
      owner: { select: { id: true, email: true, name: true } },
    },
  });

  if (!existingKeyResult) actionAlert("/company-okrs", "Key Result not found.");

  if (existingKeyResult.objective.progressSource === "DIRECT_KRS") {
    const weightValidation = validateObjectiveKrWeights({
      weights: existingKeyResult.objective.keyResults.map((kr) => ({
        percent: kr.id === keyResultId ? weightPercent : kr.weightPercent,
      })),
      status: existingKeyResult.objective.status,
      approvalStatus: existingKeyResult.objective.approvalStatus,
    });
    if (!weightValidation.isValid) {
      actionAlert(alertPath, weightValidation.message ?? "KR weights must be valid before saving.");
    }
  }

  const updatedKeyResult = await prisma.$transaction(async (tx) => {
    const result = await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        title: requiredStringOrAlert(formData.get("title"), "Title", alertPath),
        metricName: optionalString(formData.get("metricName")),
        ownerId,
        startValue,
        currentValue,
        targetValue,
        progressPercent,
        weightPercent,
        confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
        status,
        pacingStatus: calculatePacingStatus({ progressPercent, currentMonthTargetPercent: null }),
      },
      include: { owner: { select: { id: true, email: true, name: true } } },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATED",
        entityType: "KeyResult",
        entityId: keyResultId,
        metadata: { progressPercent, status, weightPercent },
      },
    });

    await recalculateObjectiveAndParents(tx, objectiveId);
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
