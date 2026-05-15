-- DropForeignKey
ALTER TABLE "KeyResult" DROP CONSTRAINT "KeyResult_ownerId_fkey";

-- AlterTable
ALTER TABLE "KeyResult" ALTER COLUMN "ownerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
