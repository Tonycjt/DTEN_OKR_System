-- Remove all objectives that use CHILD_OBJECTIVES progress source.
-- ObjectiveAssignment rows referencing them as parent cascade-delete automatically.
-- Child objectives' parentObjectiveId is set to NULL (SET NULL cascade).
DELETE FROM "Objective" WHERE "progressSource" = 'CHILD_OBJECTIVES';

-- Recreate ObjectiveProgressSource enum without CHILD_OBJECTIVES.
-- PostgreSQL does not support DROP VALUE, so rename + recreate + swap.
-- Must drop the column default before altering the type, then restore it.
ALTER TABLE "Objective" ALTER COLUMN "progressSource" DROP DEFAULT;
ALTER TYPE "ObjectiveProgressSource" RENAME TO "ObjectiveProgressSource_old";
CREATE TYPE "ObjectiveProgressSource" AS ENUM ('MANUAL', 'DIRECT_KRS');
ALTER TABLE "Objective"
  ALTER COLUMN "progressSource" TYPE "ObjectiveProgressSource"
  USING "progressSource"::text::"ObjectiveProgressSource";
ALTER TABLE "Objective" ALTER COLUMN "progressSource" SET DEFAULT 'MANUAL'::"ObjectiveProgressSource";
DROP TYPE "ObjectiveProgressSource_old";
