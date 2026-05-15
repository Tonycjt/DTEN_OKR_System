-- R3.4 Monthly Target Text Redesign
-- Replace numeric targetValue/targetPercent columns with a text title field.
-- KR owners now describe their monthly goals as text rather than numeric percentages.

ALTER TABLE "MonthlyTarget" DROP COLUMN IF EXISTS "targetValue";
ALTER TABLE "MonthlyTarget" DROP COLUMN IF EXISTS "targetPercent";
ALTER TABLE "MonthlyTarget" ADD COLUMN "title" TEXT;
