"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ObjectiveAssignmentAssigneeType, ObjectiveAssignmentMode, ObjectiveAssignmentStatus, ObjectiveLevel, ObjectiveProgressSource, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent, getCurrentQuarterMonthIndex } from "@/lib/okr-calculations";
import { getRollupValidationTarget, validateObjectiveAssignmentContributions, validateObjectiveKrWeights } from "@/lib/rollup-validation";
import { requireUser } from "@/server/auth";
import { sendKrBlockedEmail } from "@/server/email-notifications";
import { recalculateObjectiveAndParents, recalculateObjectiveProgress, recalculateParentObjectiveProgress } from "@/server/objective-rollup";
import { prisma } from "@/server/prisma";

const objectiveLevels: ObjectiveLevel[] = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"];
const objectiveProgressSources: ObjectiveProgressSource[] = ["MANUAL", "DIRECT_KRS", "CHILD_OBJECTIVES"];
const objectiveAssignmentAssigneeTypes: ObjectiveAssignmentAssigneeType[] = ["USER", "TEAM", "DEPARTMENT"];
const objectiveAssignmentModes: ObjectiveAssignmentMode[] = ["CONTRIBUTION_ONLY", "PREDEFINED_CHILD_OBJECTIVE"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];
const reviewableAssignmentStatuses: ObjectiveAssignmentStatus[] = ["APPROVED", "REJECTED", "NEEDS_REVISION"];

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
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

