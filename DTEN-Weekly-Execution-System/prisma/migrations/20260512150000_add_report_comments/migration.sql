ALTER TYPE "NotificationType" ADD VALUE 'REPORT_COMMENT';

ALTER TABLE "Comment" ALTER COLUMN "keyResultId" DROP NOT NULL;
ALTER TABLE "Comment" ADD COLUMN "weeklyReportId" TEXT;

CREATE INDEX "Comment_weeklyReportId_idx" ON "Comment"("weeklyReportId");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_weeklyReportId_fkey"
FOREIGN KEY ("weeklyReportId") REFERENCES "WeeklyReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
