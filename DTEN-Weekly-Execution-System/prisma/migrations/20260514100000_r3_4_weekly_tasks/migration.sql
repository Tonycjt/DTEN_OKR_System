-- CreateEnum
CREATE TYPE "WeeklyTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeeklyTaskSectionType" AS ENUM ('THIS_WEEK', 'NEXT_WEEK');

-- CreateTable
CREATE TABLE "WeeklyTask" (
    "id" TEXT NOT NULL,
    "weeklyReportId" TEXT NOT NULL,
    "sectionType" "WeeklyTaskSectionType" NOT NULL,
    "content" TEXT NOT NULL,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "WeeklyTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "blocker" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyTask_weeklyReportId_idx" ON "WeeklyTask"("weeklyReportId");

-- CreateIndex
CREATE INDEX "WeeklyTask_sectionType_idx" ON "WeeklyTask"("sectionType");

-- AddForeignKey
ALTER TABLE "WeeklyTask" ADD CONSTRAINT "WeeklyTask_weeklyReportId_fkey" FOREIGN KEY ("weeklyReportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
