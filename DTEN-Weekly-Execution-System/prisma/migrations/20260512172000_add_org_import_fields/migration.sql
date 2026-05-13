ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EXECUTIVE';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';

ALTER TABLE "User"
ADD COLUMN "localManagerId" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "office" TEXT,
ADD COLUMN "employeeId" TEXT,
ADD COLUMN "startDate" TIMESTAMP(3),
ADD COLUMN "avatarUrl" TEXT;

CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");
CREATE INDEX "User_localManagerId_idx" ON "User"("localManagerId");

ALTER TABLE "User"
ADD CONSTRAINT "User_localManagerId_fkey"
FOREIGN KEY ("localManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
