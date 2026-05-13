-- CreateEnum
CREATE TYPE "ObjectiveProgressMode" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "ObjectiveApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ObjectiveAssignmentAssigneeType" AS ENUM ('USER', 'TEAM', 'DEPARTMENT');

-- AlterTable
ALTER TABLE "Objective"
ADD COLUMN "progressMode" "ObjectiveProgressMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "approvalStatus" "ObjectiveApprovalStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "KeyResult"
ADD COLUMN "weightPercent" DOUBLE PRECISION NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "ObjectiveAssignment" (
    "id" TEXT NOT NULL,
    "parentObjectiveId" TEXT NOT NULL,
    "assignedObjectiveId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "assigneeType" "ObjectiveAssignmentAssigneeType" NOT NULL,
    "contributionPercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectiveAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObjectiveAssignment_parentObjectiveId_assignedObjectiveId_key" ON "ObjectiveAssignment"("parentObjectiveId", "assignedObjectiveId");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectiveAssignment_parentObjectiveId_assigneeType_assigneeId_key" ON "ObjectiveAssignment"("parentObjectiveId", "assigneeType", "assigneeId");

-- CreateIndex
CREATE INDEX "ObjectiveAssignment_parentObjectiveId_idx" ON "ObjectiveAssignment"("parentObjectiveId");

-- CreateIndex
CREATE INDEX "ObjectiveAssignment_assignedObjectiveId_idx" ON "ObjectiveAssignment"("assignedObjectiveId");

-- CreateIndex
CREATE INDEX "ObjectiveAssignment_assigneeType_assigneeId_idx" ON "ObjectiveAssignment"("assigneeType", "assigneeId");

-- AddForeignKey
ALTER TABLE "ObjectiveAssignment" ADD CONSTRAINT "ObjectiveAssignment_parentObjectiveId_fkey" FOREIGN KEY ("parentObjectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveAssignment" ADD CONSTRAINT "ObjectiveAssignment_assignedObjectiveId_fkey" FOREIGN KEY ("assignedObjectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
