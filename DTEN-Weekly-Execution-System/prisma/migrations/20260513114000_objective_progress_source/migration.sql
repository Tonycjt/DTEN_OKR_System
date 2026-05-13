-- CreateEnum
CREATE TYPE "ObjectiveProgressSource" AS ENUM ('MANUAL', 'DIRECT_KRS', 'CHILD_OBJECTIVES');

-- AlterTable
ALTER TABLE "Objective"
ADD COLUMN "progressSource" "ObjectiveProgressSource" NOT NULL DEFAULT 'MANUAL';

-- Migrate existing two-mode data to explicit single-source progress.
UPDATE "Objective"
SET "progressSource" = CASE
  WHEN "progressMode" = 'MANUAL' THEN 'MANUAL'::"ObjectiveProgressSource"
  WHEN EXISTS (
    SELECT 1
    FROM "ObjectiveAssignment"
    WHERE "ObjectiveAssignment"."parentObjectiveId" = "Objective"."id"
  ) THEN 'CHILD_OBJECTIVES'::"ObjectiveProgressSource"
  ELSE 'DIRECT_KRS'::"ObjectiveProgressSource"
END;

-- AlterTable
ALTER TABLE "Objective"
DROP COLUMN "progressMode";

-- DropEnum
DROP TYPE "ObjectiveProgressMode";
