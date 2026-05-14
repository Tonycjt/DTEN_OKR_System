-- R3.3: Weekly Planning vs Weekly Reporting
-- Adds userId, weekStartDate, carriedOverFromId to WeeklyPriority.
-- Makes weeklyReportId nullable (SetNull on report delete) so priorities
-- can exist before a WeeklyReport is created (standalone weekly plan).
-- Existing rows are backfilled from the joined WeeklyReport.

-- Step 1: add new columns as nullable first (needed for backfill)
ALTER TABLE "WeeklyPriority"
  ADD COLUMN "userId"           TEXT,
  ADD COLUMN "weekStartDate"    TIMESTAMP(3),
  ADD COLUMN "carriedOverFromId" TEXT;

-- Step 2: backfill userId and weekStartDate from the parent WeeklyReport
UPDATE "WeeklyPriority" wp
SET
  "userId"        = wr."userId",
  "weekStartDate" = wr."weekStart"
FROM "WeeklyReport" wr
WHERE wp."weeklyReportId" = wr."id";

-- Step 3: make the two new columns NOT NULL (all existing rows are now filled)
ALTER TABLE "WeeklyPriority"
  ALTER COLUMN "userId"        SET NOT NULL,
  ALTER COLUMN "weekStartDate" SET NOT NULL;

-- Step 4: make weeklyReportId nullable
ALTER TABLE "WeeklyPriority"
  ALTER COLUMN "weeklyReportId" DROP NOT NULL;

-- Step 5: replace Cascade FK on weeklyReportId with SetNull
ALTER TABLE "WeeklyPriority"
  DROP CONSTRAINT "WeeklyPriority_weeklyReportId_fkey";

ALTER TABLE "WeeklyPriority"
  ADD CONSTRAINT "WeeklyPriority_weeklyReportId_fkey"
  FOREIGN KEY ("weeklyReportId")
  REFERENCES "WeeklyReport"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: add FK for userId → User
ALTER TABLE "WeeklyPriority"
  ADD CONSTRAINT "WeeklyPriority_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: add self-referential FK for carry-over
ALTER TABLE "WeeklyPriority"
  ADD CONSTRAINT "WeeklyPriority_carriedOverFromId_fkey"
  FOREIGN KEY ("carriedOverFromId")
  REFERENCES "WeeklyPriority"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 8: add new indexes
CREATE INDEX "WeeklyPriority_userId_weekStartDate_idx"
  ON "WeeklyPriority"("userId", "weekStartDate");

CREATE INDEX "WeeklyPriority_carriedOverFromId_idx"
  ON "WeeklyPriority"("carriedOverFromId");
