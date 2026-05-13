-- CreateEnum
CREATE TYPE "ObjectiveAssignmentMode" AS ENUM ('CONTRIBUTION_ONLY', 'PREDEFINED_CHILD_OBJECTIVE');

-- CreateEnum
CREATE TYPE "ObjectiveAssignmentStatus" AS ENUM ('PENDING_PROPOSAL', 'PENDING_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'REJECTED', 'ACTIVE');

-- AlterEnum: add new NotificationType values
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_PROPOSAL_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_PROPOSAL_REVIEWED';

-- AlterTable: add new columns to ObjectiveAssignment
ALTER TABLE "ObjectiveAssignment"
  ADD COLUMN "assignmentMode"        "ObjectiveAssignmentMode"   NOT NULL DEFAULT 'CONTRIBUTION_ONLY',
  ADD COLUMN "assignmentInstruction" TEXT,
  ADD COLUMN "status"                "ObjectiveAssignmentStatus" NOT NULL DEFAULT 'PENDING_PROPOSAL',
  ADD COLUMN "createdById"           TEXT,
  ADD COLUMN "approvedById"          TEXT,
  ADD COLUMN "approvedAt"            TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ObjectiveAssignment"
  ADD CONSTRAINT "ObjectiveAssignment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveAssignment"
  ADD CONSTRAINT "ObjectiveAssignment_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ObjectiveAssignment_status_idx" ON "ObjectiveAssignment"("status");

-- CreateIndex
CREATE INDEX "ObjectiveAssignment_createdById_idx" ON "ObjectiveAssignment"("createdById");

-- CreateIndex
CREATE INDEX "ObjectiveAssignment_approvedById_idx" ON "ObjectiveAssignment"("approvedById");
