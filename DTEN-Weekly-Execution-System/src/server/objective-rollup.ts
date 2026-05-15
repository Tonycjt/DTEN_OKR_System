import type { Prisma } from "@prisma/client";
import { calculateWeightedProgress } from "../lib/okr-calculations";

type PrismaExecutor = Prisma.TransactionClient;

export async function recalculateObjectiveProgress(prisma: PrismaExecutor, objectiveId: string) {
  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      id: true,
      progressSource: true,
      keyResults: {
        select: {
          progressPercent: true,
          weightPercent: true,
        },
      },
    },
  });

  if (!objective || objective.progressSource === "MANUAL") {
    return null;
  }

  const progressPercent = calculateWeightedProgress(objective.keyResults);

  await prisma.objective.update({
    where: { id: objectiveId },
    data: { progressPercent },
  });

  return progressPercent;
}

export async function recalculateObjectiveAndParents(prisma: PrismaExecutor, objectiveId: string) {
  await recalculateObjectiveProgress(prisma, objectiveId);
}
