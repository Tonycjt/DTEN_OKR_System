CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

CREATE TYPE "FollowUpSourceType" AS ENUM ('KEY_RESULT', 'WEEKLY_REPORT', 'MANAGER_REVIEW');

ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_ASSIGNED';

CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "sourceObjectType" "FollowUpSourceType" NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FollowUp_sourceObjectType_sourceObjectId_idx" ON "FollowUp"("sourceObjectType", "sourceObjectId");
CREATE INDEX "FollowUp_ownerId_idx" ON "FollowUp"("ownerId");
CREATE INDEX "FollowUp_assignedById_idx" ON "FollowUp"("assignedById");
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");
CREATE INDEX "FollowUp_dueDate_idx" ON "FollowUp"("dueDate");

ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_assignedById_fkey"
FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
