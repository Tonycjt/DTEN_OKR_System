-- Add delegated review ownership for Release 2.
ALTER TABLE "User" ADD COLUMN "reviewOwnerId" TEXT;

-- Existing users default to their primary manager as the review owner.
UPDATE "User"
SET "reviewOwnerId" = "managerId"
WHERE "reviewOwnerId" IS NULL
  AND "managerId" IS NOT NULL;

CREATE INDEX "User_reviewOwnerId_idx" ON "User"("reviewOwnerId");

ALTER TABLE "User" ADD CONSTRAINT "User_reviewOwnerId_fkey"
FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
