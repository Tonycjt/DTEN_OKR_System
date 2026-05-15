"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ObjectiveLevel, ObjectiveProgressSource, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent } from "@/lib/okr-calculations";
import { isInDirectScope } from "@/lib/org-scope";
import { validateObjectiveKrWeights } from "@/lib/rollup-validation";
import { requireUser } from "@/server/auth";
import { sendKrBlockedEmail } from "@/server/email-notifications";
import { recalculateObjectiveAndParents, recalculateObjectiveProgress } from "@/server/objective-rollup";
import { prisma } from "@/server/prisma";

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
  const progressSource = (optionalString(formData.get("progressSource")) ?? "DIRECT_KRS") as ObjectiveProgressSource;

  // Infer level and org context from the creator's profile — never trust submitted values.
  const creator = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { role: true, departmentId: true, teamId: true },
  });

  let level: ObjectiveLevel;
  let departmentId: string | null = null;
  let teamId: string | null = null;

  if (creator.role === "CEO") {
    level = "COMPANY";
  } else if (creator.role === "DEPARTMENT_HEAD") {
    level = "DEPARTMENT";
    departmentId = creator.departmentId;
  } else if (creator.role === "MANAGER") {
    level = "TEAM";
    departmentId = creator.departmentId;
    teamId = creator.teamId;
  } else {
    level = "INDIVIDUAL";
    departmentId = creator.departmentId;
    teamId = creator.teamId;
  }

  const errors: ObjectiveFormErrors = {};
  if (!title) errors.title = "Title is required.";
  if (!quarter) errors.quarter = "Quarter is required.";
  if (!ownerId) errors.ownerId = "Owner is required.";
  if (!objectiveProgressSources.includes(progressSource)) errors.general = "Invalid progress source.";
  if (level === "DEPARTMENT" && !departmentId) {
    errors.general = "Your profile has no department assigned. Ask an admin to update your profile before creating objectives.";
  }
  if (level === "TEAM" && !teamId) {
    errors.general = "Your profile has no team assigned. Ask an admin to update your profile before creating objectives.";
  }

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
    // Validate each KR owner is within actor's scope (skip unassigned KRs)
    for (const kr of krRows) {
      if (kr.ownerId && !(await isInDirectScope(user.id,kr.ownerId))) {
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
      departmentId,
      teamId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "CREATED",
      entityType: "Objective",
      entityId: objective.id,
      metadata: { title: objective.title, level, departmentId, teamId, status },
    },
  });

  // Create any inline KR rows
  for (const kr of krRows) {
    if (!kr.title) continue;
    const progressPercent = calculateProgressPercent(kr.startValue, kr.startValue, kr.targetValue);
    await prisma.keyResult.create({
      data: {
        objectiveId: objective.id,
        ownerId: kr.ownerId ?? null,
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

  const intentStr = optionalString(formData.get("intent")) ?? "save";
  const isPublish = intentStr === "publish";
  const isUpdate = intentStr === "update";
  const level = (optionalString(formData.get("level")) ?? "COMPANY") as ObjectiveLevel;
  let status = (optionalString(formData.get("status")) ?? "DRAFT") as WorkStatus;
  if (isPublish) status = "ON_TRACK";
  const progressSource = (optionalString(formData.get("progressSource")) ?? "DIRECT_KRS") as ObjectiveProgressSource;

  const errors: ObjectiveFormErrors = {};
  const title = optionalString(formData.get("title"));
  const quarter = optionalString(formData.get("quarter"));
  const ownerId = optionalString(formData.get("ownerId"));

  if (!title) errors.title = "Title is required.";
  if (!quarter) errors.quarter = "Quarter is required.";
  if (!ownerId) errors.ownerId = "Owner is required.";
  if (!(["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"] as const).includes(level)) errors.general = "Invalid level.";
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

  // Validate KR weights when publishing a draft or updating a published objective with DIRECT_KRS
  if ((isUpdate || isPublish) && progressSource === "DIRECT_KRS" && existingObjective!.keyResults.length > 0) {
    const weightValidation = validateObjectiveKrWeights({
      weights: existingObjective!.keyResults.map((kr) => ({ percent: kr.weightPercent })),
      status,
      approvalStatus: existingObjective!.approvalStatus,
    });
    if (!weightValidation.isValid) {
      return {
        errors: {
          krs: weightValidation.message ?? (isPublish
            ? "KR weights must total 100% before publishing."
            : "KR weights must total 100% before updating."),
        },
      };
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

// ─── R3.4.13: KR delete / update from objective detail page ──────────────────

export type ImpactedUser = { id: string; name: string; email: string; title: string | null };

export type KrDeleteState = { error: string } | null;

export type KrUpdateFromObjectiveErrors = {
  title?: string;
  ownerId?: string;
  weightPercent?: string;
  general?: string;
};

export type KrUpdateFromObjectiveState =
  | { step: "confirm"; impactedUsers: ImpactedUser[]; changes: string[] }
  | { step: "errors"; errors: KrUpdateFromObjectiveErrors }
  | null;

export async function deleteKrAction(
  _prevState: KrDeleteState,
  formData: FormData,
): Promise<KrDeleteState> {
  const user = await requireUser();
  const keyResultId = optionalString(formData.get("keyResultId"));
  const objectiveId = optionalString(formData.get("objectiveId"));

  if (!keyResultId || !objectiveId) return { error: "Missing parameters." };

  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: {
      title: true,
      ownerId: true,
      checkIns: { distinct: ["userId"], select: { userId: true } },
      objective: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          status: true,
          progressSource: true,
          keyResults: { select: { id: true } },
        },
      },
    },
  });

  if (!kr) return { error: "Key result not found." };

  if (kr.objective.ownerId !== user.id && user.role !== "CEO" && user.role !== "ADMIN") {
    return { error: "Only the objective owner can delete KRs." };
  }

  if (
    kr.objective.status !== "DRAFT" &&
    kr.objective.progressSource === "DIRECT_KRS" &&
    kr.objective.keyResults.length <= 1
  ) {
    return { error: "Cannot delete the last KR on a published Direct KR objective." };
  }

  const impactedIds = new Set<string>();
  if (kr.ownerId) impactedIds.add(kr.ownerId);
  for (const ci of kr.checkIns) impactedIds.add(ci.userId);

  const openFollowUps = await prisma.followUp.findMany({
    where: {
      sourceObjectType: "KEY_RESULT",
      sourceObjectId: keyResultId,
      status: { notIn: ["DONE", "CANCELLED"] },
    },
    select: { ownerId: true },
  });
  for (const fu of openFollowUps) impactedIds.add(fu.ownerId);

  await prisma.$transaction(async (tx) => {
    await tx.keyResult.delete({ where: { id: keyResultId } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "DELETED",
        entityType: "KeyResult",
        entityId: keyResultId,
        metadata: { krTitle: kr.title, objectiveId, objectiveTitle: kr.objective.title },
      },
    });
    await recalculateObjectiveAndParents(tx, objectiveId);
  });

  for (const userId of impactedIds) {
    if (userId === user.id) continue;
    await prisma.notification.create({
      data: {
        userId,
        type: "KR_BLOCKED",
        title: "KR deleted",
        body: `"${kr.title}" was removed from "${kr.objective.title}" by ${user.name ?? "an objective owner"}.`,
        relatedUrl: `/my-okrs`,
      },
    });
  }

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/my-okrs");
  revalidatePath("/company-okrs");
  revalidatePath("/notifications");
  redirect(`/objectives/${objectiveId}`);
}

export async function updateKrFromObjectiveAction(
  _prevState: KrUpdateFromObjectiveState,
  formData: FormData,
): Promise<KrUpdateFromObjectiveState> {
  const user = await requireUser();
  const keyResultId = optionalString(formData.get("keyResultId"));
  const objectiveId = optionalString(formData.get("objectiveId"));
  const confirmed = formData.get("confirmed") === "true";

  if (!keyResultId || !objectiveId) {
    return { step: "errors", errors: { general: "Missing parameters." } };
  }

  const title = optionalString(formData.get("title"));
  const ownerId = optionalString(formData.get("ownerId"));
  const startValue = numberValue(formData.get("startValue"), 0);
  const currentValue = numberValue(formData.get("currentValue"), 0);
  const targetValue = numberValue(formData.get("targetValue"), 100);
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 0), 0, 100);
  const confidenceScore = clamp(intValue(formData.get("confidenceScore"), 3), 1, 5);
  const status = (optionalString(formData.get("status")) ?? "ON_TRACK") as WorkStatus;

  const errors: KrUpdateFromObjectiveErrors = {};
  if (!title) errors.title = "Title is required.";
  if (Object.keys(errors).length > 0) return { step: "errors", errors };

  const existingKr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      owner: { select: { id: true, name: true, email: true, title: true } },
      objective: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          status: true,
          progressSource: true,
          approvalStatus: true,
          keyResults: { select: { id: true, weightPercent: true } },
        },
      },
    },
  });

  if (!existingKr) return { step: "errors", errors: { general: "KR not found." } };

  if (
    existingKr.objective.ownerId !== user.id &&
    user.role !== "CEO" &&
    user.role !== "ADMIN"
  ) {
    return { step: "errors", errors: { general: "Only the objective owner can edit KRs." } };
  }

  if (ownerId && !(await isInDirectScope(user.id,ownerId))) {
    return { step: "errors", errors: { ownerId: "That user is outside your org scope." } };
  }

  const isPublished = existingKr.objective.status !== "DRAFT";
  const ownerChanged = ownerId !== existingKr.ownerId;
  const weightChanged = Math.abs(weightPercent - existingKr.weightPercent) > 0.01;
  const needsConfirmation = ownerChanged || (isPublished && weightChanged);

  // Validate KR weights for published DIRECT_KRS
  if (isPublished && existingKr.objective.progressSource === "DIRECT_KRS") {
    const newWeights = existingKr.objective.keyResults.map((kr) => ({
      percent: kr.id === keyResultId ? weightPercent : kr.weightPercent,
    }));
    const wv = validateObjectiveKrWeights({
      weights: newWeights,
      status: existingKr.objective.status,
      approvalStatus: existingKr.objective.approvalStatus,
    });
    if (!wv.isValid) {
      return { step: "errors", errors: { weightPercent: wv.message ?? "KR weights must total 100%." } };
    }
  }

  if (needsConfirmation && !confirmed) {
    const impactedIds = new Set<string>();
    if (existingKr.ownerId) impactedIds.add(existingKr.ownerId);
    if (ownerId) impactedIds.add(ownerId);
    const impactedUsers = await prisma.user.findMany({
      where: { id: { in: [...impactedIds] } },
      select: { id: true, name: true, email: true, title: true },
    });
    const changes: string[] = [];
    if (ownerChanged) {
      const newOwner = impactedUsers.find((u) => u.id === ownerId);
      changes.push(`Owner: ${existingKr.owner?.name ?? "No owner"} → ${newOwner?.name ?? ownerId ?? "No owner"}`);
    }
    if (isPublished && weightChanged) {
      changes.push(`Weight: ${existingKr.weightPercent}% → ${weightPercent}%`);
    }
    return { step: "confirm", impactedUsers, changes };
  }

  const progressPercent = calculateProgressPercent(startValue, currentValue, targetValue);

  await prisma.$transaction(async (tx) => {
    await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        title: title!,
        metricName: optionalString(formData.get("metricName")),
        ownerId: ownerId ?? null,
        startValue,
        currentValue,
        targetValue,
        progressPercent,
        weightPercent,
        confidenceScore,
        status,
        pacingStatus: calculatePacingStatus({ progressPercent, currentMonthTargetPercent: null }),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATED",
        entityType: "KeyResult",
        entityId: keyResultId,
        metadata: { objectiveId, ownerChanged, weightChanged, confirmed, progressPercent, weightPercent },
      },
    });
    await recalculateObjectiveAndParents(tx, objectiveId);
  });

  if (ownerChanged) {
    if (existingKr.ownerId && existingKr.ownerId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: existingKr.ownerId,
          type: "KR_BLOCKED",
          title: "KR reassigned",
          body: `"${existingKr.title}" in "${existingKr.objective.title}" was reassigned. You are no longer the KR owner.`,
          relatedUrl: `/my-okrs`,
        },
      });
    }
    if (ownerId && ownerId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: ownerId,
          type: "KR_BLOCKED",
          title: "KR assigned to you",
          body: `"${existingKr.title}" in "${existingKr.objective.title}" has been assigned to you.`,
          relatedUrl: `/my-okrs`,
        },
      });
    }
  }

  if (isPublished && weightChanged && ownerId && ownerId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: ownerId,
        type: "KR_BLOCKED",
        title: "KR weight updated",
        body: `The weight for "${existingKr.title}" was updated to ${weightPercent}%.`,
        relatedUrl: `/my-okrs`,
      },
    });
  }

  revalidatePath(`/objectives/${objectiveId}`);
  revalidatePath("/my-okrs");
  revalidatePath("/company-okrs");
  revalidatePath("/notifications");
  redirect(`/objectives/${objectiveId}`);
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
  const ownerId = optionalString(formData.get("ownerId")) ?? null;
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 0), 0, 100);

  if (!workStatuses.includes(status)) actionAlert(alertPath, "Invalid KR status.");

  if (ownerId && !(await isInDirectScope(user.id,ownerId))) {
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

  if (status === "ON_HOLD" && ownerId) {
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
  const ownerId = optionalString(formData.get("ownerId")) ?? null;
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 100), 0, 100);

  if (!workStatuses.includes(status)) actionAlert(alertPath, "Invalid KR status.");

  if (ownerId && !(await isInDirectScope(user.id,ownerId))) {
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

  if (existingKeyResult.status !== "ON_HOLD" && status === "ON_HOLD" && updatedKeyResult.ownerId && updatedKeyResult.owner) {
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
