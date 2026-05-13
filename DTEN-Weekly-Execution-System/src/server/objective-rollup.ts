import type { Prisma } from "@prisma/client";
import { calculateWeightedProgress } from "@/lib/okr-calculations";

type PrismaExecutor = Prisma.TransactionClient;

export async function recalculateObjectiveProgressFromKrs(prisma: PrismaExecutor, objectiveId: string) {
  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      id: true,
      progressMode: true,
      keyResults: {
        select: {
          progressPercent: true,
          weightPercent: true,
        },
      },
    },
  });

  if (!objective || objective.progressMode !== "AUTO") {
    return objective?.id ? null : null;
  }

  const progressPercent = calculateWeightedProgress(objective.keyResults);

  await prisma.objective.update({
    where: { id: objectiveId },
    data: { progressPercent },
  });

  return progressPercent;
}

export async function recalculateObjectiveProgress(prisma: PrismaExecutor, objectiveId: string) {
  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      id: true,
      progressMode: true,
      keyResults: {
        select: {
          progressPercent: true,
          weightPercent: true,
        },
      },
      parentAssignments: {
        select: {
          contributionPercent: true,
          assignedObjective: {
            select: {
              progressPercent: true,
            },
          },
        },
      },
    },
  });

  if (!objective || objective.progressMode !== "AUTO") {
    return null;
  }

  const progressPercent =
    objective.parentAssignments.length > 0
      ? calculateWeightedProgress(
          objective.parentAssignments
            .filter((assignment) => assignment.assignedObjective)
            .map((assignment) => ({
              progressPercent: assignment.assignedObjective?.progressPercent ?? 0,
              weightPercent: assignment.contributionPercent,
            }))
        )
      : calculateWeightedProgress(objective.keyResults);

  await prisma.objective.update({
    where: { id: objectiveId },
    data: { progressPercent },
  });

  return progressPercent;
}

export async function recalculateParentObjectiveProgress(prisma: PrismaExecutor, childObjectiveId: string) {
  const parentLinks = await prisma.objectiveAssignment.findMany({
    where: {
      assignedObjectiveId: childObjectiveId,
    },
    select: {
      parentObjectiveId: true,
    },
  });

  for (const link of parentLinks) {
    await recalculateObjectiveProgress(prisma, link.parentObjectiveId);
    await recalculateParentObjectiveProgress(prisma, link.parentObjectiveId);
  }
}

export async function recalculateObjectiveAndParents(prisma: PrismaExecutor, objectiveId: string) {
  await recalculateObjectiveProgress(prisma, objectiveId);
  await recalculateParentObjectiveProgress(prisma, objectiveId);
}