function actionAlert(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function requiredStringOrAlert(value: FormDataEntryValue | null, fieldName: string, path: string) {
  const text = optionalString(value);

  if (!text) {
    actionAlert(path, `${fieldName} is required.`);
  }

  return text;
}

function parseProgressSource(formData: FormData, alertPath: string) {
  const progressSource = (optionalString(formData.get("progressSource")) ?? "MANUAL") as ObjectiveProgressSource;

  if (!objectiveProgressSources.includes(progressSource)) {
    actionAlert(alertPath, "Invalid objective progress source.");
  }

  return progressSource;
}

function parseAssigneeRef(value: FormDataEntryValue | null): { assigneeType: ObjectiveAssignmentAssigneeType; assigneeId: string } | null {
  const text = optionalString(value);

  if (!text) {
    return null;
  }

  const [type, id] = text.split("::");

  if (!type || !id || !objectiveAssignmentAssigneeTypes.includes(type as ObjectiveAssignmentAssigneeType)) {
    return null;
  }

  return {
    assigneeType: type as ObjectiveAssignmentAssigneeType,
    assigneeId: id,
  };
}

export async function createObjectiveAction(formData: FormData) {
  const user = await requireUser();
  const alertPath = "/objectives/new";
  const level = requiredStringOrAlert(formData.get("level"), "Level", alertPath) as ObjectiveLevel;
  const status = requiredStringOrAlert(formData.get("status"), "Status", alertPath) as WorkStatus;
  const progressSource = parseProgressSource(formData, alertPath);

  if (!objectiveLevels.includes(level)) {
    actionAlert(alertPath, "Invalid objective level.");
  }

  if (!workStatuses.includes(status)) {
    actionAlert(alertPath, "Invalid objective status.");
  }

  const objective = await prisma.objective.create({
    data: {
      title: requiredStringOrAlert(formData.get("title"), "Title", alertPath),
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: requiredStringOrAlert(formData.get("quarter"), "Quarter", alertPath),
      progressSource,
      progressPercent: progressSource === "MANUAL" ? clamp(numberValue(formData.get("progressPercent"), 0), 0, 100) : 0,
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      ownerId: requiredStringOrAlert(formData.get("ownerId"), "Owner", alertPath),
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
  const objectiveId = requiredStringOrAlert(formData.get("objectiveId"), "Objective", "/company-okrs");
  const alertPath = `/objectives/${objectiveId}`;
  const level = requiredStringOrAlert(formData.get("level"), "Level", alertPath) as ObjectiveLevel;
  const status = requiredStringOrAlert(formData.get("status"), "Status", alertPath) as WorkStatus;
  const progressSource = parseProgressSource(formData, alertPath);
  const parentObjectiveId = optionalString(formData.get("parentObjectiveId"));

  if (!objectiveLevels.includes(level)) {
    actionAlert(alertPath, "Invalid objective level.");
  }

  if (!workStatuses.includes(status)) {
    actionAlert(alertPath, "Invalid objective status.");
  }

  if (parentObjectiveId === objectiveId) {
    actionAlert(alertPath, "An objective cannot be aligned to itself.");
  }

  const existingObjective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      approvalStatus: true,
      parentAssignments: {
        select: {
          contributionPercent: true,
        },
      },
      keyResults: {
        select: {
          weightPercent: true,
        },
      },
    },
  });

  if (!existingObjective) {
    actionAlert("/company-okrs", "Objective not found.");
  }

  const validationTarget = getRollupValidationTarget(progressSource);

  if (validationTarget === "KR_WEIGHTS" && existingObjective.keyResults.length > 0) {
    const weightValidation = validateObjectiveKrWeights({
      weights: existingObjective.keyResults.map((keyResult) => ({ percent: keyResult.weightPercent })),
      status,
      approvalStatus: existingObjective.approvalStatus,
    });

    if (!weightValidation.isValid) {
      actionAlert(alertPath, weightValidation.message ?? "KR weights must be valid before saving.");
    }
  }

  if (validationTarget === "OBJECTIVE_ASSIGNMENTS" && existingObjective.parentAssignments.length > 0) {
    const contributionValidation = validateObjectiveAssignmentContributions({
      contributions: existingObjective.parentAssignments.map((assignment) => ({ percent: assignment.contributionPercent })),
      status,
      approvalStatus: existingObjective.approvalStatus,
    });

    if (!contributionValidation.isValid) {
      actionAlert(alertPath, contributionValidation.message ?? "Objective assignment contributions must be valid before saving.");
    }
  }

  const objective = await prisma.objective.update({
    where: { id: objectiveId },
    data: {
      title: requiredStringOrAlert(formData.get("title"), "Title", alertPath),
      description: optionalString(formData.get("description")),
      level,
      status,
      quarter: requiredStringOrAlert(formData.get("quarter"), "Quarter", alertPath),
      progressSource,
      progressPercent: progressSource === "MANUAL" ? clamp(numberValue(formData.get("progressPercent"), 0), 0, 100) : undefined,
      confidenceScore: clamp(intValue(formData.get("confidenceScore"), 3), 1, 5),
      ownerId: requiredStringOrAlert(formData.get("ownerId"), "Owner", alertPath),
      departmentId: optionalString(formData.get("departmentId")),
      teamId: optionalString(formData.get("teamId")),
      parentObjectiveId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await recalculateObjectiveProgress(tx, objectiveId);
    await recalculateParentObjectiveProgress(tx, objectiveId);
  });

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

  if (!workStatuses.includes(status)) {
    actionAlert(alertPath, "Invalid KR status.");
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
      progressSource: true,
      keyResults: {
        select: {
          weightPercent: true,
        },
      },
    },
  });

  if (!objective) {
    actionAlert("/company-okrs", "Objective not found.");
  }

  if (objective.progressSource === "CHILD_OBJECTIVES") {
    actionAlert(alertPath, "This objective calculates progress from child objectives. Switch progress source before adding direct KRs.");
  }

  if (objective.progressSource === "DIRECT_KRS") {
    const weightValidation = validateObjectiveKrWeights({
      weights: [...objective.keyResults.map((keyResult) => ({ percent: keyResult.weightPercent })), { percent: weightPercent }],
      status: objective.status,
      approvalStatus: objective.approvalStatus,
    });

    if (!weightValidation.isValid) {
      actionAlert(alertPath, weightValidation.message ?? "KR weights must be valid before saving.");
    }
  }

  const keyResult = await prisma.$transaction(async (tx) => {
    const createdKeyResult = await tx.keyResult.create({
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

    await recalculateObjectiveAndParents(tx, objectiveId);

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
  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentMonthTargetPercent = numberValue(formData.get(`targetPercent${currentMonthIndex}`), Number.NaN);
  const status = requiredStringOrAlert(formData.get("status"), "Status", alertPath) as WorkStatus;
  const ownerId = requiredStringOrAlert(formData.get("ownerId"), "Owner", alertPath);
  const weightPercent = clamp(numberValue(formData.get("weightPercent"), 100), 0, 100);

  if (!workStatuses.includes(status)) {
    actionAlert(alertPath, "Invalid KR status.");
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
    actionAlert("/company-okrs", "Key Result not found.");
  }

  if (existingKeyResult.objective.progressSource === "DIRECT_KRS") {
    const weightValidation = validateObjectiveKrWeights({
      weights: existingKeyResult.objective.keyResults.map((keyResult) => ({
        percent: keyResult.id === keyResultId ? weightPercent : keyResult.weightPercent,
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

export async function createObjectiveAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const parentObjectiveId = requiredStringOrAlert(formData.get("parentObjectiveId"), "Parent objective", "/company-okrs");
  const alertPath = `/objectives/${parentObjectiveId}`;
  const assignee = parseAssigneeRef(formData.get("assigneeRef"));
  const assignedObjectiveId = optionalString(formData.get("assignedObjectiveId"));
  const contributionPercent = clamp(numberValue(formData.get("contributionPercent"), 0), 0, 100);
  const rawMode = optionalString(formData.get("assignmentMode")) ?? "CONTRIBUTION_ONLY";
  const assignmentMode: ObjectiveAssignmentMode = objectiveAssignmentModes.includes(rawMode as ObjectiveAssignmentMode)
    ? (rawMode as ObjectiveAssignmentMode)
    : "CONTRIBUTION_ONLY";
  const assignmentInstruction = optionalString(formData.get("assignmentInstruction"));
  // PREDEFINED_CHILD_OBJECTIVE bypasses the proposal workflow — parent already defined it.
  const initialStatus: ObjectiveAssignmentStatus = assignmentMode === "PREDEFINED_CHILD_OBJECTIVE" ? "ACTIVE" : "PENDING_PROPOSAL";

  if (!assignee) {
    actionAlert(alertPath, "Choose a valid assignment owner.");
  }

  if (assignedObjectiveId === parentObjectiveId) {
    actionAlert(alertPath, "A parent objective cannot be assigned to itself.");
  }

  const parentObjective = await prisma.objective.findUnique({
    where: { id: parentObjectiveId },
    select: {
      status: true,
      approvalStatus: true,
      progressSource: true,
      parentAssignments: {
        select: {
          assignedObjectiveId: true,
          assigneeId: true,
          assigneeType: true,
          contributionPercent: true,
        },
      },
    },
  });

  if (!parentObjective) {
    actionAlert("/company-okrs", "Parent objective not found.");
  }

  if (parentObjective.progressSource === "DIRECT_KRS") {
    actionAlert(alertPath, "This objective calculates progress from direct KRs. Switch progress source before adding child objective assignments.");
  }

  const duplicateAssignedObjective = assignedObjectiveId
    ? parentObjective.parentAssignments.some((assignment) => assignment.assignedObjectiveId === assignedObjectiveId)
    : false;

  if (duplicateAssignedObjective) {
    actionAlert(alertPath, "That child objective is already assigned to this parent objective.");
  }

  const duplicateAssignee = parentObjective.parentAssignments.some(
    (assignment) => assignment.assigneeType === assignee.assigneeType && assignment.assigneeId === assignee.assigneeId
  );

  if (duplicateAssignee) {
    actionAlert(alertPath, "That assignee already has a contribution assignment under this objective.");
  }

  if (parentObjective.progressSource === "CHILD_OBJECTIVES") {
    const contributionValidation = validateObjectiveAssignmentContributions({
      contributions: [...parentObjective.parentAssignments.map((assignment) => ({ percent: assignment.contributionPercent })), { percent: contributionPercent }],
      status: parentObjective.status,
      approvalStatus: parentObjective.approvalStatus,
    });

    if (!contributionValidation.isValid) {
      actionAlert(alertPath, contributionValidation.message ?? "Objective assignment contributions must be valid before saving.");
    }
  }

  const assignment = await prisma.objectiveAssignment.create({
    data: {
      parentObjectiveId,
      assignedObjectiveId,
      assigneeId: assignee.assigneeId,
      assigneeType: assignee.assigneeType,
      contributionPercent,
      assignmentMode,
      assignmentInstruction,
      status: initialStatus,
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "CREATED",
      entityType: "ObjectiveAssignment",
      entityId: assignment.id,
      metadata: {
        parentObjectiveId,
        assignedObjectiveId,
        assigneeId: assignee.assigneeId,
        assigneeType: assignee.assigneeType,
        contributionPercent,
        assignmentMode,
        status: initialStatus,
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await recalculateObjectiveProgress(tx, parentObjectiveId);
    await recalculateParentObjectiveProgress(tx, parentObjectiveId);
  });

  revalidatePath(alertPath);
  revalidatePath("/company-okrs");
  revalidatePath("/dashboard");
}

export async function batchUpdateObjectiveAssignmentsAction(formData: FormData) {
  const user = await requireUser();
  const parentObjectiveId = requiredStringOrAlert(formData.get("parentObjectiveId"), "Parent objective", "/company-okrs");
  const alertPath = `/objectives/${parentObjectiveId}`;
  const assignmentIds = formData.getAll("assignmentId").map((value) => String(value));
  const assignedObjectiveIds = formData.getAll("assignedObjectiveId").map((value) => optionalString(value));
  const contributionPercents = formData.getAll("contributionPercent").map((value) => clamp(numberValue(value, 0), 0, 100));

  if (assignmentIds.length === 0) {
    actionAlert(alertPath, "There are no assignments to save.");
  }

  if (assignmentIds.length !== assignedObjectiveIds.length || assignmentIds.length !== contributionPercents.length) {
    actionAlert(alertPath, "Assignment update fields are incomplete.");
  }

  if (assignedObjectiveIds.some((assignedObjectiveId) => assignedObjectiveId === parentObjectiveId)) {
    actionAlert(alertPath, "A parent objective cannot be assigned to itself.");
  }

  const parentObjective = await prisma.objective.findUnique({
    where: { id: parentObjectiveId },
    select: {
      status: true,
      approvalStatus: true,
      progressSource: true,
      parentAssignments: {
        select: {
          id: true,
          assignedObjectiveId: true,
          contributionPercent: true,
        },
      },
    },
  });

  if (!parentObjective) {
    actionAlert("/company-okrs", "Parent objective not found.");
  }

  if (parentObjective.progressSource === "DIRECT_KRS") {
    actionAlert(alertPath, "This objective calculates progress from direct KRs. Switch progress source before editing child objective assignments.");
  }

  const existingIds = new Set(parentObjective.parentAssignments.map((assignment) => assignment.id));

  if (assignmentIds.some((assignmentId) => !existingIds.has(assignmentId))) {
    actionAlert(alertPath, "One or more assignments no longer exist.");
  }

  const linkedChildObjectiveIds = assignedObjectiveIds.filter((assignedObjectiveId): assignedObjectiveId is string => Boolean(assignedObjectiveId));
  const duplicateChildObjective = linkedChildObjectiveIds.some((assignedObjectiveId, index) => linkedChildObjectiveIds.indexOf(assignedObjectiveId) !== index);

  if (duplicateChildObjective) {
    actionAlert(alertPath, "Each child objective can only be assigned once under the same parent objective.");
  }

  if (parentObjective.progressSource === "CHILD_OBJECTIVES") {
    const contributionValidation = validateObjectiveAssignmentContributions({
      contributions: contributionPercents.map((percent) => ({ percent })),
      status: parentObjective.status,
      approvalStatus: parentObjective.approvalStatus,
    });

    if (!contributionValidation.isValid) {
      actionAlert(alertPath, contributionValidation.message ?? "Objective assignment contributions must be valid before saving.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      assignmentIds.map((assignmentId, index) =>
        tx.objectiveAssignment.update({
          where: { id: assignmentId },
          data: {
            assignedObjectiveId: assignedObjectiveIds[index],
            contributionPercent: contributionPercents[index],
          },
        })
      )
    );

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATED",
        entityType: "ObjectiveAssignmentBatch",
        entityId: parentObjectiveId,
        metadata: {
          parentObjectiveId,
          assignments: assignmentIds.map((assignmentId, index) => ({
            assignmentId,
            assignedObjectiveId: assignedObjectiveIds[index],
            contributionPercent: contributionPercents[index],
          })),
        },
      },
    });

    await recalculateObjectiveProgress(tx, parentObjectiveId);
    await recalculateParentObjectiveProgress(tx, parentObjectiveId);
  });

  revalidatePath(alertPath);
  revalidatePath("/company-okrs");
  revalidatePath("/my-okrs");
  revalidatePath("/dashboard");
}

export async function updateObjectiveAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const parentObjectiveId = requiredStringOrAlert(formData.get("parentObjectiveId"), "Parent objective", "/company-okrs");
  const alertPath = `/objectives/${parentObjectiveId}`;
  const assignmentId = requiredStringOrAlert(formData.get("assignmentId"), "Objective assignment", alertPath);
  const assignedObjectiveId = optionalString(formData.get("assignedObjectiveId"));
  const contributionPercent = clamp(numberValue(formData.get("contributionPercent"), 0), 0, 100);

  if (assignedObjectiveId === parentObjectiveId) {
    actionAlert(alertPath, "A parent objective cannot be assigned to itself.");
  }

  const parentObjective = await prisma.objective.findUnique({
    where: { id: parentObjectiveId },
    select: {
      status: true,
      approvalStatus: true,
      progressSource: true,
      parentAssignments: {
        select: {
          id: true,
          assignedObjectiveId: true,
          contributionPercent: true,
        },
      },
    },
  });

  if (!parentObjective) {
    actionAlert("/company-okrs", "Parent objective not found.");
  }

  if (parentObjective.progressSource === "DIRECT_KRS") {
    actionAlert(alertPath, "This objective calculates progress from direct KRs. Switch progress source before editing child objective assignments.");
  }

  const duplicateAssignedObjective = assignedObjectiveId
    ? parentObjective.parentAssignments.some((assignment) => assignment.id !== assignmentId && assignment.assignedObjectiveId === assignedObjectiveId)
    : false;

  if (duplicateAssignedObjective) {
    actionAlert(alertPath, "That child objective is already assigned to this parent objective.");
  }

  if (parentObjective.progressSource === "CHILD_OBJECTIVES") {
    const contributionValidation = validateObjectiveAssignmentContributions({
      contributions: parentObjective.parentAssignments.map((assignment) => ({
        percent: assignment.id === assignmentId ? contributionPercent : assignment.contributionPercent,
      })),
      status: parentObjective.status,
      approvalStatus: parentObjective.approvalStatus,
    });

    if (!contributionValidation.isValid) {
      actionAlert(alertPath, contributionValidation.message ?? "Objective assignment contributions must be valid before saving.");
    }
  }

  const assignment = await prisma.objectiveAssignment.update({
    where: { id: assignmentId },
    data: {
      assignedObjectiveId,
      contributionPercent,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "UPDATED",
      entityType: "ObjectiveAssignment",
      entityId: assignment.id,
      metadata: {
        parentObjectiveId,
        assignedObjectiveId,
        contributionPercent,
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await recalculateObjectiveProgress(tx, parentObjectiveId);
    await recalculateParentObjectiveProgress(tx, parentObjectiveId);
  });

  revalidatePath(alertPath);
  revalidatePath("/company-okrs");
  revalidatePath("/dashboard");
}

export async function deleteObjectiveAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const parentObjectiveId = requiredStringOrAlert(formData.get("parentObjectiveId"), "Parent objective", "/company-okrs");
  const alertPath = `/objectives/${parentObjectiveId}`;
  const assignmentId = requiredStringOrAlert(formData.get("assignmentId"), "Objective assignment", alertPath);

  const parentObjective = await prisma.objective.findUnique({
    where: { id: parentObjectiveId },
    select: {
      status: true,
      approvalStatus: true,
      progressSource: true,
      parentAssignments: {
        select: {
          id: true,
          contributionPercent: true,
        },
      },
    },
  });

  if (!parentObjective) {
    actionAlert("/company-okrs", "Parent objective not found.");
  }

  const remainingAssignments = parentObjective.parentAssignments.filter((assignment) => assignment.id !== assignmentId);
  if (parentObjective.progressSource === "CHILD_OBJECTIVES") {
    const contributionValidation = validateObjectiveAssignmentContributions({
      contributions: remainingAssignments.map((assignment) => ({ percent: assignment.contributionPercent })),
      status: parentObjective.status,
      approvalStatus: parentObjective.approvalStatus,
    });

    if (!contributionValidation.isValid) {
      actionAlert(alertPath, contributionValidation.message ?? "Objective assignment contributions must be valid before deleting.");
    }
  }

  await prisma.objectiveAssignment.delete({
    where: { id: assignmentId },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "DELETED",
      entityType: "ObjectiveAssignment",
      entityId: assignmentId,
      metadata: {
        parentObjectiveId,
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await recalculateObjectiveProgress(tx, parentObjectiveId);
    await recalculateParentObjectiveProgress(tx, parentObjectiveId);
  });

  revalidatePath(alertPath);
  revalidatePath("/company-okrs");
  revalidatePath("/dashboard");
}

export async function proposeChildObjectiveAction(formData: FormData) {
  const user = await requireUser();
  const assignmentId = requiredStringOrAlert(formData.get("assignmentId"), "Assignment", "/my-okrs");
  const proposedObjectiveId = requiredStringOrAlert(formData.get("proposedObjectiveId"), "Proposed child objective", "/my-okrs");

  const assignment = await prisma.objectiveAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      parentObjective: { select: { id: true, title: true, ownerId: true } },
    },
  });

  if (!assignment) {
    actionAlert("/my-okrs", "Assignment not found.");
  }

  if (assignment.assigneeType !== "USER" || assignment.assigneeId !== user.id) {
    actionAlert("/my-okrs", "You are not the assignee for this assignment.");
  }

  if (!["PENDING_PROPOSAL", "NEEDS_REVISION"].includes(assignment.status)) {
    actionAlert("/my-okrs", "This assignment is not awaiting a proposal.");
  }

  if (proposedObjectiveId === assignment.parentObjectiveId) {
    actionAlert("/my-okrs", "The proposed child objective cannot be the parent objective itself.");
  }

  await prisma.objectiveAssignment.update({
    where: { id: assignmentId },
    data: { assignedObjectiveId: proposedObjectiveId, status: "PENDING_REVIEW" },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "UPDATED",
      entityType: "ObjectiveAssignment",
      entityId: assignmentId,
      metadata: { proposedObjectiveId, status: "PENDING_REVIEW" },
    },
  });

  await prisma.notification.create({
    data: {
      userId: assignment.parentObjective.ownerId,
      type: "ASSIGNMENT_PROPOSAL_SUBMITTED",
      title: "Child objective proposed",
      body: `${user.name} proposed a child objective for "${assignment.parentObjective.title}". Please review.`,
      relatedUrl: `/objectives/${assignment.parentObjective.id}`,
    },
  });

  revalidatePath("/my-okrs");
  revalidatePath(`/objectives/${assignment.parentObjective.id}`);
  revalidatePath("/notifications");
}

export async function reviewAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const assignmentId = requiredStringOrAlert(formData.get("assignmentId"), "Assignment", "/company-okrs");
  const parentObjectiveId = requiredStringOrAlert(formData.get("parentObjectiveId"), "Parent objective", "/company-okrs");
  const alertPath = `/objectives/${parentObjectiveId}`;
  const rawDecision = requiredStringOrAlert(formData.get("decision"), "Decision", alertPath);
  const revisionNote = optionalString(formData.get("revisionNote"));

  if (!reviewableAssignmentStatuses.includes(rawDecision as ObjectiveAssignmentStatus)) {
    actionAlert(alertPath, "Invalid review decision.");
  }

  const decision = rawDecision as ObjectiveAssignmentStatus;

  const parentObjective = await prisma.objective.findUnique({
    where: { id: parentObjectiveId },
    select: { ownerId: true, title: true },
  });

  if (!parentObjective) {
    actionAlert("/company-okrs", "Parent objective not found.");
  }

  if (parentObjective.ownerId !== user.id) {
    actionAlert(alertPath, "Only the parent objective owner can review assignment proposals.");
  }

  const assignment = await prisma.objectiveAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, assigneeId: true, assigneeType: true, status: true },
  });

  if (!assignment) {
    actionAlert(alertPath, "Assignment not found.");
  }

  if (assignment.status !== "PENDING_REVIEW") {
    actionAlert(alertPath, "This assignment is not awaiting review.");
  }

  await prisma.objectiveAssignment.update({
    where: { id: assignmentId },
    data: {
      status: decision,
      approvedById: decision === "APPROVED" ? user.id : null,
      approvedAt: decision === "APPROVED" ? new Date() : null,
      assignmentInstruction: decision === "NEEDS_REVISION" && revisionNote ? revisionNote : undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "REVIEWED",
      entityType: "ObjectiveAssignment",
      entityId: assignmentId,
      metadata: { decision, revisionNote, parentObjectiveId },
    },
  });

  if (assignment.assigneeType === "USER") {
    const decisionLabel = decision === "APPROVED" ? "approved" : decision === "REJECTED" ? "rejected" : "sent back for revision";
    await prisma.notification.create({
      data: {
        userId: assignment.assigneeId,
        type: "ASSIGNMENT_PROPOSAL_REVIEWED",
        title: `Child objective proposal ${decisionLabel}`,
        body: `Your proposed child objective for "${parentObjective.title}" was ${decisionLabel}.${revisionNote ? ` Note: ${revisionNote}` : ""}`,
        relatedUrl: `/my-okrs`,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    await recalculateObjectiveProgress(tx, parentObjectiveId);
    await recalculateParentObjectiveProgress(tx, parentObjectiveId);
  });

  revalidatePath(alertPath);
  revalidatePath("/my-okrs");
  revalidatePath("/company-okrs");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
}
