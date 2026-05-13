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
